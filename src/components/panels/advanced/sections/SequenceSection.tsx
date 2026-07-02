import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { error } from "@tauri-apps/plugin-log";
import { getEffectiveIntervalMs } from "../../../../cadence";
import type { SequencePoint, Settings } from "../../../../store";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  NumInput,
  Disableable,
  CardDivider,
  ToggleBtn,
  InfoIcon,
} from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
  running: boolean;
  activeSequenceIndex: number | null;
  activeSequenceTick: number;
}

interface SequencePointPickedPayload {
  x: number;
  y: number;
  continuePicking: boolean;
}

interface SequencePointDeleteRequestedPayload {
  x: number;
  y: number;
}

interface DragState {
  draggedId: string;
  pointerId: number;
  latestClientY: number;
  handle: HTMLButtonElement | null;
}

const SEQUENCE_DELETE_RADIUS_PX = 10;

function createSequencePointId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `seq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function reorderSequencePoints(
  points: SequencePoint[],
  draggedId: string,
  insertionIndex: number,
): SequencePoint[] {
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

function haveSameOrder(a: SequencePoint[], b: SequencePoint[]) {
  return (
    a.length === b.length &&
    a.every((point, index) => point.id === b[index]?.id)
  );
}

export default function SequenceSection({
  settings,
  update,
  showInfo,
  running,
  activeSequenceIndex,
  activeSequenceTick,
}: Props) {
  const [pickingSequence, setPickingSequence] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const listViewportRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const latestPointsRef = useRef(settings.sequencePoints);
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

    void listen<SequencePointPickedPayload>(
      "sequence-point-picked",
      (event) => {
        const nextPoints = [
          ...latestPointsRef.current,
          {
            id: createSequencePointId(),
            x: event.payload.x,
            y: event.payload.y,
            clicks: 1,
          },
        ];
        latestPointsRef.current = nextPoints;
        updateRef.current({
          sequenceEnabled: true,
          sequencePoints: nextPoints,
        });

        if (!event.payload.continuePicking) {
          setPickingSequence(false);
        }
      },
    ).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlistenPicked = cleanup;
      }
    });

    void listen<SequencePointDeleteRequestedPayload>(
      "sequence-point-delete-requested",
      (event) => {
        const radiusSquared = SEQUENCE_DELETE_RADIUS_PX ** 2;
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
        updateRef.current({ sequencePoints: nextPoints });
      },
    ).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlistenDeleteRequested = cleanup;
      }
    });

    void listen("sequence-pick-ended", () => {
      setPickingSequence(false);
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
      void invoke("cancel_sequence_point_pick");
    };
  }, []);

  const startSequencePointPick = useCallback(async () => {
    setPickingSequence(true);
    try {
      await invoke("start_sequence_point_pick");
    } catch (err) {
      setPickingSequence(false);
      error(
        JSON.stringify({
          source: "SequenceSection.startPick",
          error: String(err),
        }),
      );
    }
  }, []);

  const cancelSequencePointPick = useCallback(async () => {
    setPickingSequence(false);
    try {
      await invoke("cancel_sequence_point_pick");
    } catch (err) {
      error(
        JSON.stringify({
          source: "SequenceSection.cancelPick",
          error: String(err),
        }),
      );
    }
  }, []);

  useEffect(() => {
    if (!pickingSequence) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void cancelSequencePointPick();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [cancelSequencePointPick, pickingSequence]);

  const updateSequencePoint = (
    index: number,
    patch: Partial<SequencePoint>,
  ) => {
    const nextPoints = settings.sequencePoints.map(
      (point: SequencePoint, pointIndex: number) =>
        pointIndex === index ? { ...point, ...patch } : point,
    );
    update({ sequencePoints: nextPoints });
  };

  const deleteSequencePoint = (index: number) => {
    const nextPoints = settings.sequencePoints.filter(
      (_: SequencePoint, pointIndex: number) => pointIndex !== index,
    );
    update({ sequencePoints: nextPoints });
  };

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

  const commitSequencePoints = useCallback(
    (nextPoints: SequencePoint[]) => {
      if (haveSameOrder(latestPointsRef.current, nextPoints)) {
        return;
      }
      latestPointsRef.current = nextPoints;
      update({ sequencePoints: nextPoints });
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
          (entry): entry is { point: SequencePoint; rect: DOMRect } =>
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

      const nextPoints = reorderSequencePoints(
        latestPointsRef.current,
        dragState.draggedId,
        computeInsertionIndex(clientY, dragState.draggedId),
      );

      commitSequencePoints(nextPoints);
      updateBottomFade();
    },
    [commitSequencePoints, computeInsertionIndex, updateBottomFade],
  );

  useEffect(() => {
    latestPointsRef.current = settings.sequencePoints;
    const frame = window.requestAnimationFrame(() => {
      updateBottomFade();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [settings.sequencePoints, updateBottomFade]);

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
      // Keep wheel changes on focused number inputs local to the field and
      // prevent the parent list viewport from scrolling.
      // Unfocused inputs let the event through so the list scrolls instead.
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
    running && settings.sequenceEnabled ? activeSequenceIndex : null;

  return (
    <div className="adv-sectioncontainer adv-sequence-card">
      <div className="adv-card-header">
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {showInfo ? (
            <InfoIcon text="Cycles through saved cursor positions in round-robin order, applying the current global timing and click settings at each point." />
          ) : null}
          <span className="adv-card-title">Sequence Clicking</span>
        </div>
        <ToggleBtn
          value={settings.sequenceEnabled}
          onChange={(v) => {
            if (!v && pickingSequence) {
              void cancelSequencePointPick();
            }
            update({
              sequenceEnabled: v,
            });
          }}
        />
      </div>
      <CardDivider />
      <Disableable enabled={settings.sequenceEnabled}>
        <div className="adv-sequence-body">
          <div className="adv-sequence-controls">
            <button
              type="button"
              className="adv-secondary-btn"
              onClick={() => {
                void (pickingSequence
                  ? cancelSequencePointPick()
                  : startSequencePointPick());
              }}
            >
              {pickingSequence ? "Cancel Picking" : "Start Picking"}
            </button>
            <div className="adv-sequence-list-shell">
              <div ref={listViewportRef} className="adv-sequence-list">
                {settings.sequencePoints.length === 0 ? (
                  <div className="adv-sequence-empty">
                    No sequence points saved yet.
                  </div>
                ) : (
                  settings.sequencePoints.map(
                    (point: SequencePoint, index: number) => {
                      const isActive = activeIndex === index;
                      const stepDurationMs = Math.max(
                        1,
                        point.clicks * getEffectiveIntervalMs(settings),
                      );

                      return (
                        <div
                          key={point.id}
                          ref={(node) => {
                            if (node) {
                              itemRefs.current.set(point.id, node);
                            } else {
                              itemRefs.current.delete(point.id);
                            }
                          }}
                          className={`adv-sequence-item ${
                            draggingId === point.id
                              ? "adv-sequence-item--dragging"
                              : ""
                          } ${isActive ? "adv-sequence-item--active" : ""}`}
                          style={
                            isActive
                              ? ({
                                  "--sequence-step-duration": `${stepDurationMs}ms`,
                                  "--sequence-step-clicks": point.clicks,
                                } as CSSProperties)
                              : undefined
                          }
                        >
                          {isActive ? (
                            <span
                              key={activeSequenceTick}
                              className="adv-sequence-progress"
                            />
                          ) : null}
                          <div className="adv-sequence-leading">
                            <span className="adv-sequence-index">
                              {index + 1}
                            </span>
                            <button
                              type="button"
                              className="adv-sequence-drag-handle"
                              aria-label="Up / Down"
                              onPointerDown={(event) => {
                                event.preventDefault();
                                const handle = event.currentTarget;
                                handle.setPointerCapture(event.pointerId);
                                dragStateRef.current = {
                                  draggedId: point.id,
                                  pointerId: event.pointerId,
                                  latestClientY: event.clientY,
                                  handle,
                                };
                                setDraggingId(point.id);
                              }}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 12 12"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                              >
                                <path
                                  d="M2 3H10M2 6H10M2 9H10"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                          </div>
                          <label
                            className="adv-numbox-sm adv-sequence-coord adv-sequence-position"
                            style={{ gap: "6px" }}
                          >
                            <span
                              className="adv-unit"
                              style={{
                                minWidth: "0.125rem",
                                textAlign: "center",
                              }}
                            >
                              X
                            </span>
                            <NumInput
                              hoverWheel={false}
                              value={point.x}
                              onChange={(value) =>
                                updateSequencePoint(index, { x: value })
                              }
                              style={{
                                flex: 1,
                                width: "100%",
                                textAlign: "right",
                              }}
                            />
                          </label>
                          <label
                            className="adv-numbox-sm adv-sequence-coord adv-sequence-position"
                            style={{ gap: "6px" }}
                          >
                            <span
                              className="adv-unit"
                              style={{
                                minWidth: "0.125rem",
                                textAlign: "left",
                              }}
                            >
                              Y
                            </span>
                            <NumInput
                              hoverWheel={false}
                              value={point.y}
                              onChange={(value) =>
                                updateSequencePoint(index, { y: value })
                              }
                              style={{
                                flex: 1,
                                width: "100%",
                                textAlign: "right",
                              }}
                            />
                          </label>
                          <label
                            className="adv-numbox-sm adv-sequence-coord adv-sequence-clicks"
                            style={{ gap: "6px" }}
                          >
                            <span
                              className="adv-unit"
                              style={{ minWidth: "0.75rem", textAlign: "left" }}
                            >
                              clicks
                            </span>
                            <NumInput
                              hoverWheel={false}
                              value={point.clicks}
                              min={1}
                              max={100000}
                              onChange={(value) =>
                                updateSequencePoint(index, { clicks: value })
                              }
                              style={{
                                flex: 1,
                                width: "100%",
                                textAlign: "right",
                              }}
                            />
                          </label>
                          <div className="adv-sequence-actions">
                            <button
                              type="button"
                              className="adv-sequence-delete"
                              onClick={() => deleteSequencePoint(index)}
                              aria-label="Delete"
                              title="Delete"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 12 12"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                              >
                                <path
                                  d="M2.5 3.5H9.5M4.25 3.5V2.75C4.25 2.34 4.59 2 5 2H7C7.41 2 7.75 2.34 7.75 2.75V3.5M8.75 3.5V9C8.75 9.55 8.3 10 7.75 10H4.25C3.7 10 3.25 9.55 3.25 9V3.5M5 5.25V8.25M7 5.25V8.25"
                                  stroke="currentColor"
                                  strokeWidth="1.1"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    },
                  )
                )}
              </div>
              {showBottomFade ? (
                <div className="adv-sequence-list-fade" />
              ) : null}
            </div>
          </div>
        </div>
      </Disableable>
    </div>
  );
}
