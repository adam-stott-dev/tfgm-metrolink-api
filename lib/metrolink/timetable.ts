import { VISIT_WIDTH, type DataRoute, type DataStop, type MetrolinkData } from './types';
import { formatDate, formatLocalIso, localToInstant, shiftDate, toLocalParts, weekday } from './time';

export interface RouteSummary {
  id: string;
  mode: 'tram' | 'bus';
  name: string;
  longName: string;
  color: string | null;
  textColor: string | null;
}

export interface StopSummary {
  id: string;
  name: string;
  lat: number;
  lon: number;
  routes: string[];
  distanceMetres?: number;
}

export interface Departure {
  tripId: string;
  route: RouteSummary;
  destination: string;
  platform: { id: string; code: string | null };
  serviceDate: string;
  scheduledArrival: string;
  scheduledDeparture: string;
  minutesUntilDeparture: number;
}

interface Visit {
  trip: number;
  /** offset of this visit inside trip.times */
  offset: number;
}

export class Timetable {
  private readonly stopById = new Map<string, number>();
  private readonly routeById = new Map<string, number>();
  private readonly visitsByStop: Visit[][];
  private readonly routesByStop: Set<number>[];

  constructor(readonly data: MetrolinkData) {
    data.stops.forEach((s, i) => {
      this.stopById.set(s.id, i);
      for (const p of s.platforms) this.stopById.set(p.gtfsId.toLowerCase(), i);
    });
    data.routes.forEach((r, i) => {
      // "purple-line", "purple" and any of the line's GTFS route_ids all work.
      this.routeById.set(r.id, i);
      this.routeById.set(r.id.replace(/-line$/, ''), i);
      for (const g of r.gtfsIds) this.routeById.set(g.toLowerCase(), i);
    });

    this.visitsByStop = data.stops.map(() => []);
    this.routesByStop = data.stops.map(() => new Set());
    data.trips.forEach((trip, t) => {
      const last = trip.times.length - VISIT_WIDTH;
      for (let o = 0; o <= last; o += VISIT_WIDTH) {
        const stop = trip.times[o];
        this.routesByStop[stop].add(trip.route);
        // A tram's final stop is an arrival only, so it is not a departure from there.
        if (o !== last) this.visitsByStop[stop].push({ trip: t, offset: o });
      }
    });
  }

  findStop(id: string): DataStop | undefined {
    const i = this.stopById.get(id.toLowerCase());
    return i === undefined ? undefined : this.data.stops[i];
  }

  findRoute(id: string): DataRoute | undefined {
    const key = id.toLowerCase();
    const i = this.routeById.get(key) ?? this.routeById.get(slug(key));
    return i === undefined ? undefined : this.data.routes[i];
  }

  routeSummary(route: DataRoute): RouteSummary {
    return {
      id: route.id,
      mode: route.mode,
      name: route.shortName,
      longName: route.longName,
      color: route.color,
      textColor: route.textColor,
    };
  }

  stopSummary(stop: DataStop): StopSummary {
    const i = this.stopById.get(stop.id)!;
    return {
      id: stop.id,
      name: stop.name,
      lat: stop.lat,
      lon: stop.lon,
      routes: [...this.routesByStop[i]].map((r) => this.data.routes[r].id),
    };
  }

  listStops(opts: { q?: string; near?: { lat: number; lon: number }; limit?: number }): StopSummary[] {
    let list = this.data.stops.map((s) => this.stopSummary(s));
    if (opts.q) {
      const q = opts.q.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(slug(q)));
    }
    if (opts.near) {
      const { lat, lon } = opts.near;
      list = list
        .map((s) => ({ ...s, distanceMetres: Math.round(haversine(lat, lon, s.lat, s.lon)) }))
        .sort((a, b) => a.distanceMetres - b.distanceMetres);
    }
    return opts.limit ? list.slice(0, opts.limit) : list;
  }

  isServiceActive(serviceId: string, date: string): boolean {
    const s = this.data.services[serviceId];
    if (!s) return false;
    if (s.removed.includes(date)) return false;
    if (s.added.includes(date)) return true;
    return date >= s.start && date <= s.end && s.days[weekday(date)];
  }

  departures(
    stop: DataStop,
    opts: { from: Date; limit: number; route?: DataRoute; withinMinutes?: number },
  ): Departure[] {
    const stopIdx = this.stopById.get(stop.id)!;
    const routeIdx = opts.route ? this.data.routes.indexOf(opts.route) : -1;
    const fromMs = opts.from.getTime();
    const untilMs = fromMs + (opts.withinMinutes ?? 24 * 60) * 60_000;
    const today = toLocalParts(opts.from).date;

    const found: { at: number; dep: Departure }[] = [];
    // The feed repeats some trips under overlapping service calendars; show each tram once.
    const seen = new Set<string>();
    // Yesterday's service day can run past midnight (times beyond 24:00:00).
    for (const serviceDate of [shiftDate(today, -1), today, shiftDate(today, 1)]) {
      const active = new Map<string, boolean>();
      for (const v of this.visitsByStop[stopIdx]) {
        const trip = this.data.trips[v.trip];
        if (routeIdx >= 0 && trip.route !== routeIdx) continue;
        let on = active.get(trip.service);
        if (on === undefined) active.set(trip.service, (on = this.isServiceActive(trip.service, serviceDate)));
        if (!on) continue;

        const depart = localToInstant(serviceDate, trip.times[v.offset + 3]);
        const at = depart.getTime();
        if (at < fromMs || at > untilMs) continue;

        const platformIdx = trip.times[v.offset + 1];
        const key = `${trip.route}|${platformIdx}|${at}|${trip.headsign}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const route = this.data.routes[trip.route];
        const platform = stop.platforms[platformIdx];
        found.push({
          at,
          dep: {
            tripId: trip.id,
            route: this.routeSummary(route),
            destination: trip.headsign,
            platform: { id: platform.gtfsId, code: platform.code },
            serviceDate: formatDate(serviceDate),
            scheduledArrival: formatLocalIso(localToInstant(serviceDate, trip.times[v.offset + 2])),
            scheduledDeparture: formatLocalIso(depart),
            minutesUntilDeparture: Math.floor((at - fromMs) / 60_000),
          },
        });
      }
    }

    found.sort((a, b) => a.at - b.at);
    return found.slice(0, opts.limit).map((f) => f.dep);
  }

  /** Ordered stop lists for each direction, taken from the trip that calls at the most stops. */
  routePatterns(route: DataRoute): { direction: number | null; destination: string; stops: StopSummary[] }[] {
    const routeIdx = this.data.routes.indexOf(route);
    const best = new Map<string, number>();
    this.data.trips.forEach((trip, t) => {
      if (trip.route !== routeIdx) return;
      const key = String(trip.direction ?? trip.headsign);
      const current = best.get(key);
      if (current === undefined || this.data.trips[current].times.length < trip.times.length) best.set(key, t);
    });

    return [...best.values()].map((t) => {
      const trip = this.data.trips[t];
      const stops: StopSummary[] = [];
      for (let o = 0; o < trip.times.length; o += VISIT_WIDTH) {
        stops.push(this.stopSummary(this.data.stops[trip.times[o]]));
      }
      return { direction: trip.direction, destination: trip.headsign, stops };
    });
  }
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
