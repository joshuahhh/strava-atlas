export interface StravaPolylineMap {
  id: string;
  polyline: string | null;
  summary_polyline: string | null;
}

export enum StravaActivityType {
  AlpineSki = "AlpineSki",
  BackcountrySki = "BackcountrySki",
  Canoeing = "Canoeing",
  Crossfit = "Crossfit",
  EBikeRide = "EBikeRide",
  Elliptical = "Elliptical",
  Hike = "Hike",
  IceSkate = "IceSkate",
  InlineSkate = "InlineSkate",
  Kayaking = "Kayaking",
  Kitesurf = "Kitesurf",
  NordicSki = "NordicSki",
  Ride = "Ride",
  RockClimbing = "RockClimbing",
  RollerSki = "RollerSki",
  Rowing = "Rowing",
  Run = "Run",
  Snowboard = "Snowboard",
  Snowshoe = "Snowshoe",
  StairStepper = "StairStepper",
  StandUpPaddling = "StandUpPaddling",
  Surfing = "Surfing",
  Swim = "Swim",
  VirtualRide = "VirtualRide",
  Walk = "Walk",
  WeightTraining = "WeightTraining",
  Windsurf = "Windsurf",
  Workout = "Workout",
  Yoga = "Yoga",
}

export interface StravaSummaryActivity {
  id: number;
  external_id: string;
  upload_id: number;
  // athlete: MetaAthlete;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  elev_high: number;
  elev_low: number;
  type: StravaActivityType;
  start_date: string;
  start_date_local: string;
  timezone: string;
  start_latlng: [number, number] | null;
  end_latlng: [number, number] | null;
  achievement_count: number;
  kudos_count: number;
  comment_count: number;
  athlete_count: number;
  photo_count: number;
  total_photo_count: number;
  map: StravaPolylineMap | null;
  trainer: boolean;
  commute: boolean;
  manual: boolean;
  private: boolean;
  flagged: boolean;
  workout_type: number;
  average_speed: number;
  max_speed: number;
  has_kudoed: boolean;
}

export interface StravaStream<T> {
  data: T[];
  series_type: "distance" | "time";
  original_size: number;
  resolution: "low" | "medium" | "high";
}

export interface StravaStreamSet {
  time?: StravaStream<number>; // seconds since activity start
  distance?: StravaStream<number>; // meters
  latlng?: StravaStream<[number, number]>;
  altitude?: StravaStream<number>; // meters
  velocity_smooth?: StravaStream<number>; // meters/sec
  heartrate?: StravaStream<number>; // bpm
  cadence?: StravaStream<number>; // rpm
  watts?: StravaStream<number>;
  temp?: StravaStream<number>; // °C
  moving?: StravaStream<boolean>;
  grade_smooth?: StravaStream<number>; // percent
}

const ALL_STREAM_KEYS =
  "time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth";

// Fetches all available streams for an activity. Returns {} if the activity
// has no streams (e.g. manual entries).
export async function fetchActivityStreams(
  access_token: string,
  activityId: number,
): Promise<StravaStreamSet> {
  const resp = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=${ALL_STREAM_KEYS}&key_by_type=true`,
    { headers: { Authorization: `Bearer ${access_token}` } },
  );
  if (resp.status === 404) return {};
  if (!resp.ok) {
    throw new Error(
      `fetching streams for activity ${activityId} failed: ${resp.status}`,
    );
  }
  return (await resp.json()) as StravaStreamSet;
}

export interface OAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export async function fetchActivities(
  access_token: string,
  onProgress?: (actData: StravaSummaryActivity[]) => void,
  per_page = 50,
  after?: number,
): Promise<StravaSummaryActivity[]> {
  let actData = [];
  let page = 1;
  let actDataBatch;
  do {
    const resp = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${per_page}&page=${page}` +
        (after ? `&after=${after}` : ""),
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    actDataBatch = (await resp.json()) as StravaSummaryActivity[];
    actData.push(...actDataBatch);
    page++;
    onProgress && onProgress(actData.slice());
  } while (actDataBatch.length === per_page);
  return actData;
}
// NOTE: { 'Accept': 'application/json+meta' } can be used to return a big list of IDs
