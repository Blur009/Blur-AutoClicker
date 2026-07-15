import { useCallback, useEffect, useRef, useState } from "react";
import { error } from "@tauri-apps/plugin-log";
import { getEffectiveIntervalMs } from "../../../cadence";
import type { ClickPoint, Settings } from "../../../store";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Disableable,
  CardDivider,
  ToggleBtn,
  InfoIcon,
} from "../advanced/sections/shared";
import ClickPointRow from "./ClickPointRow";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
  running: boolean;
  activeClickPointIndex: number | null;
  activeClickPointTick: number;
}

interface ClickPointPickedPayload {
  x: number;
  y: number;
  continuePicking: boolean;
}

interface ClickPointDeleteRequestedPayload {
  x: number;
  y: number;
}

interface DragState {
  draggedId: string;
  pointerId: number;
  latestClientY: number;
  handle: HTMLButtonElement | null;
}

const DELETE_RADIUS_PX = 10;

function createClickPointId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function reorderClickPoints(
  points: ClickPoint[],
  draggedId: string,
  insertionIndex: number,
): ClickPoint[] {
  const draggedPoint = points.find((point) => point.id === draggedId);
  if (!draggedPoint) {
    return points;
  }

  const remainingPoints = points.filter((point) => point.id !== draggedId);
  const clampedIndex = Math.max(
    0,
    Math.min(insertionIndex, remainingPoints.length),
  );

  return [
    ...remainingPoints.slice(0, clampedIndex),
    draggedPoint,
    ...remainingPoints.slice(clampedIndex),
  ];
}

function haveSameOrder(a: ClickPoint[], b: ClickPoint[]) {
  return (
    a.length === b.length &&
    a.every((point, index) => point.id === b[index]?.id)
  );
}

