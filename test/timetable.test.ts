import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';
import { buildData, cleanStopName } from '../scripts/build-data';
import { Timetable } from '../lib/metrolink/timetable';
import { localToInstant, formatLocalIso } from '../lib/metrolink/time';
import { parseKeys } from '../lib/api/auth';

const fixtureDir = path.join(import.meta.dirname, 'fixtures', 'gtfs');

async function loadFixture() {
  const files: Record<string, Uint8Array> = {};
  for (const name of readdirSync(fixtureDir)) files[name] = new Uint8Array(readFileSync(path.join(fixtureDir, name)));
  const data = await buildData(zipSync(files), 'fixture');
  return new Timetable(data);
}

test('keeps Metrolink routes, merging them into lines', async () => {
  const tt = await loadFixture();
  assert.deepEqual(
    tt.data.routes.map((r) => [r.id, r.mode, r.gtfsIds]),
    [
      ['purple-line', 'tram', ['PURP', 'PURP2']],
      ['replacement-bus', 'bus', ['RB1']],
    ],
  );
  // Long name comes from the busiest pattern
  assert.equal(tt.findRoute('purple')!.longName, 'Etihad Campus - Piccadilly');
  assert.equal(tt.findRoute('PURP2')!.id, 'purple-line');
});

test('groups platforms into stops', async () => {
  const tt = await loadFixture();
  assert.deepEqual(
    tt.data.stops.map((s) => s.id),
    ['etihad-campus', 'new-islington', 'piccadilly'],
  );
  assert.equal(tt.findStop('piccadilly')!.platforms.length, 2);
  assert.equal(tt.findStop('9400ZZMAPIC2')!.id, 'piccadilly');
});

test('cleans stop names', () => {
  assert.equal(cleanStopName('Piccadilly (Manchester Metrolink)'), 'Piccadilly');
  assert.equal(cleanStopName('Market Street Metrolink Stop'), 'Market Street');
  assert.equal(cleanStopName('Exchange Square Tram Stop'), 'Exchange Square');
});

test('weekday departures, de-duplicated and excluding the terminating stop', async () => {
  const tt = await loadFixture();
  // Friday 16 Oct 2026, 07:55 BST
  const from = new Date('2026-10-16T07:55:00+01:00');
  const deps = tt.departures(tt.findStop('piccadilly')!, { from, limit: 10, withinMinutes: 60 });
  assert.equal(deps.length, 1);
  assert.equal(deps[0].tripId, 'T1');
  assert.equal(deps[0].scheduledDeparture, '2026-10-16T08:00:00+01:00');
  assert.equal(deps[0].minutesUntilDeparture, 5);
  assert.equal(deps[0].platform.code, 'A');
  assert.equal(deps[0].destination, 'Etihad Campus');

  // T2 terminates at Piccadilly, so Etihad Campus has no departures that end there
  const etihad = tt.departures(tt.findStop('etihad-campus')!, { from, limit: 10, withinMinutes: 60 });
  assert.deepEqual(
    etihad.map((d) => d.tripId),
    ['T2'],
  );
});

test('after-midnight trips belong to the previous service day', async () => {
  const tt = await loadFixture();
  // T3 runs on Friday's service at 24:10, i.e. Saturday 00:10
  const from = new Date('2026-10-17T00:05:00+01:00');
  const deps = tt.departures(tt.findStop('piccadilly')!, { from, limit: 5, withinMinutes: 30 });
  assert.equal(deps[0]?.tripId, 'T3');
  assert.equal(deps[0].serviceDate, '2026-10-16');
  assert.equal(deps[0].scheduledDeparture, '2026-10-17T00:10:00+01:00');
});

test('calendar_dates exceptions swap services', async () => {
  const tt = await loadFixture();
  // Monday 19 Oct 2026: the WK service is removed and SAT added; WK2 still runs
  const from = new Date('2026-10-19T07:00:00+01:00');
  const deps = tt.departures(tt.findStop('piccadilly')!, { from, limit: 10, withinMinutes: 180 });
  assert.deepEqual(
    deps.map((d) => d.tripId),
    ['T1DUP', 'T4'],
  );
});

test('route filter and route patterns', async () => {
  const tt = await loadFixture();
  const from = new Date('2026-10-16T07:00:00+01:00');
  const route = tt.findRoute('purple-line')!;
  assert.equal(tt.departures(tt.findStop('new-islington')!, { from, limit: 10, route }).length >= 2, true);
  const patterns = tt.routePatterns(route);
  assert.equal(patterns.length, 2);
  assert.deepEqual(
    patterns.find((p) => p.direction === 0)!.stops.map((s) => s.id),
    ['piccadilly', 'new-islington', 'etihad-campus'],
  );
});

test('nearby stops are sorted by distance', async () => {
  const tt = await loadFixture();
  const stops = tt.listStops({ near: { lat: 53.4856, lon: -2.2015 }, limit: 2 });
  assert.equal(stops[0].id, 'etihad-campus');
  assert.ok(stops[0].distanceMetres! < 50);
});

test('local time conversion across the October clock change', () => {
  // 25 Oct 2026: clocks go back at 02:00 BST -> 01:00 GMT
  assert.equal(formatLocalIso(localToInstant('20261024', 12 * 3600)), '2026-10-24T12:00:00+01:00');
  assert.equal(formatLocalIso(localToInstant('20261025', 12 * 3600)), '2026-10-25T12:00:00+00:00');
  assert.equal(formatLocalIso(localToInstant('20261025', 25 * 3600)), '2026-10-26T01:00:00+00:00');
});

test('parses API keys with optional per-key limits', () => {
  const keys = parseKeys(' abc , partner:600,,bad:x');
  assert.equal(keys.get('abc')!.perMinute, 60);
  assert.equal(keys.get('partner')!.perMinute, 600);
  assert.equal(keys.get('bad')!.perMinute, 60);
  assert.equal(keys.size, 3);
});
