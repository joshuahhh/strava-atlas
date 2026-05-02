import _ from "lodash";
import m from "mithril";
import Stream from "mithril/stream";

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

// Helper function to clear all storage for testing
(window as any).clearStorage = async () => {
  await actDataStorage.remove();
  await tokenStorage.remove();
  await syncDateStorage.remove();
  console.log("All storage cleared. Reload the page to start fresh.");
};

const Index: m.ClosureComponent = () => {
  // This is a stream containing a complete set of all the user's activities
  const actData$ = Stream<StravaSummaryActivity[] | undefined>(undefined);
  const isLoadingFromDB$ = Stream<boolean>(true);

  // Save actData to IndexedDB whenever it changes (after loading completes)
  actData$.map((actData) => {
    if (actData && !isLoadingFromDB$()) {
      actDataStorage.set(actData);
    }
  });

  // This is a stream containing the (possibly partial) set of activities being downloaded for the user
  const actDataSync$ = Stream<StravaSummaryActivity[] | undefined>();

  // This is a stream containing the last sync date
  const syncDate$ = Stream<number>();

  // Save syncDate to IndexedDB whenever it changes (after loading completes)
  syncDate$.map((syncDate) => {
    if (!isLoadingFromDB$()) {
      syncDateStorage.set(syncDate);
    }
  });

  // Initialize from IndexedDB asynchronously
  (async () => {
    // Check for OAuth token first (before loading from IndexedDB)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromSP = urlParams.get("token");

    if (tokenFromSP) {
      // Just came back from OAuth - save token and do fresh sync
      const tokenObj = JSON.parse(tokenFromSP);
      await tokenStorage.set(tokenObj);
      window.history.replaceState({}, "", "/");
      sync({ fromScratch: true });
    } else {
      // Normal load - get data from IndexedDB
      const actDataFromDB = await actDataStorage.get();
      if (actDataFromDB) {
        actData$(actDataFromDB);
      }

      const syncDateFromDB = await syncDateStorage.get();
      if (syncDateFromDB) {
        syncDate$(syncDateFromDB);
      }

      // Check if we should sync after initialization
      const token = await tokenStorage.get();
      if (token) {
        const syncDate = syncDate$();
        if (!syncDate || +new Date() - syncDate > 1000 * 60 * 60) {
          sync({ fromScratch: false });
        }
      }
    }

    // Mark initialization complete
    isLoadingFromDB$(false);
    m.redraw();
  })();

  async function sync({ fromScratch }: { fromScratch: boolean }) {
    let token = await tokenStorage.get();
    if (token) {
      // Refresh the token if necessary
      if (token.expires_at * 1000 < +new Date()) {
        token = await m.request<OAuthResponse>({
          url: `/api/submit-refresh-token?refresh_token=${token.refresh_token}`,
        });
        // TODO: error handling
        await tokenStorage.set(token);
      }

      let afterTime: number | undefined = undefined;
      let actData = actData$();
      if (!fromScratch && actData && actData.length > 0) {
        actDataSync$(actData);
        const times = actData.map((act) => +new Date(act.start_date) / 1000);
        afterTime = _.max(times);
      } else {
        actDataSync$([]);
      }

      await fetchActivities(
        token.access_token,
        (newActData) => {
          // This runs whenever a new page of data comes in
          // Note: newActData is cumulative (includes all pages fetched so far)
          if (fromScratch) {
            actDataSync$(newActData);
          } else {
            // Append the new data to the existing activities
            actDataSync$([...(actData || []), ...newActData]);
          }
          m.redraw();
        },
        undefined,
        afterTime,
      );

      actData$(actDataSync$()!);
      actDataSync$(undefined);
      syncDate$(+new Date());
    } else {
      window.location.href = "api/redirect-to-auth";
    }
  }

  return {
    view: () => {
      // To test the welcome screen:
      // return m(Welcome, {actDataSync$: Stream() as any});

      // To test the loading screen:
      // return m(Welcome, {actDataSync$: Stream([]) as any});

      if (isLoadingFromDB$()) {
        // Show a simple loading indicator while loading from IndexedDB
        return m(
          ".Welcome",
          m(
            ".Welcome-row",
            m(".Welcome-left", "Strava Atlas"),
            m(
              ".Welcome-right",
              m(
                "p.Shared-loading-progress.Welcome-loading-progress",
                "Loading...",
              ),
            ),
          ),
        );
      } else if (actData$()) {
        return m(Viewer, {
          actData$: actData$ as Stream<StravaSummaryActivity[]>,
          actDataSync$,
          syncDate$,
          sync,
        });
      } else {
        return m(Welcome, { actDataSync$ });
      }
    },
  };
};
export default Index;
