import { errorResponse, json, withTimetable } from '@/lib/api/respond';

export async function GET(_req: Request, ctx: RouteContext<'/api/v1/routes/[route]'>) {
  const { route: routeId } = await ctx.params;

  return withTimetable((tt) => {
    const route = tt.findRoute(decodeURIComponent(routeId));
    if (!route) return errorResponse(404, 'route_not_found', `No Metrolink route matches "${routeId}".`);

    return json({ ...tt.routeSummary(route), patterns: tt.routePatterns(route) }, { cacheSeconds: 3600 });
  });
}
