import { errorResponse, json } from '@/lib/api/respond';

// Called nightly by Vercel Cron (vercel.json). Triggers a Deploy Hook so the build
// downloads the latest GTFS timetable.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return errorResponse(401, 'unauthorized', 'Invalid cron secret.');
  }

  const hook = process.env.DEPLOY_HOOK_URL;
  if (!hook) return errorResponse(500, 'not_configured', 'DEPLOY_HOOK_URL is not set.');

  const res = await fetch(hook, { method: 'POST' });
  if (!res.ok) return errorResponse(502, 'deploy_hook_failed', `Deploy hook returned HTTP ${res.status}.`);
  return json({ triggered: true });
}
