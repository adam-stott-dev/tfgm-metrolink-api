import type { NextRequest } from 'next/server';
import { errorResponse, floatParam, intParam, json, withTimetable } from '@/lib/api/respond';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get('q')?.trim() || undefined;
  const lat = floatParam(params.get('lat'));
  const lon = floatParam(params.get('lon'));
  const limit = intParam(params.get('limit'), 0, 1, 500);

  if (lat === null || lon === null) return errorResponse(400, 'invalid_parameter', '`lat` and `lon` must be numbers.');
  if ((lat === undefined) !== (lon === undefined))
    return errorResponse(400, 'invalid_parameter', '`lat` and `lon` must be given together.');
  if (limit === null) return errorResponse(400, 'invalid_parameter', '`limit` must be an integer from 1 to 500.');

  return withTimetable((tt) => {
    const near = lat !== undefined && lon !== undefined ? { lat, lon } : undefined;
    const stops = tt.listStops({ q, near, limit: limit || undefined });
    return json({ count: stops.length, stops }, { cacheSeconds: 3600 });
  });
}
