import { IndexedDBItem, initDB } from "./IndexedDBItem";
import { OAuthResponse, StravaSummaryActivity } from "./stravaApi";

export const db = initDB("strava-atlas");

export const actDataStorage = new IndexedDBItem<StravaSummaryActivity[]>(
  "actData",
  db,
);
export const tokenStorage = new IndexedDBItem<OAuthResponse>("token", db);
export const syncDateStorage = new IndexedDBItem<number>("syncDate", db);

// Returns a non-expired access token, refreshing if necessary, or null if
// the user has never authorized.
export async function getValidToken(): Promise<OAuthResponse | null> {
  let token = await tokenStorage.get();
  if (!token) return null;

  if (token.expires_at * 1000 < +new Date()) {
    const resp = await fetch(
      `/api/submit-refresh-token?refresh_token=${token.refresh_token}`,
    );
    // TODO: error handling
    token = (await resp.json()) as OAuthResponse;
    await tokenStorage.set(token);
  }
  return token;
}
