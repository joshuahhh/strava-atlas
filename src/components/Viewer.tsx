import { useEffect, useMemo, useState } from "react";

import { Act } from "../Act";
import { StravaStreamSet, StravaSummaryActivity } from "../stravaApi";
import { getStreams } from "../streams";
import { useLocalStorageState } from "../useLocalStorageState";
import "./Viewer.css";
import { ViewerMap } from "./ViewerMap";
import { ViewerTable } from "./ViewerTable";

interface ViewerProps {
  actData: StravaSummaryActivity[];
  setActData: (actData: StravaSummaryActivity[]) => void;
  actDataSync: StravaSummaryActivity[] | undefined;
  syncDate: number;
  sync: (params: { fromScratch: boolean }) => void;
}

export function Viewer({
  actData,
  setActData,
  actDataSync,
  syncDate,
  sync,
}: ViewerProps) {
  const acts = useMemo(() => actData.map((data) => new Act(data)), [actData]);

  // Expose acts globally for debugging.
  useEffect(() => {
    (window as any).acts = acts;
  }, [acts]);

  const [hoveredActIds, setHoveredActIds] = useState<number[]>([]);
  const [multiselectedActIds, setMultiselectedActIds] = useState<number[]>([]);
  const [selectedActId, setSelectedActId] = useState<number | undefined>(
    undefined,
  );
  const [filterFromTable, setFilterFromTable] = useState<(act: Act) => boolean>(
    () => () => true,
  );

  const [showPrivateBadge, setShowPrivateBadge] = useLocalStorageState(
    "showPrivateBadge",
    true,
  );
  const [showPhotoBadge, setShowPhotoBadge] = useLocalStorageState(
    "showPhotoBadge",
    true,
  );

  // Full-resolution streams for the selected activity, fetched lazily (and
  // cached in IndexedDB). undefined while loading / unavailable.
  const [selectedActStreams, setSelectedActStreams] = useState<
    StravaStreamSet | undefined
  >(undefined);
  useEffect(() => {
    setSelectedActStreams(undefined);
    if (selectedActId === undefined) return;
    let cancelled = false;
    getStreams(selectedActId).then(
      (streams) => {
        if (!cancelled && streams) setSelectedActStreams(streams);
      },
      (err) => {
        console.log(`stream fetch failed for activity ${selectedActId}:`, err);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedActId]);

  const visibleActs = useMemo(() => {
    const filteredActs = acts.filter(filterFromTable);
    if (multiselectedActIds.length > 0) {
      return filteredActs.filter((act) =>
        multiselectedActIds.includes(act.data.id),
      );
    } else {
      return filteredActs;
    }
  }, [acts, filterFromTable, multiselectedActIds]);

  // If a hovered/selected act is made invisible, de-hover/deselect it.
  useEffect(() => {
    setHoveredActIds((prev) => {
      const visible = prev.filter((id) =>
        visibleActs.find((act) => act.data.id === id),
      );
      return visible.length === prev.length ? prev : visible;
    });
    if (
      selectedActId !== undefined &&
      !visibleActs.find((act) => act.data.id === selectedActId)
    ) {
      setSelectedActId(undefined);
    }
  }, [visibleActs, selectedActId]);

  function syncFromSelected() {
    const selectedAct = acts.find((act) => act.data.id === selectedActId);
    if (!selectedAct) return;
    setActData(
      actData.filter(
        (data) => new Date(data.start_date) < selectedAct.startDate,
      ),
    );
    sync({ fromScratch: false });
  }

  return (
    <div className="Viewer">
      <div className="Viewer-left">
        <ViewerMap
          visibleActs={visibleActs}
          hoveredActIds={hoveredActIds}
          setHoveredActIds={setHoveredActIds}
          multiselectedActIds={multiselectedActIds}
          setMultiselectedActIds={setMultiselectedActIds}
          selectedActId={selectedActId}
          setSelectedActId={setSelectedActId}
          selectedActStreams={selectedActStreams}
        />
      </div>
      <div className="Viewer-right">
        <ViewerTable
          acts={acts}
          visibleActs={visibleActs}
          hoveredActIds={hoveredActIds}
          setHoveredActIds={setHoveredActIds}
          selectedActId={selectedActId}
          setSelectedActId={setSelectedActId}
          setFilterFromTable={setFilterFromTable}
          showPrivateBadge={showPrivateBadge}
          showPhotoBadge={showPhotoBadge}
        />
        <div className="Viewer-controls">
          <div>
            You are using{" "}
            <span className="Viewer-strava-atlas">Strava Atlas</span>. View
            source{" "}
            <a href="https://github.com/joshuahhh/strava-atlas">on GitHub</a>.
          </div>
          <div>
            {actDataSync ? (
              <>
                Sync in progress:{" "}
                <span className="Viewer-loading-progress Shared-loading-progress">
                  {actDataSync.length} activities
                </span>
              </>
            ) : (
              <>
                Last synced at {new Date(syncDate).toLocaleString()}.{" "}
                <button onClick={() => sync({ fromScratch: false })}>
                  Sync now
                </button>
              </>
            )}
          </div>
          <details className="Viewer-advanced-details">
            <summary>Advanced</summary>
            <div className="Viewer-advanced-controls">
              <label className="Viewer-advanced-checkbox">
                <input
                  type="checkbox"
                  checked={showPrivateBadge}
                  onChange={(ev) => setShowPrivateBadge(ev.target.checked)}
                />
                <div className="Viewer-advanced-badge app-icon icon-private" />
                Mark private activities
              </label>
              <label className="Viewer-advanced-checkbox">
                <input
                  type="checkbox"
                  checked={showPhotoBadge}
                  onChange={(ev) => setShowPhotoBadge(ev.target.checked)}
                />
                <div className="Viewer-advanced-badge app-icon icon-photo" />
                Mark activities with photos
              </label>
              {!actDataSync && (
                <div className="Viewer-advanced-buttons">
                  <button onClick={() => sync({ fromScratch: true })}>
                    Sync from scratch
                  </button>
                  {selectedActId !== undefined && (
                    <button onClick={syncFromSelected}>
                      Sync from selected
                    </button>
                  )}
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
