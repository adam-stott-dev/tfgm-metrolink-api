import { NextResponse } from 'next/server';
import { getTimetable } from '@/lib/metrolink/data';
import type { Timetable } from '@/lib/metrolink/timetable';

export interface ApiError {
  error: { code: string; message: string };
}

export function errorResponse(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json<ApiError>({ error: { code, message } }, { status, headers });
}

export function json<T>(data: T, init?: { cacheSeconds?: number }) {
  const maxAge = init?.cacheSeconds ?? 0;
  return NextResponse.json(data, {
    headers: {
      // Responses depend on the API key only for rate limiting, so a short private cache is safe.
      'Cache-Control': maxAge > 0 ? `private, max-age=${maxAge}` : 'no-store',
    },
  });
}

/** Run a handler with the timetable loaded, turning thrown errors into JSON 500s. */
export async function withTimetable(handler: (tt: Timetable) => Response | Promise<Response>) {
  try {
    return await handler(await getTimetable());
  } catch (err) {
    console.error(err);
    return errorResponse(500, 'internal_error', 'Something went wrong while reading the timetable.');
  }
}

export function intParam(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export function floatParam(value: string | null): number | null | undefined {
  if (value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
