import './ViewerTableRow.css';

import m from 'mithril';
import classnames from 'classnames';
import dayjs from 'dayjs';

import { Act } from '../Act';
import '../strava-icons.css';


function formatDuration(secs: number) {
  let mins = Math.round(secs / 60);

  let mPart = mins % 60;
  let hPart = Math.floor(mins / 60);

  if (hPart > 0) {
    return [hPart, m('.ViewerTableRow-unit', 'h'), `00${mPart}`.slice(-2), m('.ViewerTableRow-unit', 'm')];
  } else {
    return [mPart, m('.ViewerTableRow-unit', 'm')];
  }
}


interface ViewerTableRowAttrs {
  act: Act,
  isVisible: boolean,
  isHovered: boolean,
  isHoveredDirectly: boolean,
  isSelected: boolean,
  attrs: m.Attributes,
}
const ViewerTableRow: m.ClosureComponent<ViewerTableRowAttrs> = () => {
  return {
    oncreate: ({dom, attrs: {act}}) => {
      console.log('2021-02: setting tableRow');
      act.tableRow = dom as HTMLElement;
    },
    view: ({attrs: {act, isVisible, isHovered, isHoveredDirectly, isSelected, attrs}}) => {
      return m('.ViewerTableRow',
        {
          class: classnames({invisible: !isVisible, hovered: isHovered, "hovered-directly": isHoveredDirectly, selected: isSelected}),
          ...attrs,
        },
        m('.ViewerTableRow-left', {class: `app-icon icon-${act.data.type.toLowerCase()}`, title: act.data.type}),
        m('.ViewerTableRow-right',
          m('.ViewerTableRow-name',
            act.data.name,
            act.latLngs === undefined && [' ', m('span.ViewerTableRow-no-map', '[no map]')]
          ),
          m('.ViewerTableRow-date', dayjs(act.data.start_date).format('YYYY-MM-DD dd')),
          m('.ViewerTableRow-stat', formatDuration(act.data.moving_time)),
          m('.ViewerTableRow-stat', (act.data.distance / 1609.34).toFixed(1), m('.ViewerTableRow-unit', 'mi')),
          m('.ViewerTableRow-stat', (act.data.total_elevation_gain * 3.28084).toFixed(0), m('.ViewerTableRow-unit', 'ft')),
          m('a.ViewerTableRow-strava-link', {
              href: `https://www.strava.com/activities/${act.data.id}`,
              onclick: (ev: Event) => ev.stopPropagation(),
              target: '_blank',
            },
            m('img.ViewerTableRow-strava-link-img', {src: 'strava-2.svg'}))
        ),
      );
    },
  };
};
export default ViewerTableRow;
