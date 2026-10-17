# tfgm-metrolink-api

A REST API for scheduled Manchester Metrolink tram times, with a landing page and
interactive docs, deployed as one Next.js app on Vercel.

Data comes from TfGM's published GTFS timetable
([GM Public Transport Schedules](https://ckan.publishing.service.gov.uk/dataset/gm-public-transport-schedules-gtfs), ODbL 1.0),
filtered to Metrolink at build time. It does not use the TfGM live departures API, so times
are **scheduled, not live**.

## Endpoints

All under `/api/v1`, authenticated with an `X-API-Key` header (except `status`).

| Endpoint | Description |
| --- | --- |
| `GET /stops?q=&lat=&lon=&limit=` | List or search stops, optionally sorted by distance |
| `GET /stops/{stop}` | A stop with its platforms and routes |
| `GET /stops/{stop}/departures?limit=&within=&route=&at=` | Next scheduled departures |
| `GET /routes` | All routes |
| `GET /routes/{route}` | A route with its stops in order for each direction |
| `GET /status` | Health and timetable version (public) |

The full reference with a playground lives at `/docs` once deployed; the spec is `openapi.json`.

## How it fits together

| Path | What it does |
| --- | --- |
| `scripts/build-data.ts` | Downloads the GTFS zip, keeps tram routes, writes `data/metrolink.json` (runs before `next build`) |
| `lib/metrolink/` | Loads the data and answers queries (departures, nearby stops, route patterns, UK time handling) |
| `app/api/v1/` | Route handlers |
| `proxy.ts` | API key check, per-key rate limiting (Upstash Redis) and CORS for `/api/v1/*` |
| `app/api/cron/refresh` | Nightly cron that triggers a Vercel Deploy Hook to pick up the latest timetable |
| `app/(home)`, `content/docs` | Landing page and Fumadocs documentation |
| `openapi.json` | API spec; `npm run docs:generate` rebuilds the reference pages in `content/docs/api` |

## Local development

```bash
npm install
npm run data          # download the timetable (or GTFS_FILE=./gtfs.zip npm run data)
npm run dev
npm test              # unit tests against a small GTFS fixture
```

With no `API_KEYS` set, the API is open in development and returns 503 in production.

## Deploying to Vercel

1. Import the repo into Vercel (framework: Next.js, default build command).
2. Set `API_KEYS`, e.g. `key-one,partner-key:600` (`:N` sets a per-minute limit; default is `RATE_LIMIT_PER_MINUTE` or 60).
3. Add Upstash Redis from the Vercel Marketplace to enable rate limiting (`KV_REST_API_*` or `UPSTASH_REDIS_REST_*`).
4. For the nightly refresh, create a Deploy Hook for `main`, then set `DEPLOY_HOOK_URL` and `CRON_SECRET`.

See `.env.example` for every variable.

## CI

`.github/workflows/ci.yml` runs the unit tests, the type check and a full build (which downloads
the real timetable) on every push to `main` and on pull requests. The daily timetable refresh
is handled by Vercel (see `vercel.json`), not by CI.
