import { errorResponse, json, withTimetable } from '@/lib/api/respond';

export async function GET(_req: Request, ctx: RouteContext<'/api/v1/stops/[stop]'>) {
  const { stop: stopId } = await ctx.params;

  return withTimetable((tt) => {
    const stop = tt.findStop(decodeURIComponent(stopId));
    if (!stop) return errorResponse(404, 'stop_not_found', `No Metrolink stop matches "${stopId}".`);

    return json(
      {
        ...tt.stopSummary(stop),
        platforms: stop.platforms.map((p) => ({ id: p.gtfsId, name: p.name, code: p.code, lat: p.lat, lon: p.lon })),
      },
      { cacheSeconds: 3600 },
    );
  });
}
