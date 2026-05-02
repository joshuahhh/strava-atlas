import classnames from "classnames";
import dayjs from "dayjs";
import { memo, type ReactNode } from "react";

import { Act } from "../Act";
import "../strava-icons.css";
import "./ViewerTableRow.css";

function formatDuration(secs: number): ReactNode {
  const mins = Math.round(secs / 60);
  const mPart = mins % 60;
  const hPart = Math.floor(mins / 60);

  if (hPart > 0) {
    return (
      <>
        {hPart}
        <div className="ViewerTableRow-unit">h</div>
        {`00${mPart}`.slice(-2)}
        <div className="ViewerTableRow-unit">m</div>
      </>
    );
  } else {
    return (
      <>
        {mPart}
        <div className="ViewerTableRow-unit">m</div>
      </>
    );
  }
}

interface ViewerTableRowProps {
  act: Act;
  isVisible: boolean;
  isHovered: boolean;
  isHoveredDirectly: boolean;
  isSelected: boolean;
  onHoverIn: (act: Act) => void;
  onHoverOut: () => void;
  onActClick: (act: Act) => void;
}

function ViewerTableRowImpl({
  act,
  isVisible,
  isHovered,
  isHoveredDirectly,
  isSelected,
  onHoverIn,
  onHoverOut,
  onActClick,
}: ViewerTableRowProps) {
  return (
    <div
      id={`ViewerTableRow-${act.data.id}`}
      className={classnames("ViewerTableRow", {
        invisible: !isVisible,
        hovered: isHovered,
        "hovered-directly": isHoveredDirectly,
        selected: isSelected,
      })}
      onMouseOver={() => onHoverIn(act)}
      onMouseOut={() => onHoverOut()}
      onClick={() => onActClick(act)}
    >
      <div
        className={`ViewerTableRow-left app-icon icon-${act.data.type.toLowerCase()}`}
        title={act.data.type}
      />
      <div className="ViewerTableRow-right">
        <div className="ViewerTableRow-name">
          {act.data.name}
          {act.latLngs === undefined && (
            <>
              {" "}
              <span className="ViewerTableRow-no-map">[no map]</span>
            </>
          )}
        </div>
        <div className="ViewerTableRow-date">
          {dayjs(act.data.start_date).format("YYYY-MM-DD dd")}
        </div>
        <div className="ViewerTableRow-stat">
          {formatDuration(act.data.moving_time)}
        </div>
        <div className="ViewerTableRow-stat">
          {(act.data.distance / 1609.34).toFixed(1)}
          <div className="ViewerTableRow-unit">mi</div>
        </div>
        <div className="ViewerTableRow-stat">
          {(act.data.total_elevation_gain * 3.28084).toFixed(0)}
          <div className="ViewerTableRow-unit">ft</div>
        </div>
        <a
          className="ViewerTableRow-strava-link"
          href={`https://www.strava.com/activities/${act.data.id}`}
          onClick={(ev) => ev.stopPropagation()}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img className="ViewerTableRow-strava-link-img" src="strava-2.svg" />
        </a>
      </div>
    </div>
  );
}

export const ViewerTableRow = memo(ViewerTableRowImpl);
