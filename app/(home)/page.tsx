import Link from 'next/link';
import { Clock, KeyRound, MapPin, Route, TrainFront, Zap } from 'lucide-react';

const exampleRequest = `curl https://{host}/api/v1/stops/piccadilly/departures \\
  -H "X-API-Key: YOUR_KEY"`;

const exampleResponse = `{
  "stop": { "id": "piccadilly", "name": "Piccadilly" },
  "realtime": false,
  "departures": [
    {
      "route": { "id": "purple-line", "name": "Purple Line" },
      "destination": "Etihad Campus",
      "scheduledDeparture": "2026-10-19T08:04:00+01:00",
      "minutesUntilDeparture": 4
    },
    ...
  ]
}`;

const features = [
  {
    icon: Clock,
    title: 'Next departures',
    body: 'Upcoming trams from any stop with destination, platform and minutes to go, in UK time.',
  },
  {
    icon: MapPin,
    title: 'Stop search',
    body: 'Find stops by name or sort them by distance from a location.',
  },
  {
    icon: Route,
    title: 'Routes',
    body: 'Every Metrolink line with its stops in order, plus line colours.',
  },
  {
    icon: Zap,
    title: 'Independent',
    body: 'Built from the published GTFS timetable, so it never calls the TfGM live API.',
  },
  {
    icon: KeyRound,
    title: 'API keys & rate limits',
    body: 'Per-key limits with standard rate-limit headers and clear JSON errors.',
  },
  {
    icon: TrainFront,
    title: 'Refreshed nightly',
    body: 'The timetable is re-imported every night, so planned changes show up automatically.',
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pt-16 pb-12 text-center sm:pt-24">
        <span className="mb-4 rounded-full border border-fd-border bg-fd-card px-3 py-1 text-xs text-fd-muted-foreground">
          Scheduled timetable data · not live
        </span>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Manchester Metrolink times, as a simple REST API
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-fd-muted-foreground">
          Stops, routes and upcoming tram departures for Greater Manchester, built from the official open
          timetable.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/docs/quickstart"
            className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
          <Link
            href="/docs/api/stops/get-departures"
            className="rounded-lg border border-fd-border bg-fd-card px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
          >
            Try the API
          </Link>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-16 lg:grid-cols-2">
        <CodePanel title="Request" code={exampleRequest} />
        <CodePanel title="Response" code={exampleResponse} />
      </section>

      <section className="border-t border-fd-border bg-fd-card/40">
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-16 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-fd-border bg-fd-background p-5">
              <Icon className="mb-3 size-5 text-fd-primary" aria-hidden />
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1.5 text-sm text-fd-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto w-full max-w-5xl px-4 py-8 text-xs text-fd-muted-foreground">
        Timetable data from Transport for Greater Manchester, licensed under the{' '}
        <a className="underline" href="https://opendatacommons.org/licenses/odbl/1-0/">
          ODbL 1.0
        </a>
        . This project is not affiliated with or endorsed by TfGM.
      </footer>
    </main>
  );
}

function CodePanel({ title, code }: { title: string; code: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-fd-border bg-fd-card">
      <div className="border-b border-fd-border px-4 py-2 text-xs font-medium text-fd-muted-foreground">{title}</div>
      <pre className="overflow-x-auto p-4 text-left text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
