import './ViewerTable.css';

import m, { VnodeDOM } from 'mithril';
import Stream from 'mithril/stream';
import _ from 'lodash';

import { toggle } from '../shared';
import { Act } from '../Act';
import ActivityRow from './ActivityRow';

interface ViewerTableAttrs {
  acts$: Stream<Act[]>,
  hoveredActId$: Stream<number | undefined>,
  selectedActId$: Stream<number | undefined>,
}
const ViewerTable: m.ClosureComponent<ViewerTableAttrs> = ({attrs: {acts$, selectedActId$}}) => {
  let scrollSub: Stream<void>;

  function oncreate({dom}: VnodeDOM) {
    scrollSub = selectedActId$.map((selectedActId) => {
      const selectedAct = _.find(acts$(), (act) => act.data.id === selectedActId);
      if (selectedAct) {
        // scroll to activity in table
        let tableRow = selectedAct.tableRow;
        if (tableRow) {
          const tableRect = dom.getBoundingClientRect();
          const tableRowRect = tableRow.getBoundingClientRect();
          if (tableRowRect.top < tableRect.top || tableRowRect.bottom > tableRect.bottom) {
            tableRow.scrollIntoView({block: 'center', behavior: 'smooth'});
          }
        }
      }
    });
  }

  function onremove() {
    scrollSub.end(true);
  }

  return {
    view: ({attrs: {acts$, hoveredActId$, selectedActId$}}) => {
      return m('.ViewerTable', {oncreate, onremove},
        acts$().map((act) =>
          m(ActivityRow, {
            act,
            isHovered: act.data.id === hoveredActId$(),
            isSelected: act.data.id === selectedActId$(),
            oncreate: (vnode) => act.tableRow = vnode.dom as HTMLElement,
            attrs: {
              onmouseover: () => hoveredActId$(act.data.id),
              onmouseout: () => hoveredActId$(undefined),
              onclick: () => toggle(selectedActId$, act.data.id),
            },
          }),
        )
      );
    },
  };
};
export default ViewerTable;