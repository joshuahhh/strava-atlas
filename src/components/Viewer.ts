import './Viewer.css';

import m from 'mithril';
import Stream from 'mithril/stream';

import ViewerTable from './ViewerTable';
import ViewerMap from './ViewerMap';
import { StravaSummaryActivity } from '../stravaApi';
import { Act } from '../Act';
import { redrawOn } from '../shared';
import JSONStorageItem from '../JSONStorageItem';


interface ViewerAttrs {
  actData$: Stream<StravaSummaryActivity[]>,
  actDataSync$: Stream<StravaSummaryActivity[] | undefined>,
  syncDate$: Stream<number>,
  sync: () => void,
}
const Viewer: m.ClosureComponent<ViewerAttrs> = ({attrs: { actData$, actDataSync$, syncDate$, sync }}) => {
  // Modes:
  //   Viewing all acts
  //   Viewing acts filtered by table filters
  //   Viewing specific set of acts defined by a multiclick
  // So we're choosing to TURN OFF all table filtering when there's a multiselection

  const acts$ = actData$.map((actData) => actData.map((data) => new Act(data)));
  (window as any).acts$ = acts$;
  const filteredActs$ = Stream<Act[]>();

  const hoveredActIds$ = Stream<number[]>([]);
  const multiselectedActIds$ = Stream<number[]>([]);
  const selectedActId$ = Stream<number | undefined>(undefined);

  let visibleActs$ = Stream.lift((filteredActs, multiselectedActIds) => {
    if (multiselectedActIds.length > 0) {
      return filteredActs.filter((act) => multiselectedActIds.includes(act.data.id));
    } else {
      return filteredActs;
    }
  }, filteredActs$, multiselectedActIds$);

  // A funny case: if a hovered/selected act is made invisible, it should be de-hovered/selected
  visibleActs$.map((visibleActs) => {
    const visibleHoveredActIds = hoveredActIds$().filter((hoveredActId) =>
      visibleActs.find((act) => act.data.id === hoveredActId)
    );
    if (visibleHoveredActIds.length !== hoveredActIds$().length) {
      hoveredActIds$(visibleHoveredActIds);
    }

    const selectedActId = selectedActId$();
    if (!visibleActs.find((act) => act.data.id === selectedActId)) {
      selectedActId$(undefined);
    }
  });

  // For cross-storage convenience
  const selectedActDataStorage = new JSONStorageItem<StravaSummaryActivity | undefined>('selectedActData');
  selectedActId$.map((selectedActId) => {
    const selectedAct = acts$().find((act) => act.data.id === selectedActId);
    selectedActDataStorage.set(selectedAct?.data);
  });

  redrawOn(actDataSync$, syncDate$);

  return {
    view: () => {
      return [
        m('.Viewer', [
          m('.Viewer-left',
            m(ViewerMap, {visibleActs$, hoveredActIds$, multiselectedActIds$, selectedActId$}),
          ),
          m('.Viewer-right', [
            m(ViewerTable, {acts$, hoveredActIds$, multiselectedActIds$, selectedActId$, filteredActs$, visibleActs$}),
            m('.Viewer-controls',
              m('',
                "You are using ", m('span.Viewer-strava-atlas', "Strava Atlas"), ". ",
                "View source ", m('a', {href: 'https://github.com/joshuahhh/strava-atlas'}, 'on GitHub'), ".",
              ),
              m('',
                actDataSync$()
                ? [
                    'Sync in progress: ',
                    m('span.Viewer-loading-progress.Shared-loading-progress', `${actDataSync$()!.length} activities`),
                  ]
                : [
                    `Last synced at ${new Date(syncDate$()).toLocaleString()}. `,
                    m('button', { onclick: sync }, 'Sync now'),
                  ]
              )
            ),
          ]),
        ]),
      ];
    },
  };
};
export default Viewer;