export default function ClickPointsContent({
  settings,
  update,
  showInfo,
  running,
  activeClickPointIndex,
  activeClickPointTick,
}: Props) {
  const [picking, setPicking] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const listViewportRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const latestPointsRef = useRef(settings.clickPoints);
  const updateRef = useRef(update);
  const dragStateRef = useRef<DragState | null>(null);
  const moveFrameRef = useRef<number | null>(null);

  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  useEffect(() => {
    let disposed = false;
    let unlistenPicked: (() => void) | null = null;
    let unlistenDeleteRequested: (() => void) | null = null;
    let unlistenEnded: (() => void) | null = null;

    void listen<ClickPointPickedPayload>("click-point-picked", (event) => {
      const nextPoints = [
        ...latestPointsRef.current,
        {
          id: createClickPointId(),
          x: event.payload.x,
          y: event.payload.y,
          clicks: 1,
        },
      ];
      latestPointsRef.current = nextPoints;
      updateRef.current({
        clickPointsEnabled: true,
        clickPoints: nextPoints,
      });

      if (!event.payload.continuePicking) {
        setPicking(false);
      }
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlistenPicked = cleanup;
      }
    });

    void listen<ClickPointDeleteRequestedPayload>(
      "click-point-delete-requested",
      (event) => {
        const radiusSquared = DELETE_RADIUS_PX ** 2;
        let nearestIndex = -1;
        let nearestDistanceSquared = Number.POSITIVE_INFINITY;

        latestPointsRef.current.forEach((point, index) => {
          const dx = point.x - event.payload.x;
          const dy = point.y - event.payload.y;
          const distanceSquared = dx * dx + dy * dy;

          if (
            distanceSquared <= radiusSquared &&
            distanceSquared < nearestDistanceSquared
          ) {
            nearestIndex = index;
            nearestDistanceSquared = distanceSquared;
          }
        });

        if (nearestIndex === -1) {
          return;
        }

        const nextPoints = latestPointsRef.current.filter(
          (_point, index) => index !== nearestIndex,
        );
        latestPointsRef.current = nextPoints;
        updateRef.current({ clickPoints: nextPoints });
      },
    ).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlistenDeleteRequested = cleanup;
      }
    });

    void listen("click-pick-ended", () => {
      setPicking(false);
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlistenEnded = cleanup;
      }
    });

    return () => {
      disposed = true;
      unlistenPicked?.();
      unlistenDeleteRequested?.();
      unlistenEnded?.();
      void invoke("cancel_click_point_pick");
    };
  }, []);

  const startPick = useCallback(async () => {
    setPicking(true);
    try {
      await invoke("start_click_point_pick");
    } catch (err) {
      setPicking(false);
      error(
        JSON.stringify({
          source: "ClickPointsContent.startPick",
          error: String(err),
        }),
      );
    }
  }, []);

  const cancelPick = useCallback(async () => {
    setPicking(false);
    try {
      await invoke("cancel_click_point_pick");
    } catch (err) {
      error(
        JSON.stringify({
          source: "ClickPointsContent.cancelPick",
          error: String(err),
        }),
      );
    }
  }, []);

  useEffect(() => {
    if (!picking) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void cancelPick();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [cancelPick, picking]);

  const updatePoint = (index: number, patch: Partial<ClickPoint>) => {
    const nextPoints = settings.clickPoints.map(
      (point: ClickPoint, pointIndex: number) =>
        pointIndex === index ? { ...point, ...patch } : point,
    );
    update({ clickPoints: nextPoints });
  };

  const deletePoint = (index: number) => {
    const nextPoints = settings.clickPoints.filter(
      (_: ClickPoint, pointIndex: number) => pointIndex !== index,
    );
    update({ clickPoints: nextPoints });
  };

  const setItemRef = useCallback(
    (pointId: string, node: HTMLDivElement | null) => {
      if (node) {
        itemRefs.current.set(pointId, node);
      } else {
        itemRefs.current.delete(pointId);
      }
    },
    [],
  );

  const updateBottomFade = useCallback(() => {
    const viewport = listViewportRef.current;
    if (!viewport) {
      setShowBottomFade(false);
      return;
    }
    const hasOverflow = viewport.scrollHeight - viewport.clientHeight > 6;
    const hasMoreBelow =
      hasOverflow &&
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 6;
    setShowBottomFade(hasMoreBelow);
  }, []);

  const commitPoints = useCallback(
    (nextPoints: ClickPoint[]) => {
      if (haveSameOrder(latestPointsRef.current, nextPoints)) {
        return;
      }
      latestPointsRef.current = nextPoints;
      update({ clickPoints: nextPoints });
    },
    [update],
  );

  const computeInsertionIndex = useCallback(
    (clientY: number, draggedId: string) => {
      const orderedPoints = latestPointsRef.current.filter(
        (point) => point.id !== draggedId,
      );

      if (orderedPoints.length === 0) {
        return 0;
      }

      const measuredPoints = orderedPoints
        .map((point) => ({
          point,
          rect: itemRefs.current.get(point.id)?.getBoundingClientRect() ?? null,
        }))
        .filter(
          (entry): entry is { point: ClickPoint; rect: DOMRect } =>
            entry.rect !== null,
        );

      if (measuredPoints.length === 0) {
        return orderedPoints.length;
      }

      for (let index = 0; index < measuredPoints.length; index += 1) {
        const { rect } = measuredPoints[index];
        if (clientY < rect.top + rect.height / 2) {
          return index;
        }
      }

      return measuredPoints.length;
    },
    [],
  );

  const updateDragOrder = useCallback(
    (clientY: number) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const viewport = listViewportRef.current;
      if (viewport) {
        const rect = viewport.getBoundingClientRect();
        const edgeThreshold = 40;
        if (clientY < rect.top + edgeThreshold) {
          viewport.scrollTop -= Math.max(
            6,
            (rect.top + edgeThreshold - clientY) * 0.25,
          );
        } else if (clientY > rect.bottom - edgeThreshold) {
          viewport.scrollTop += Math.max(
            6,
            (clientY - (rect.bottom - edgeThreshold)) * 0.25,
          );
        }
      }

      const nextPoints = reorderClickPoints(
        latestPointsRef.current,
        dragState.draggedId,
        computeInsertionIndex(clientY, dragState.draggedId),
      );

      commitPoints(nextPoints);
      updateBottomFade();
    },
    [commitPoints, computeInsertionIndex, updateBottomFade],
  );

  useEffect(() => {
    latestPointsRef.current = settings.clickPoints;
    const frame = window.requestAnimationFrame(() => {
      updateBottomFade();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [settings.clickPoints, updateBottomFade]);

  useEffect(() => {
    const viewport = listViewportRef.current;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      updateBottomFade();
    };
    const handleWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (
        target.closest("input.adv-number-sm") &&
        target === document.activeElement
      ) {
        event.preventDefault();
      }
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    const resizeObserver = new ResizeObserver(() => {
      updateBottomFade();
    });
    resizeObserver.observe(viewport);

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      viewport.removeEventListener("wheel", handleWheel);
      resizeObserver.disconnect();
    };
  }, [updateBottomFade]);

  useEffect(() => {
    if (draggingId === null) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      dragState.latestClientY = event.clientY;
      if (moveFrameRef.current !== null) {
        return;
      }

      moveFrameRef.current = window.requestAnimationFrame(() => {
        moveFrameRef.current = null;
        updateDragOrder(dragState.latestClientY);
      });
    };

    const finishDrag = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      if (moveFrameRef.current !== null) {
        window.cancelAnimationFrame(moveFrameRef.current);
        moveFrameRef.current = null;
      }

      dragState.handle?.releasePointerCapture?.(dragState.pointerId);
      dragStateRef.current = null;
      setDraggingId(null);
      updateBottomFade();
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [draggingId, updateBottomFade, updateDragOrder]);

  const activeIndex =
    running && settings.clickPointsEnabled ? activeClickPointIndex : null;

  const handleDragStart = useCallback(
    (
      pointId: string,
      pointerId: number,
      handle: HTMLButtonElement,
      clientY: number,
    ) => {
      dragStateRef.current = {
        draggedId: pointId,
        pointerId,
        latestClientY: clientY,
        handle,
      };
      setDraggingId(pointId);
    },
    [],
  );

  return (
    <div className="adv-sectioncontainer adv-click-points-card">
      <div className="adv-card-header">
        <span className="adv-card-title">Click Points</span>
        <ToggleBtn
          value={settings.clickPointsEnabled}
          onChange={(v) => {
            if (!v && picking) {
              void cancelPick();
            }
            update({
              clickPointsEnabled: v,
            });
          }}
        />
      </div>
      <CardDivider />
      <div className="adv-card-desc">
        Choose a list of spots on your screen to click one after another. Each
        spot will use the speed and settings you chose. Choose just one spot if
        you want to click the exact same place over and over.
      </div>
      <Disableable enabled={settings.clickPointsEnabled}>
        <div className="adv-click-points-body">
          <div className="adv-click-points-controls">
            <button
              type="button"
              className="adv-secondary-btn adv-click-points-pick-btn"
              onClick={() => {
                void (picking ? cancelPick() : startPick());
              }}
            >
              {picking ? "Cancel Picking" : "Start Picking"}
            </button>
            <div className="adv-click-points-list-shell">
              <div ref={listViewportRef} className="adv-click-points-list">
                {settings.clickPoints.length === 0 ? (
                  <div className="adv-click-points-empty">
                    <div className="adv-click-points-empty-icon">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        className="lucide lucide-spline-pointer-icon lucide-spline-pointer"
                      >
                        <path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z" />
                        <path d="M5 17A12 12 0 0 1 17 5" />
                        <circle cx="19" cy="5" r="2" />
                        <circle cx="5" cy="19" r="2" />
                      </svg>
                    </div>
                    <div className="adv-click-points-empty-title">
                      No click points yet
                    </div>
                    <div className="adv-click-points-empty-hint">
                      Hit <strong>Start Picking</strong> above, then right-click
                      anywhere on screen to add a new click point.
                    </div>
                  </div>
                ) : (
                  settings.clickPoints.map(
                    (point: ClickPoint, index: number) => {
                      const isActive = activeIndex === index;
                      const stepDurationMs = Math.max(
                        1,
                        point.clicks * getEffectiveIntervalMs(settings),
                      );

                      return (
                        <ClickPointRow
                          key={point.id}
                          point={point}
                          index={index}
                          isActive={isActive}
                          isDragging={draggingId === point.id}
                          activeTick={activeClickPointTick}
                          stepDurationMs={stepDurationMs}
                          onUpdate={updatePoint}
                          onDelete={deletePoint}
                          onDragStart={handleDragStart}
                          setItemRef={setItemRef}
                        />
                      );
                    },
                  )
                )}
              </div>
              {showBottomFade ? (
                <div className="adv-click-points-list-fade" />
              ) : null}
            </div>
          </div>
          <div className="adv-click-points-footer">
            <div className="adv-click-points-option-row">
              {showInfo ? (
                <InfoIcon text="When enabled, the clicker stops after one full pass through all click points. When disabled, it loops through the list endlessly." />
              ) : null}
              <span className="adv-click-points-option-label">
                Stop when complete
              </span>
              <ToggleBtn
                value={settings.stopWhenComplete ?? false}
                onChange={(v) => update({ stopWhenComplete: v })}
              />
            </div>
          </div>
        </div>
      </Disableable>
    </div>
  );
}
