import './Welcome.css';

import m from 'mithril';
import Stream from 'mithril/stream';
import { StravaSummaryActivity } from '../stravaApi';
import { redrawOn } from '../shared';

interface WelcomeAttrs {
  actDataSync$: Stream<StravaSummaryActivity[] | undefined>,
}
const Welcome: m.ClosureComponent<WelcomeAttrs> = ({attrs: {actDataSync$}}) => {
  redrawOn(actDataSync$);

  return {
    view: () => {
      const actDataSync = actDataSync$();

      return (
        m('.Welcome',
          m('.Welcome-row',
            m('.Welcome-left', 'Strava Atlas'),
            actDataSync
            ? m('.Welcome-right',
                m('p', 'Please wait a minute while your Strava data is downloaded to your browser.'),
                m('p.Shared-loading-progress.Welcome-loading-progress', `${actDataSync.length} activities`),
                m('p', "You won't have to do this on future visits. :)"),
              )
            : m('.Welcome-right',
                m('p', 'A free third-party tool which draws all your activities onto a single explorable map.'),
                m('p', m('a', {href: 'api/redirect-to-auth'}, m('img', {src: 'btn_strava_connectwith_orange@2x.png', width: 193}))),
                m('p', m('img.Welcome-map-img', {src: 'map.png'})),
                m('p', 'Your Strava data will not leave your browser.'),
                m('p', 'This is an open-source project. Find out more ', m('a', {href: 'https://github.com/joshuahhh/strava-atlas'}, 'on GitHub'), '!'),
              )
          )
        )
      );
    },
  };
};
export default Welcome;
