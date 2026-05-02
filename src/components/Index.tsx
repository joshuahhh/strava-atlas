import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";

import IndexedDBItem, { initDB } from "../IndexedDBItem";
import {
  fetchActivities,
  OAuthResponse,
  StravaSummaryActivity,
} from "../stravaApi";
import Viewer from "./Viewer";
import Welcome from "./Welcome";

const db = initDB("strava-atlas");

const actDataStorage = new IndexedDBItem<StravaSummaryActivity[]>(
  "actData",
  db,
);
const tokenStorage = new IndexedDBItem<OAuthResponse>("token", db);
const syncDateStorage = new IndexedDBItem<number>("syncDate", db);

// Helper to clear all storage for testing
(window as any).clearStorage = async () => {
  await actDataStorage.remove();
  await tokenStorage.remove();
  await syncDateStorage.remove();
  console.log("All storage cleared. Reload the page to start fresh.");
};

export default function Index() {
  const [actData, setActData] = useState<StravaSummaryActivity[] | undefined>(
    undefined,
  );
  const [actDataSync, setActDataSync] = useState<
    StravaSummaryActivity[] | undefined
  >(undefined);
  const [syncDate, setSyncDate] = useState<number | undefined>(undefined);
  const [isLoadingFromDB, setIsLoadingFromDB] = useState(true);

  // Refs that mirror the latest values so async sync() can read them without
  // being re-created on every state change.
  const actDataRef = useRef(actData);
  actDataRef.current = actData;

  // Persist actData to IndexedDB whenever it changes (after initial load).
  useEffect(() => {
    if (!isLoadingFromDB && actData) {
      actDataStorage.set(actData);
    }
  }, [actData, isLoadingFromDB]);

  // Persist syncDate to IndexedDB whenever it changes (after initial load).
  useEffect(() => {
    if (!isLoadingFromDB && syncDate !== undefined) {
      syncDateStorage.set(syncDate);
    }
  }, [syncDate, isLoadingFromDB]);

  const sync = useCallback(
    async ({ fromScratch }: { fromScratch: boolean }) => {
      let token = await tokenStorage.get();
      if (!token) {
        window.location.href = "api/redirect-to-auth";
        return;
      }

      // Refresh the token if necessary
      if (token.expires_at * 1000 < +new Date()) {
        const resp = await fetch(
          `/api/submit-refresh-token?refresh_token=${token.refresh_token}`,
        );
        // TODO: error handling
        token = (await resp.json()) as OAuthResponse;
        await tokenStorage.set(token);
      }

      let afterTime: number | undefined = undefined;
      const existingActData = actDataRef.current;
      if (!fromScratch && existingActData && existingActData.length > 0) {
        setActDataSync(existingActData);
        const times = existingActData.map(
          (act) => +new Date(act.start_date) / 1000,
        );
        afterTime = _.max(times);
      } else {
        setActDataSync([]);
      }

      let latestSyncData: StravaSummaryActivity[] = [];
      await fetchActivities(
        token.access_token,
        (newActData) => {
          // newActData is cumulative (includes all pages fetched so far)
          if (fromScratch) {
            latestSyncData = newActData;
          } else {
            latestSyncData = [...(existingActData || []), ...newActData];
          }
          setActDataSync(latestSyncData);
        },
        undefined,
        afterTime,
      );

      setActData(latestSyncData);
      setActDataSync(undefined);
      setSyncDate(+new Date());
    },
    [],
  );

  // Initialize from IndexedDB (or capture OAuth token) on mount.
  useEffect(() => {
    (async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const tokenFromSP = urlParams.get("token");

      if (tokenFromSP) {
        // Just came back from OAuth — save token and do fresh sync.
        const tokenObj = JSON.parse(tokenFromSP);
        await tokenStorage.set(tokenObj);
        window.history.replaceState({}, "", "/");
        setIsLoadingFromDB(false);
        sync({ fromScratch: true });
      } else {
        const actDataFromDB = await actDataStorage.get();
        if (actDataFromDB) setActData(actDataFromDB);

        const syncDateFromDB = await syncDateStorage.get();
        if (syncDateFromDB) setSyncDate(syncDateFromDB);

        setIsLoadingFromDB(false);

        const token = await tokenStorage.get();
        if (token) {
          if (
            !syncDateFromDB ||
            +new Date() - syncDateFromDB > 1000 * 60 * 60
          ) {
            sync({ fromScratch: false });
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoadingFromDB) {
    return (
      <div className="Welcome">
        <div className="Welcome-row">
          <div className="Welcome-left">Strava Atlas</div>
          <div className="Welcome-right">
            <p className="Shared-loading-progress Welcome-loading-progress">
              Loading...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (actData) {
    return (
      <Viewer
        actData={actData}
        setActData={setActData}
        actDataSync={actDataSync}
        syncDate={syncDate ?? 0}
        sync={sync}
      />
    );
  }

  return <Welcome actDataSync={actDataSync} />;
}
