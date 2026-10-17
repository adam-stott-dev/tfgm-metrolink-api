import type { NextRequest } from 'next/server';
import { errorResponse, intParam, json, withTimetable } from '@/lib/api/respond';
import { formatLocalIso } from '@/lib/metrolink/time';

export async function GET(req: NextRequest, ctx: RouteContext<'/api/v1/stops/[stop]/departures'>) {
  const { stop: stopId } = await ctx.params;
  const params = req.nextUrl.searchParams;

  const limit = intParam(params.get('limit'), 10, 1, 100);
  if (limit === null) return errorResponse(400, 'invalid_parameter', '`limit` must be an integer from 1 to 100.');

  const within = intParam(params.get('within'), 120, 1, 1440);
  if (within === null) return errorResponse(400, 'invalid_parameter', '`within` must be minutes from 1 to 1440.');

  let from = new Date();
  const at = params.get('at');
  if (at) {
    from = new Date(at);
    if (Number.isNaN(from.getTime()))
      return errorResponse(400, 'invalid_parameter', '`at` must be an ISO 8601 date-time, e.g. 2026-10-17T08:00:00+01:00.');
  }

  return withTimetable((tt) => {
    const stop = tt.findStop(decodeURIComponent(stopId));
    if (!stop) return errorResponse(404, 'stop_not_found', `No Metrolink stop matches "${stopId}".`);

    const routeParam = params.get('route');
    const route = routeParam ? tt.findRoute(routeParam) : undefined;
    if (routeParam && !route) return errorResponse(404, 'route_not_found', `No Metrolink route matches "${routeParam}".`);

    const departures = tt.departures(stop, { from, limit, route, withinMinutes: within });
    return json({
      stop: { id: stop.id, name: stop.name },
      from: formatLocalIso(from),
      realtime: false,
      departures,
    });
  });
}
