import { json, withTimetable } from '@/lib/api/respond';

export async function GET() {
  return withTimetable((tt) => {
    const routes = tt.data.routes.map((r) => tt.routeSummary(r));
    return json({ count: routes.length, routes }, { cacheSeconds: 3600 });
  });
}
