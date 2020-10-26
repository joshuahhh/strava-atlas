import './ActivityRow.css';

import m from 'mithril';
import classnames from 'classnames';
import dayjs from 'dayjs';

import { Act } from '../Act';


function formatDuration(secs: number) {
  let mins = Math.round(secs / 60);

  let mPart = mins % 60;
  let hPart = Math.floor(mins / 60);

  return (hPart === 0 ? '' : `${hPart}h`) + `00${mPart}m`.slice(-3);
}


interface ActivityRowAttrs {
  act: Act,
  isHovered: boolean,
  isSelected: boolean,
  attrs: m.Attributes,
}
const ActivityRow: m.ClosureComponent<ActivityRowAttrs> = () => {
  return {
    view: ({attrs: {act, isHovered, isSelected, attrs}}) => {
      return m('.ActivityRow',
        {
          class: classnames({hovered: isHovered, selected: isSelected}),
          ...attrs,
        },
        m('.ActivityRow-left', {class: `app-icon icon-${act.data.type.toLowerCase()}`}),
        m('.ActivityRow-right',
          m('.ActivityRow-name', act.data.name),
          m('.ActivityRow-date', dayjs(act.data.start_date).format('YYYY-MM-DD dd')),
          m('.ActivityRow-stat', formatDuration(act.data.moving_time)),
          m('.ActivityRow-stat', (act.data.distance / 1609.34).toFixed(1), m('.ActivityRow-unit', 'mi')),
          m('.ActivityRow-stat', (act.data.total_elevation_gain * 3.28084).toFixed(0), m('.ActivityRow-unit', 'ft')),
          m('a.ActivityRow-strava-link', {
              href: `https://www.strava.com/activities/${act.data.id}`,
              onclick: (ev: Event) => ev.stopPropagation(),
              target: '_blank',
            },
            m('img.ActivityRow-strava-link-img', {src: 'strava-2.svg'}))
        ),
      );
    },
  };
};
export default ActivityRow;
