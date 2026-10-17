import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Timetable } from './timetable';
import type { MetrolinkData } from './types';

// Built by scripts/build-data.ts before `next build`; bundled into the functions
// through outputFileTracingIncludes in next.config.mjs.
const DATA_FILE = path.join(process.cwd(), 'data', 'metrolink.json');

let cached: Promise<Timetable> | undefined;

export function getTimetable(): Promise<Timetable> {
  cached ??= readFile(DATA_FILE, 'utf8')
    .then((raw) => new Timetable(JSON.parse(raw) as MetrolinkData))
    .catch((err) => {
      cached = undefined;
      throw err;
    });
  return cached;
}
