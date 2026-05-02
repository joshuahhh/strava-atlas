import _ from "lodash";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Act } from "../Act";
import { actsToGeoJSON, actsToGPX, actsToKML, saveFile } from "../export";
import "./ViewerTable.css";
import { ViewerTableRow } from "./ViewerTableRow";

type Column = "date" | "time" | "distance" | "elevation";
type Dir = "asc" | "desc";

const columnToDataPath = {
  date: "data.start_date",
  time: "data.moving_time",
  distance: "data.distance",
  elevation: "data.total_elevation_gain",
};

interface ViewerTableProps {
  acts: Act[];
  visibleActs: Act[];
  hoveredActIds: number[];
  setHoveredActIds: (ids: number[]) => void;
  selectedActId: number | undefined;
  setSelectedActId: Dispatch<SetStateAction<number | undefined>>;
  setFilterFromTable: Dispatch<SetStateAction<(act: Act) => boolean>>;
}

export function ViewerTable({
  acts,
  visibleActs,
  hoveredActIds,
  setHoveredActIds,
  selectedActId,
  setSelectedActId,
  setFilterFromTable,
}: ViewerTableProps) {
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [nameFilter, setNameFilter] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<{ column: Column; dir: Dir }>({
    column: "date",
    dir: "desc",
  });
  const [headerOpen, setHeaderOpen] = useState(true);
  const headerDomRef = useRef<HTMLDivElement | null>(null);
  const [mouseIsHovering, setMouseIsHovering] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Push the table filter predicate up to Viewer whenever filters change.
  useEffect(() => {
    const nameFilterLowerPieces = nameFilter
      ? nameFilter.toLowerCase().split(" ")
      : undefined;
    setFilterFromTable(() => (act: Act) => {
      if (typeFilter !== "All" && act.data.type !== typeFilter) return false;
      if (nameFilterLowerPieces) {
        const nameLower = act.data.name.toLowerCase();
        if (
          !nameFilterLowerPieces.every((piece) => nameLower.includes(piece))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [typeFilter, nameFilter, setFilterFromTable]);

  const sortedActs = useMemo(
    () => _.orderBy(acts, columnToDataPath[sort.column], sort.dir),
    [acts, sort],
  );

  const typeOptions = useMemo(() => {
    const types = _.chain(acts)
      .groupBy("data.type")
      .toPairs()
      .orderBy(([, actsOfType]) => actsOfType.length, "desc")
      .map(([type]) => type)
      .value();
    return ["All", ...types];
  }, [acts]);

  // Scroll the selected row into view.
  useEffect(() => {
    if (!selectedActId) return;
    const tableRow = document.getElementById(`ViewerTableRow-${selectedActId}`);
    if (!tableRow) {
      console.warn("cannot find table row for ", selectedActId);
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const tableScrollerRect = scroller.getBoundingClientRect();
    const tableRowRect = tableRow.getBoundingClientRect();
    if (
      tableRowRect.top >= tableScrollerRect.top &&
      tableRowRect.bottom <= tableScrollerRect.bottom
    ) {
      return;
    }
    tableRow.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedActId]);

  // Stable callbacks so memoized ViewerTableRows skip re-renders when their props are unchanged.
  const onHoverIn = useCallback(
    (act: Act) => {
      setMouseIsHovering(true);
      setHoveredActIds([act.data.id]);
    },
    [setHoveredActIds],
  );
  const onHoverOut = useCallback(() => {
    setMouseIsHovering(false);
    setHoveredActIds([]);
  }, [setHoveredActIds]);
  const onActClick = useCallback(
    (act: Act) => {
      setSelectedActId((prev) =>
        prev === act.data.id ? undefined : act.data.id,
      );
    },
    [setSelectedActId],
  );

  function toggleSort(toggleColumn: Column) {
    setSort((prev) =>
      prev.column === toggleColumn
        ? { column: prev.column, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column: toggleColumn, dir: "desc" },
    );
  }

  function columnLabel(column: Column) {
    return (
      <div
        className={
          "ViewerTable-column-label" +
          (sort.column === column
            ? ` ViewerTable-column-label-${sort.dir}`
            : "")
        }
        onClick={() => toggleSort(column)}
      >
        {column}
      </div>
    );
  }

  const headerScrollHeight = headerDomRef.current?.scrollHeight;

  return (
    <div className="ViewerTable">
      <div
        ref={headerDomRef}
        className={
          "ViewerTable-header " +
          (headerOpen ? "ViewerTable-header-open" : "ViewerTable-header-closed")
        }
        style={{
          height: headerScrollHeight
            ? `${headerOpen ? headerScrollHeight : 0}px`
            : undefined,
          top: headerScrollHeight
            ? `${headerOpen ? 0 : -headerScrollHeight}px`
            : undefined,
        }}
      >
        <div className="ViewerTable-fake-row ViewerTableRow">
          <div className="ViewerTableRow-left">
            <select
              className="ViewerTableRow-type-selector"
              value={typeFilter}
              onChange={(ev) =>
                setTypeFilter(typeOptions[ev.target.selectedIndex])
              }
            >
              {typeOptions.map((typeOption) => (
                <option key={typeOption}>{typeOption}</option>
              ))}
            </select>
          </div>
          <div className="ViewerTableRow-right">
            <div className="ViewerTableRow-name">
              <div className="ViewerTable-name-filter-container">
                <input
                  className="ViewerTable-name-filter"
                  value={nameFilter ?? ""}
                  onInput={(ev) =>
                    setNameFilter((ev.target as HTMLInputElement).value)
                  }
                  placeholder="Activity name"
                />
                {nameFilter && (
                  <div
                    className="ViewerTable-name-filter-clear"
                    onClick={() => setNameFilter(undefined)}
                  />
                )}
              </div>
            </div>
            <div className="ViewerTableRow-date">{columnLabel("date")}</div>
            <div className="ViewerTableRow-stat">{columnLabel("time")}</div>
            <div className="ViewerTableRow-stat">{columnLabel("distance")}</div>
            <div className="ViewerTableRow-stat">
              {columnLabel("elevation")}
            </div>
          </div>
        </div>
        <select
          className="ViewerTable-header-download-selector"
          value="⤓"
          onChange={(ev) => {
            const format = ev.target.value;
            ev.target.value = "⤓";
            if (visibleActs.length === 0) return;
            let contents: string;
            if (format === "json") {
              contents = JSON.stringify(actsToGeoJSON(visibleActs), null, 2);
            } else if (format === "gpx") {
              contents = actsToGPX(visibleActs);
            } else if (format === "kml") {
              contents = actsToKML(visibleActs);
            } else {
              console.warn("unknown format: ", format);
              return;
            }
            saveFile(
              new Blob([contents], { type: "text/plain" }),
              `activities.${format}`,
            );
          }}
        >
          <option disabled>⤓</option>
          <option disabled>Download</option>
          <option value="json">... as GeoJSON</option>
          <option value="gpx">... as GPX</option>
          <option value="kml">... as KML</option>
        </select>
      </div>
      <div className="ViewerTable-scroller" ref={scrollerRef}>
        <div className="ViewerTable-acts">
          {sortedActs.map((act) => (
            <ViewerTableRow
              key={act.data.id}
              act={act}
              isVisible={visibleActs.includes(act)}
              isHovered={hoveredActIds.includes(act.data.id)}
              isHoveredDirectly={
                hoveredActIds.includes(act.data.id) && mouseIsHovering
              }
              isSelected={act.data.id === selectedActId}
              onHoverIn={onHoverIn}
              onHoverOut={onHoverOut}
              onActClick={onActClick}
            />
          ))}
        </div>
      </div>
      {typeFilter === "All" && !nameFilter && (
        <div
          className={
            "ViewerTable-header-toggle " +
            (headerOpen
              ? "ViewerTable-header-toggle-close"
              : "ViewerTable-header-toggle-open")
          }
          onClick={() => setHeaderOpen((v) => !v)}
        />
      )}
    </div>
  );
}
