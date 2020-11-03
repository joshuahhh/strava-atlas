import './Viewer.css';

import m from 'mithril';
import Stream from 'mithril/stream';

import ViewerTable from './ViewerTable';
import ViewerMap from './ViewerMap';
import { StravaSummaryActivity } from '../stravaApi';
import { Act } from '../Act';
import { redrawOn } from '../shared';


interface ViewerAttrs {
  actData$: Stream<StravaSummaryActivity[]>,
  actDataSync$: Stream<StravaSummaryActivity[] | undefined>,
  syncDate$: Stream<number>,
  sync: () => void,
}
const Viewer: m.ClosureComponent<ViewerAttrs> = ({attrs: { actData$, actDataSync$, syncDate$, sync }}) => {
  const acts$ = actData$.map((actData) => actData.map((data) => new Act(data)));
  (window as any).acts$ = acts$;
  const filteredActs$ = Stream<Act[]>();

  const hoveredActId$ = Stream<number | undefined>(undefined);
  const selectedActId$ = Stream<number | undefined>(undefined);

  redrawOn(actDataSync$, syncDate$);

  return {
    view: () => {
      return [
        m('.Viewer', [
          m('.Viewer-left',
            m(ViewerMap, {acts$: filteredActs$, hoveredActId$, selectedActId$}),
          ),
          m('.Viewer-right', [
            m(ViewerTable, {acts$, hoveredActId$, selectedActId$, filteredActs$Out: filteredActs$}),
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
