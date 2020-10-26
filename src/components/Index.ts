import m from 'mithril';
import Stream from 'mithril/stream';

import { fetchAllActivities, OAuthResponse, StravaSummaryActivity } from '../stravaApi';
import Viewer from './Viewer';
import Welcome from './Welcome';

import { actDataStorage, syncDateStorage, tokenStorage } from '../shared';

const Index: m.ClosureComponent = () => {
  // This is a stream containing a complete set of all the user's activities
  const actDataS = Stream<StravaSummaryActivity[]>();
  const actDataFromLS = actDataStorage.get();
  if (actDataFromLS) {
    actDataS(actDataFromLS);
  }
  actDataS.map((actData) => {
    actDataStorage.set(actData);
  });

  // This is a stream containing the (possibly partial) set of activities being downloaded for the user
  const actDataSyncS = Stream<StravaSummaryActivity[] | undefined>();

  // This is a stream containing the last sync date
  const syncDateS = Stream<number>();
  const syncDateFromLS = syncDateStorage.get();
  if (syncDateFromLS) {
    syncDateS(syncDateFromLS);
  }
  syncDateS.map((syncDate) => {
    syncDateStorage.set(syncDate);
  });

  // Grab token from the search param, if there is one
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromSP = urlParams.get('token');
  if (tokenFromSP) {
    tokenStorage.asString().set(tokenFromSP);
    window.history.replaceState({}, '', '/');
    sync();  // if we just authed, we should certainly sync
  } else {
    // Try using token in LS
    let token = tokenStorage.get();
    if (token) {
      // If it's been long enough, get a sync going
      const syncDate = syncDateS();
      if (!syncDate || +new Date() - syncDate > 1000 * 60 * 60) {
        sync();
      }
    }
  }

  async function sync() {
    let token = tokenStorage.get();
    if (token) {
      // Refresh the token if necessary
      if (token.expires_at * 1000 < +new Date()) {
        token = await m.request<OAuthResponse>({
          url: `/api/submit-refresh-token?refresh_token=${token.refresh_token}`,
        });
        // TODO: error handling
        tokenStorage.set(token);
      }

      actDataSyncS([]);
      await fetchAllActivities(token.access_token, (actData) => {
        actDataSyncS(actData);
        m.redraw();
      });

      actDataS(actDataSyncS()!);
      actDataSyncS(undefined);
      syncDateS(+new Date());
    } else {
      window.location.href = 'api/redirect-to-auth';
    }
  }

  return {
    view: () => {
      // To test the welcome screen:
      // return m(Welcome, {actDataSyncS: Stream() as any});

      // To test the loading screen:
      // return m(Welcome, {actDataSyncS: Stream([]) as any});

      if (actDataS()) {
        return m(Viewer, {actDataS, actDataSyncS, syncDateS, sync});
      } else {
        return m(Welcome, {actDataSyncS});
      }
    },
  };
};
export default Index;
