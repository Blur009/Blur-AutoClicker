import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { getEffectiveIntervalMs } from "../../../cadence";
import type { SequencePoint, Settings } from "../../../store";
import { useTranslation } from "../../../i18n";
import { invoke } from "@tauri-apps/api/core";
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
}

interface CursorPoint {
  x: number;
  y: number;
}

interface DragState {
  draggedId: string;
  pointerId: number;
  latestClientY: number;
  handle: HTMLButtonElement | null;
}

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
}: Props) {
  const { t } = useTranslation();
  const [capturingCursor, setCapturingCursor] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const listViewportRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const latestPointsRef = useRef(settings.sequencePoints);
  const dragStateRef = useRef<DragState | null>(null);
  const moveFrameRef = useRef<number | null>(null);

  const requestCursorPosition = useCallback(async (): Promise<CursorPoint> => {
    setCapturingCursor(true);
    try {
      return await invoke<CursorPoint>("pick_position");
    } finally {
      setCapturingCursor(false);
    }
  }, []);

  useEffect(() => {
    if (countdown === null || countdown < 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (countdown !== 0) return;

    const captureAfterCountdown = async () => {
      try {
        const point = await requestCursorPosition();
        update({
          sequenceEnabled: true,
          sequencePoints: [
            ...settings.sequencePoints,
            { id: createSequencePointId(), ...point, clicks: 1 },
          ],
        });
      } finally {
        setCountdown(null);
      }
    };

    void captureAfterCountdown();
  }, [countdown, requestCursorPosition, settings.sequencePoints, update]);

  const addCurrentCursorToSequence = async () => {
    setCountdown(3);
  };

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
    updateBottomFade();
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
      // Keep wheel changes on number inputs local to the field and prevent
      // the parent list viewport from scrolling.
      if (target.closest("input.adv-number-sm")) {
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
            <InfoIcon text={t("advanced.sequenceClickingDescription")} />
          ) : null}
          <span className="adv-card-title">
            {t("advanced.sequenceClicking")}
          </span>
        </div>
        <ToggleBtn
          value={settings.sequenceEnabled}
          onChange={(v) =>
            update({
              sequenceEnabled: v,
            })
          }
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
                void addCurrentCursorToSequence();
              }}
              disabled={capturingCursor || countdown !== null}
            >
              {countdown !== null
                ? countdown === 0
                  ? t("advanced.sequenceCapturing")
                  : `${t("advanced.sequenceAddingIn")} ${countdown}...`
                : t("advanced.sequenceAddCurrentCursor")}
            </button>
            <div className="adv-sequence-list-shell">
              <div ref={listViewportRef} className="adv-sequence-list">
                {settings.sequencePoints.length === 0 ? (
                  <div className="adv-sequence-empty">
                    {t("advanced.sequenceEmpty")}
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
                          <div className="adv-sequence-leading">
                            <span className="adv-sequence-index">
                              {index + 1}
                            </span>
                            <button
                              type="button"
                              className="adv-sequence-drag-handle"
                              aria-label={`${t("advanced.sequenceMoveUp")} / ${t("advanced.sequenceMoveDown")}`}
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
                          <div className="adv-numbox-sm adv-sequence-coord">
                            <span className="adv-unit adv-axis-label">X</span>
                            <NumInput
                              value={point.x}
                              onChange={(value) =>
                                updateSequencePoint(index, { x: value })
                              }
                              style={{ width: "6ch", textAlign: "right" }}
                            />
                          </div>
                          <div className="adv-numbox-sm adv-sequence-coord">
                            <span className="adv-unit adv-axis-label">Y</span>
                            <NumInput
                              value={point.y}
                              onChange={(value) =>
                                updateSequencePoint(index, { y: value })
                              }
                              style={{ width: "6ch", textAlign: "right" }}
                            />
                          </div>
                          <div className="adv-numbox-sm adv-sequence-coord adv-sequence-clicks">
                            <span className="adv-unit adv-axis-label">
                              {t("advanced.clicksUnit")}
                            </span>
                            <NumInput
                              value={point.clicks}
                              min={1}
                              max={1000}
                              onChange={(value) =>
                                updateSequencePoint(index, { clicks: value })
                              }
                              style={{ width: "4ch", textAlign: "right" }}
                            />
                          </div>
                          <div className="adv-sequence-actions">
                            <button
                              type="button"
                              className="adv-sequence-delete"
                              onClick={() => deleteSequencePoint(index)}
                              aria-label={t("advanced.sequenceDelete")}
                              title={t("advanced.sequenceDelete")}
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
