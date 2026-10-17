/**
 * Downloads the Greater Manchester GTFS timetable, keeps only Metrolink (tram) services
 * and writes a compact data/metrolink.json that the API loads at runtime.
 *
 * Env:
 *   GTFS_FILE  path to a local GTFS zip (skips the download, used for tests/offline work)
 *   GTFS_URL   override the download URL
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import type { DataPlatform, DataRoute, DataService, DataStop, DataTrip, MetrolinkData } from '../lib/metrolink/types';

const DEFAULT_GTFS_URL = 'https://odata.tfgm.com/opendata/downloads/TfGMgtfsnew.zip';
const OUTPUT = path.join(process.cwd(), 'data', 'metrolink.json');

// GTFS route_type 0 is tram; 900-906 are the extended tram types.
const TRAM_ROUTE_TYPES = new Set([0, 900, 901, 902, 903, 904, 905, 906]);

type Row = Record<string, string>;

async function loadZip(): Promise<Uint8Array> {
  const file = process.env.GTFS_FILE;
  if (file) {
    console.log(`Reading GTFS from ${file}`);
    return new Uint8Array(await readFile(file));
  }

  const url = process.env.GTFS_URL || DEFAULT_GTFS_URL;
  console.log(`Downloading GTFS from ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GTFS download failed: HTTP ${res.status} ${res.statusText}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  console.log(`Downloaded ${(buf.byteLength / 1024 / 1024).toFixed(1)} MB`);
  return buf;
}

/** Decompress a single file from the zip, matching by basename so nested folders still work. */
function extract(zip: Uint8Array, name: string, required = true): Uint8Array | null {
  const files = unzipSync(zip, { filter: (f) => path.posix.basename(f.name) === name });
  const entry = Object.values(files)[0];
  if (!entry && required) throw new Error(`GTFS zip is missing ${name}`);
  return entry ?? null;
}

/** Split a CSV line, honouring quoted fields. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out;
}

/**
 * Iterate over CSV rows without materialising the whole file as one string;
 * the GM stop_times.txt (buses included) is too big for a single JS string.
 */
function* rows(bytes: Uint8Array): Generator<Row> {
  const decoder = new TextDecoder('utf-8');
  const CHUNK = 8 * 1024 * 1024;
  let header: string[] | null = null;
  let rest = '';

  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const end = Math.min(offset + CHUNK, bytes.length);
    const text = rest + decoder.decode(bytes.subarray(offset, end), { stream: end < bytes.length });
    const lines = text.split(/\r?\n/);
    rest = lines.pop() ?? '';
    for (const line of lines) {
      const row = toRow(line);
      if (row) yield row;
    }
  }
  const last = toRow(rest);
  if (last) yield last;

  function toRow(line: string): Row | null {
    if (!line.trim()) return null;
    const values = parseCsvLine(line);
    if (!header) {
      header = values.map((h) => h.trim().replace(/^﻿/, ''));
      return null;
    }
    const row: Row = {};
    header.forEach((h, i) => (row[h] = (values[i] ?? '').trim()));
    return row;
  }
}

