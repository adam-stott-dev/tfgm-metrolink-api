// Shape of data/metrolink.json, written by scripts/build-data.ts and read by the API.

export interface DataStop {
  /** Stable slug derived from the stop name, e.g. "piccadilly". */
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** GTFS stop_ids of the platforms that belong to this stop. */
  platforms: DataPlatform[];
}

export interface DataPlatform {
  gtfsId: string;
  name: string;
  code: string | null;
  lat: number;
  lon: number;
}

/**
 * A line, e.g. "Purple Line". The feed splits lines into several GTFS routes
 * (one per pattern), which are merged here by name.
 */
export interface DataRoute {
  /** Slug of the line name, e.g. "purple-line" */
  id: string;
  /** GTFS route_ids merged into this line */
  gtfsIds: string[];
  mode: 'tram' | 'bus';
  shortName: string;
  /** Long name of the busiest GTFS route in the line, e.g. "Altrincham - Etihad Campus" */
  longName: string;
  color: string | null;
  textColor: string | null;
}

export interface DataService {
  /** Monday..Sunday */
  days: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
  /** YYYYMMDD */
  start: string;
  /** YYYYMMDD */
  end: string;
  added: string[];
  removed: string[];
}

export interface DataTrip {
  id: string;
  /** Index into routes[] */
  route: number;
  service: string;
  headsign: string;
  direction: number | null;
  /**
   * Flattened stop visits: [stopIndex, platformIndex, arrivalSecs, departureSecs, ...].
   * Seconds are since local midnight of the service day and may exceed 86400.
   */
  times: number[];
}

export interface MetrolinkData {
  generatedAt: string;
  source: string;
  feedInfo: { publisher: string | null; version: string | null; start: string | null; end: string | null };
  stops: DataStop[];
  routes: DataRoute[];
  services: Record<string, DataService>;
  trips: DataTrip[];
}

/** Number of entries per stop visit in DataTrip.times */
export const VISIT_WIDTH = 4;
