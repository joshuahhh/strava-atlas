import { deleteKeysWithPrefix, IndexedDBItem } from "./IndexedDBItem";
import { db, getValidToken } from "./storage";
import { fetchActivityStreams, StravaStreamSet } from "./stravaApi";

function streamsItem(actId: number) {
  return new IndexedDBItem<StravaStreamSet>(`streams/${actId}`, db);
}

// In-memory cache doubling as in-flight dedup, so a given activity is fetched
// from the API at most once per session (and at most once ever, via IndexedDB).
const streamsCache = new Map<number, Promise<StravaStreamSet | null>>();

// Returns all of an activity's streams, from cache if possible. Resolves to
// null if we have no token; rejects if the API request fails.
export function getStreams(actId: number): Promise<StravaStreamSet | null> {
  let promise = streamsCache.get(actId);
  if (!promise) {
    promise = getStreamsUncached(actId);
    promise.catch(() => streamsCache.delete(actId)); // allow retry after failure
    streamsCache.set(actId, promise);
  }
  return promise;
}

async function getStreamsUncached(
  actId: number,
): Promise<StravaStreamSet | null> {
  const item = streamsItem(actId);
  const stored = await item.get();
  if (stored) return stored;

  const token = await getValidToken();
  if (!token) return null;

  const streams = await fetchActivityStreams(token.access_token, actId);
  await item.set(streams);
  return streams;
}

// Forgets cached streams (in memory and IndexedDB) so they'll be re-fetched
// next time they're needed. With no argument, forgets all of them.
export async function clearStreams(actIds?: number[]): Promise<void> {
  if (actIds === undefined) {
    streamsCache.clear();
    await deleteKeysWithPrefix(db, "streams/");
  } else {
    actIds.forEach((actId) => streamsCache.delete(actId));
    await Promise.all(actIds.map((actId) => streamsItem(actId).remove()));
  }
}