function parseTime(value: string): number | null {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** "Piccadilly (Manchester Metrolink)" -> "Piccadilly" */
export function cleanStopName(name: string): string {
  return name
    .replace(/\((?:[^)]*metrolink[^)]*|platform[^)]*|stop [a-z0-9]+)\)/gi, '')
    .replace(/\b(?:manchester\s+)?metrolink(?:\s+stop)?\b/gi, '')
    .replace(/\btram\s+stop\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,–-]+$/g, '')
    .trim();
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function buildData(zip: Uint8Array, source: string): Promise<MetrolinkData> {
  // Agencies: anything branded Metrolink counts even if its route_type is unusual.
  const metrolinkAgencies = new Set<string>();
  for (const a of rows(extract(zip, 'agency.txt')!)) {
    if (/metrolink/i.test(a.agency_name ?? '')) metrolinkAgencies.add(a.agency_id ?? '');
  }

  // Merge GTFS routes into lines by mode + name ("Purple Line" appears once per pattern).
  const routes: DataRoute[] = [];
  const routeIndex = new Map<string, number>();
  const lineIndex = new Map<string, number>();
  const longNameOf = new Map<string, string>();
  for (const r of rows(extract(zip, 'routes.txt')!)) {
    const isTram = TRAM_ROUTE_TYPES.has(Number(r.route_type));
    if (!isTram && !metrolinkAgencies.has(r.agency_id ?? '')) continue;
    const shortName = r.route_short_name || r.route_long_name || r.route_id;
    // TfGM tags rail replacement buses as trams (route_type 0), so the name decides too.
    const mode: DataRoute['mode'] = isTram && !/\bbus\b/i.test(shortName) ? 'tram' : 'bus';
    const id = slugify(shortName);
    const key = `${mode}:${id}`;
    let idx = lineIndex.get(key);
    if (idx === undefined) {
      idx = routes.length;
      lineIndex.set(key, idx);
      routes.push({
        // Keep ids unique if a bus and a tram line ever share a name.
        id: routes.some((x) => x.id === id) ? `${id}-${mode}` : id,
        gtfsIds: [],
        mode,
        shortName,
        longName: r.route_long_name || shortName,
        color: r.route_color ? `#${r.route_color}` : null,
        textColor: r.route_text_color ? `#${r.route_text_color}` : null,
      });
    }
    routes[idx].gtfsIds.push(r.route_id);
    routes[idx].color ??= r.route_color ? `#${r.route_color}` : null;
    routes[idx].textColor ??= r.route_text_color ? `#${r.route_text_color}` : null;
    if (r.route_long_name) longNameOf.set(r.route_id, r.route_long_name);
    routeIndex.set(r.route_id, idx);
  }
  if (routes.length === 0) throw new Error('No Metrolink routes found in the GTFS feed');
  console.log(`Routes: ${routes.length}`);

  const trips = new Map<string, DataTrip & { visits: [string, number, number, number][] }>();
  const tripCounts = new Map<string, number>();
  for (const t of rows(extract(zip, 'trips.txt')!)) {
    const route = routeIndex.get(t.route_id);
    if (route === undefined) continue;
    tripCounts.set(t.route_id, (tripCounts.get(t.route_id) ?? 0) + 1);
    trips.set(t.trip_id, {
      id: t.trip_id,
      route,
      service: t.service_id,
      headsign: cleanStopName(t.trip_headsign ?? ''),
      direction: t.direction_id === '' || t.direction_id === undefined ? null : Number(t.direction_id),
      times: [],
      visits: [],
    });
  }
  console.log(`Trips: ${trips.size}`);

  // Describe each line by its busiest pattern, e.g. "Altrincham - Etihad Campus" rather than a short working.
  for (const route of routes) {
    const busiest = [...route.gtfsIds].sort((a, b) => (tripCounts.get(b) ?? 0) - (tripCounts.get(a) ?? 0))[0];
    route.longName = longNameOf.get(busiest) ?? route.longName;
  }

  const usedStopIds = new Set<string>();
  for (const st of rows(extract(zip, 'stop_times.txt')!)) {
    const trip = trips.get(st.trip_id);
    if (!trip) continue;
    const arr = parseTime(st.arrival_time) ?? parseTime(st.departure_time);
    const dep = parseTime(st.departure_time) ?? arr;
    if (arr === null || dep === null) continue; // untimed stop
    trip.visits.push([st.stop_id, Number(st.stop_sequence), arr, dep]);
    usedStopIds.add(st.stop_id);
  }

  // Group platforms into stops: by parent_station when the feed has one, otherwise by cleaned name.
  const allStops = new Map<string, Row>();
  for (const s of rows(extract(zip, 'stops.txt')!)) allStops.set(s.stop_id, s);

  const groups = new Map<string, { name: string; platforms: DataPlatform[] }>();
  const platformLookup = new Map<string, { group: string; platform: number }>();
  for (const id of usedStopIds) {
    const s = allStops.get(id);
    if (!s) continue;
    const parent = s.parent_station ? allStops.get(s.parent_station) : undefined;
    const name = cleanStopName(parent?.stop_name || s.stop_name);
    const key = slugify(name);
    const group = groups.get(key) ?? { name, platforms: [] };
    groups.set(key, group);
    platformLookup.set(id, { group: key, platform: group.platforms.length });
    group.platforms.push({
      gtfsId: id,
      name: s.stop_name,
      code: s.platform_code || null,
      lat: Number(s.stop_lat),
      lon: Number(s.stop_lon),
    });
  }

  const sortedKeys = [...groups.keys()].sort();
  const stops: DataStop[] = sortedKeys.map((key) => {
    const g = groups.get(key)!;
    const lat = g.platforms.reduce((a, p) => a + p.lat, 0) / g.platforms.length;
    const lon = g.platforms.reduce((a, p) => a + p.lon, 0) / g.platforms.length;
    return { id: key, name: g.name, lat: round(lat), lon: round(lon), platforms: g.platforms };
  });
  const stopIndex = new Map(sortedKeys.map((k, i) => [k, i]));
  console.log(`Stops: ${stops.length} (${usedStopIds.size} platforms)`);

  const outTrips: DataTrip[] = [];
  const usedServices = new Set<string>();
  for (const trip of trips.values()) {
    if (trip.visits.length < 2) continue;
    trip.visits.sort((a, b) => a[1] - b[1]);
    for (const [stopId, , arr, dep] of trip.visits) {
      const loc = platformLookup.get(stopId);
      if (!loc) continue;
      trip.times.push(stopIndex.get(loc.group)!, loc.platform, arr, dep);
    }
    if (!trip.headsign) {
      const lastStop = trip.times[trip.times.length - 4];
      trip.headsign = stops[lastStop].name;
    }
    usedServices.add(trip.service);
    const { visits: _visits, ...rest } = trip;
    outTrips.push(rest);
  }

  const services: Record<string, DataService> = {};
  const service = (id: string) =>
    (services[id] ??= {
      days: [false, false, false, false, false, false, false],
      start: '00000000',
      end: '00000000',
      added: [],
      removed: [],
    });
  const calendar = extract(zip, 'calendar.txt', false);
  if (calendar) {
    for (const c of rows(calendar)) {
      if (!usedServices.has(c.service_id)) continue;
      const s = service(c.service_id);
      s.days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(
        (d) => c[d] === '1',
      ) as DataService['days'];
      s.start = c.start_date;
      s.end = c.end_date;
    }
  }
  const calendarDates = extract(zip, 'calendar_dates.txt', false);
  if (calendarDates) {
    for (const c of rows(calendarDates)) {
      if (!usedServices.has(c.service_id)) continue;
      const s = service(c.service_id);
      (c.exception_type === '1' ? s.added : s.removed).push(c.date);
    }
  }

  let feedInfo: MetrolinkData['feedInfo'] = { publisher: null, version: null, start: null, end: null };
  const feedInfoFile = extract(zip, 'feed_info.txt', false);
  if (feedInfoFile) {
    for (const f of rows(feedInfoFile)) {
      feedInfo = {
        publisher: f.feed_publisher_name || null,
        version: f.feed_version || null,
        start: f.feed_start_date || null,
        end: f.feed_end_date || null,
      };
      break;
    }
  }

  console.log(`Kept ${outTrips.length} trips across ${Object.keys(services).length} service calendars`);
  return {
    generatedAt: new Date().toISOString(),
    source,
    feedInfo,
    stops,
    routes,
    services,
    trips: outTrips,
  };
}

function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

async function main() {
  const zip = await loadZip();
  const data = await buildData(zip, process.env.GTFS_FILE ? 'local file' : process.env.GTFS_URL || DEFAULT_GTFS_URL);
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(data));
  console.log(`Wrote ${OUTPUT}`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
