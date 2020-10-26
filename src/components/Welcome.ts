import './Welcome.css';

import m from 'mithril';
import Stream from 'mithril/stream';
import { StravaSummaryActivity } from '../stravaApi';

interface WelcomeAttrs {
  actDataSyncS: Stream<StravaSummaryActivity[] | undefined>,
}
const Welcome: m.ClosureComponent<WelcomeAttrs> = () => {
  return {
    view: ({attrs: {actDataSyncS}}) => {
      const actDataSync = actDataSyncS();

      return (
        m('.Welcome',
          m('.Welcome-row',
            m('h1.Welcome-left', {style: {fontSize: '300%'}}, 'Strava Atlas'),
            actDataSync
            ? m('.Welcome-right',
                m('p', 'Please wait a minute while your Strava data is downloaded to your browser.'),
                m('h1.Shared-loading-progress', {style: {fontSize: '300%', fontWeight: 600}}, `${actDataSync.length} activities`),
                m('p', "You won't have to do this on future visits. :)"),
              )
            : m('.Welcome-right',
                m('p', 'A free third-party tool which draws all your activities onto a single explorable map.'),
                m('p', m('a', {href: 'api/redirect-to-auth'}, m('img', {src: 'btn_strava_connectwith_orange@2x.png', width: 193}))),
                m('p', m('img', {src: 'map.png', style: {width: '80%'}})),
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
