import './ViewerTable.css';

import m, { VnodeDOM } from 'mithril';
import Stream from 'mithril/stream';
import _ from 'lodash';

import { redrawOn, toggle } from '../shared';
import { Act } from '../Act';
import ViewerTableRow from './ViewerTableRow';


type Column = 'date' | 'time' | 'distance' | 'elevation';
type Dir = 'asc' | 'desc';

interface ViewerTableAttrs {
  acts$: Stream<Act[]>,
  filteredActs$: Stream<Act[]>,
  visibleActs$: Stream<Act[]>,
  hoveredActIds$: Stream<number[]>,
  multiselectedActIds$: Stream<number[]>,
  selectedActId$: Stream<number | undefined>,
}
const ViewerTable: m.ClosureComponent<ViewerTableAttrs> = ({attrs: {acts$, selectedActId$, hoveredActIds$, filteredActs$, visibleActs$}}) => {
  let headerDom: HTMLElement | undefined;
  let headerOpen = false;

  let mouseIsHovering = false;

  const typeFilter$ = Stream('All' as string);
  const nameFilter$ = Stream(undefined as string | undefined);

  const sort$ = Stream({column: 'date' as Column, dir: 'desc' as Dir});
  const columnToDataPath = {
    date: 'data.start_date',
    time: 'data.moving_time',
    distance: 'data.distance',
    elevation: 'data.total_elevation_gain',
  };

  // TODO: Kinda strange structure we have going here
  Stream.lift((acts, typeFilter, nameFilter) => {
    let out = acts;
    if (typeFilter !== 'All') {
      out = out.filter((act) => act.data.type === typeFilter);
    }
    if (nameFilter) {
      const nameFilterLower = nameFilter.toLowerCase();
      out = out.filter((act) => act.data.name.toLowerCase().match(nameFilterLower));
    }
    filteredActs$(out);
  }, acts$, typeFilter$, nameFilter$);

  const sortedActs$ = Stream.lift((acts, sort) => {
    return _.orderBy(acts, columnToDataPath[sort.column], sort.dir);
  }, acts$, sort$);

  function toggleSort(toggleColumn: Column) {
    const {column, dir} = sort$();
    if (column === toggleColumn) {
      sort$({column, dir: dir === 'asc' ? 'desc' : 'asc'});
    } else {
      sort$({column: toggleColumn, dir: 'desc'});
    }
  }

  function oncreateScroller({dom}: VnodeDOM) {
    // when a new activity is selected, scroll to it in the table
    selectedActId$.map((selectedActId) => {
      console.log("scrolling 1");
      if (!selectedActId) { return; }
      console.log("scrolling 2");
      const selectedAct = acts$().find((act) => act.data.id === selectedActId);
      if (!selectedAct) { return; }
      console.log("scrolling 3");
      let tableRow = selectedAct.tableRow;
      if (!tableRow) { return; }
      console.log("scrolling 4");
      const tableScrollerRect = dom.getBoundingClientRect();
      const tableRowRect = tableRow.getBoundingClientRect();
      if (tableRowRect.top >= tableScrollerRect.top && tableRowRect.bottom <= tableScrollerRect.bottom) { return; }
      console.log("scrolling 5");
      tableRow.scrollIntoView({block: 'center', behavior: 'smooth'});
    });
  }

  function columnLabel(column: Column) {
    const {column: sortColumn, dir: sortDir} = sort$();
    return m('.ViewerTable-column-label', {
      class: sortColumn === column ? 'ViewerTable-column-label-' + sortDir : undefined,
      onclick: () => toggleSort(column),
    }, column);
  }

  redrawOn(filteredActs$, hoveredActIds$, selectedActId$, sort$);

  return {
    view: () => {
      const types = _.chain(acts$())
        .groupBy('data.type')
        .toPairs()
        .orderBy(([_type, actsOfType]) => actsOfType.length, 'desc')
        .map(([type, _actsOfType]) => type)
        .value();
      const typeOptions = ['All', ...types];

      return m('.ViewerTable',
        m('.ViewerTable-header', {
          class: headerOpen ? 'ViewerTable-header-open' : 'ViewerTable-header-closed',
          style: {
            height: headerDom && `${headerOpen ? headerDom.scrollHeight : 0}px`,
            top: headerDom && `${headerOpen ? 0 : -headerDom.scrollHeight}px`,
          },
          oncreate: ({dom}) => headerDom = dom as HTMLElement,
        },
          m('.ViewerTable-fake-row.ViewerTableRow',
            m('.ViewerTableRow-left',
              m('select.ViewerTableRow-type-selector', {
                value: typeFilter$(),
                onchange: (ev: InputEvent) => typeFilter$(typeOptions[(ev.target as HTMLSelectElement).selectedIndex]),
              },
                typeOptions.map(typeOption => m('option', typeOption)),
              )
            ),
            m('.ViewerTableRow-right',
              m('.ViewerTableRow-name',
                m('.ViewerTable-name-filter-container',
                  m('input.ViewerTable-name-filter', {
                    value: nameFilter$(),
                    oninput: (ev: InputEvent) => nameFilter$((ev.target as HTMLInputElement).value),
                    placeholder: 'Activity name',
                  }),
                  nameFilter$() && (
                    m('.ViewerTable-name-filter-clear', {
                      onclick: () => nameFilter$(undefined),
                    })
                  )
                )
              ),
              m('.ViewerTableRow-date', columnLabel('date')),
              m('.ViewerTableRow-stat', columnLabel('time')),
              m('.ViewerTableRow-stat', columnLabel('distance')),
              m('.ViewerTableRow-stat', columnLabel('elevation')),
            ),
          ),
        ),
        m('.ViewerTable-scroller', {oncreate: oncreateScroller},
          m('.ViewerTable-acts',
            sortedActs$().map((act) =>
              m(ViewerTableRow, {
                act,
                isVisible: visibleActs$().includes(act),
                isHovered: hoveredActIds$().includes(act.data.id),
                isHoveredDirectly: hoveredActIds$().includes(act.data.id) && mouseIsHovering,
                isSelected: act.data.id === selectedActId$(),
                oncreate: (vnode) => act.tableRow = vnode.dom as HTMLElement,
                attrs: {
                  onmouseover: () => { mouseIsHovering = true; hoveredActIds$([act.data.id]); },
                  onmouseout: () => { mouseIsHovering = false; hoveredActIds$([]); },
                  onclick: () => toggle(selectedActId$, act.data.id),
                },
              }),
            )
          ),
        ),
        typeFilter$() === 'All' && !nameFilter$() && (
          m('.ViewerTable-header-toggle', {
            class: headerOpen ? 'ViewerTable-header-toggle-close': 'ViewerTable-header-toggle-open',
            onclick: () => { headerOpen = !headerOpen; },
          })
        )
      );
    },
  };
};
export default ViewerTable;