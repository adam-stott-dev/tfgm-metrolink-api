import { json, withTimetable } from '@/lib/api/respond';

// Public health check: no API key needed (see proxy.ts).
export async function GET() {
  return withTimetable((tt) =>
    json({
      status: 'ok',
      realtime: false,
      timetable: {
        generatedAt: tt.data.generatedAt,
        feedVersion: tt.data.feedInfo.version,
        validFrom: tt.data.feedInfo.start,
        validTo: tt.data.feedInfo.end,
        stops: tt.data.stops.length,
        routes: tt.data.routes.length,
        trips: tt.data.trips.length,
      },
    }),
  );
}
