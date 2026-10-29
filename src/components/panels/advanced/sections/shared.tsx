import {
  memo,
  type CSSProperties,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type WheelEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  normalizeIntegerRaw,
  normalizeDecimalLocale,
  parseDecimalLocale,
  formatDecimalLocale,
} from "../../../../numberInput";
import { inRangeDecimalValue, wheelBaseValue } from "../../../sharedCadence";
import UnavailableReason from "../../../UnavailableReason";
import { dropdownLeft } from "./dropdownPlacement";

import "./shared.css";

// ToggleBtn ← These are here just for some visual space

const ToggleBtn = memo(function ToggleBtn({
  value,
  onChange,
  disabled = false,
  disabledReason,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  useEffect(() => {
    if (disabled && value) {
      onChange(false);
    }
  }, [disabled, value, onChange]);

  const group = (
    <div className="adv-toggle-group">
      <button
        className={`adv-toggle-btn adv-toggle-off ${!value ? "active" : ""} ${disabled ? "adv-disabled" : ""}`}
        onClick={() => !disabled && onChange(false)}
        disabled={disabled}
      >
        Off
      </button>
      <button
        className={`adv-toggle-btn adv-toggle-on ${value ? "active" : ""} ${disabled ? "adv-disabled" : ""}`}
        onClick={() => !disabled && onChange(true)}
        disabled={disabled}
      >
        On
      </button>
    </div>
  );

  return disabled ? (
    <UnavailableReason reason={disabledReason}>{group}</UnavailableReason>
  ) : (
    group
  );
});

export { ToggleBtn };

// Disableable

export function Disableable({
  enabled,
  disabledReason,
  children,
}: {
  enabled: boolean;
  disabledReason?: string;
  children: ReactNode;
}) {
  const content = (
    <div className="adv-disabled-container">
      <div className={enabled ? "" : "adv-disabled-content"}>{children}</div>
      {!enabled && (
        <div className="adv-disabled-overlay">
          <span className="adv-disabled-label">Disabled</span>
        </div>
      )}
    </div>
  );

  return enabled ? (
    content
  ) : (
    <UnavailableReason
      reason={disabledReason}
      className="unavailable-reason--block"
    >
      {content}
    </UnavailableReason>
  );
}

// NumInput

export function NumInput({
  value,
  onChange,
  min,
  max,
  style,
  hoverWheel = true,
  allowDecimal = false,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  style?: CSSProperties;
  hoverWheel?: boolean;
  allowDecimal?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const wheelRef = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const latestRef = useRef({ value, min, max, onChange, hoverWheel, draft });
  useLayoutEffect(() => {
    latestRef.current.value = value;
    latestRef.current.min = min;
    latestRef.current.max = max;
    latestRef.current.onChange = onChange;
    latestRef.current.hoverWheel = hoverWheel;
    latestRef.current.draft = draft;
  });
  const normalize = allowDecimal ? normalizeDecimalLocale : normalizeIntegerRaw;
  const clampValue = (next: number) => {
    let clamped = next;
    if (min !== undefined && clamped < min) clamped = min;
    if (max !== undefined && clamped > max) clamped = max;
    return clamped;
  };

  const displayValue = allowDecimal
    ? (draft ?? formatDecimalLocale(value))
    : (draft ?? String(Math.trunc(value)));

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = allowDecimal ? parseDecimalLocale(raw) : Number(raw);
    const val = Number.isNaN(parsed) ? (min ?? 0) : parsed;
    onChange(clampValue(val));
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (wheelRef.current) {
      if (ref.current) ref.current.value = displayValue;
      return;
    }
    const raw = e.target.value;
    const normalized = normalize(raw);
    if (normalized !== raw) e.target.value = normalized;
    setDraft(normalized);
    const typed = inRangeDecimalValue(normalized, min, max);
    if (typed !== null) onChange(typed);
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    const raw = normalize(e.target.value);
    if (raw !== e.target.value) {
      e.target.value = raw;
    }
    commit(raw);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const raw = normalize(e.currentTarget.value);
    if (raw !== e.currentTarget.value) {
      e.currentTarget.value = raw;
    }
    commit(raw);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      const latest = latestRef.current;
      if (!latest.hoverWheel && e.target !== el) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      const current = wheelBaseValue(
        latest.draft,
        latest.value,
        latest.min ?? 0,
      );
      let step = 1;
      if (e.shiftKey && e.ctrlKey) step = 100;
      else if (e.ctrlKey) step = 25;
      else if (e.shiftKey) step = 5;
      let next = current + direction * step;
      if (latest.min !== undefined && next < latest.min) next = latest.min;
      if (latest.max !== undefined && next > latest.max) next = latest.max;
      wheelRef.current = true;
      setDraft(null);
      latest.onChange(next);
      setTimeout(() => {
        wheelRef.current = false;
      }, 0);
    };
    el.addEventListener("wheel", handler as unknown as EventListener, {
      passive: false,
    });
    return () =>
      el.removeEventListener("wheel", handler as unknown as EventListener);
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      className="adv-number-sm"
      value={displayValue}
      min={min}
      max={max}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{
        background: "transparent",
        border: "none",
        outline: "none",
        width: "36px",
        ...style,
      }}
    />
  );
}

// CardDivider

export function CardDivider() {
  return <div className="adv-card-divider" />;
}

// InfoIcon

export function InfoIcon({ text }: { text: string }) {
  const iconRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [placement, setPlacement] = useState<"above" | "below">("above");
  const [position, setPosition] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

  const updateTooltipPosition = useCallback(() => {
    const icon = iconRef.current;
    if (!icon) {
      return;
    }

    const rect = icon.getBoundingClientRect();
    const tooltipWidth = tooltipRef.current?.offsetWidth ?? 220;
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 80;
    const spacing = 8;
    const viewportPadding = 8;

    const maxLeft = Math.max(
      viewportPadding,
      window.innerWidth - tooltipWidth - viewportPadding,
    );
    const left = Math.max(viewportPadding, Math.min(rect.left, maxLeft));

    const fitsAbove = rect.top - spacing - tooltipHeight >= viewportPadding;
    const fitsBelow =
      rect.bottom + spacing + tooltipHeight <=
      window.innerHeight - viewportPadding;
    const nextPlacement = fitsAbove || !fitsBelow ? "above" : "below";
    const top =
      nextPlacement === "above" ? rect.top - spacing : rect.bottom + spacing;

    setPlacement(nextPlacement);
    setPosition({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }

    const id = window.requestAnimationFrame(updateTooltipPosition);

    const handleReposition = () => {
      updateTooltipPosition();
    };

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [visible, updateTooltipPosition]);

  return (
    <span
      ref={iconRef}
      className="adv-info-icon"
      tabIndex={0}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setVisible(false);
        }
      }}
      aria-label={text}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="8"
          cy="8"
          r="6.5"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <circle cx="8" cy="4.75" r="0.75" fill="currentColor" />
        <line
          x1="8"
          y1="7"
          x2="8"
          y2="11.5"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
      {visible &&
        createPortal(
          <span
            ref={tooltipRef}
            className="adv-info-tooltip adv-info-tooltip--portal"
            data-placement={placement}
            role="tooltip"
            style={
              {
                left: `${position.left}px`,
                top: `${position.top}px`,
                transform: placement === "above" ? "translateY(-100%)" : "none",
              } as CSSProperties
            }
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

// DropDown

const DROPDOWN_ROW_HEIGHT = 32;
const DROPDOWN_OVERSCAN = 4;

function filterDropdownOptions(
  options: readonly { value: string; label: string }[],
  query: string,
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter(
    (option) =>
      option.label.toLowerCase().includes(needle) ||
      option.value.toLowerCase().includes(needle),
  );
}

function scrollbarWidth(element: HTMLElement | null) {
  return element ? element.offsetWidth - element.clientWidth : 0;
}

function fontSignature(item: Element | null | undefined) {
  if (!item) return { font: "", padding: 0 };
  const style = getComputedStyle(item);
  return {
    font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
    padding:
      Number.parseFloat(style.paddingLeft) +
      Number.parseFloat(style.paddingRight),
  };
}

function measuredMenuWidth(
  font: string,
  padding: number,
  options: readonly { label: string }[],
) {
  if (!font) return 0;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return 0;
  context.font = font;
  let widest = 0;
  for (const option of options) {
    widest = Math.max(widest, context.measureText(option.label).width);
  }
  return Math.ceil(widest + padding) + 2;
}

function dropdownWindow(
  scrollTop: number,
  viewportHeight: number,
  total: number,
  rowHeight: number,
) {
  const visibleRows = Math.ceil(viewportHeight / rowHeight);
  const firstRow = Math.min(
    Math.max(0, Math.floor(scrollTop / rowHeight)),
    Math.max(0, total - 1),
  );
  const start = Math.max(0, firstRow - DROPDOWN_OVERSCAN);
  const end = Math.min(total, firstRow + visibleRows + DROPDOWN_OVERSCAN);
  return { start, end };
}

export function AdvDropdown({
  value,
  options,
  onChange,
  hoverWheel = true,
  allowWindowOverflow = false,
  windowOverflowBottom = 190,
  searchable = false,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  hoverWheel?: boolean;
  allowWindowOverflow?: boolean;
  windowOverflowBottom?: number;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [positioned, setPositioned] = useState(false);
  const [placement, setPlacement] = useState<"below" | "above">("below");
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [listWindow, setListWindow] = useState({ start: 0, end: 0 });
  const [rowHeight, setRowHeight] = useState(DROPDOWN_ROW_HEIGHT);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const widthCache = useRef({ options, font: "", width: 0 });
  const wasOpen = useRef(false);

  const filtered = useMemo(
    () => filterDropdownOptions(options, searchable ? query : ""),
    [options, query, searchable],
  );

  const applyWindow = useCallback(
    (row: number) => {
      const list = listRef.current;
      if (!list) return;
      const next = dropdownWindow(
        list.scrollTop,
        list.clientHeight,
        filtered.length,
        row,
      );
      setListWindow((prev) =>
        prev.start === next.start && prev.end === next.end ? prev : next,
      );
    },
    [filtered.length],
  );

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setQuery("");
    setActiveIndex(options.findIndex((option) => option.value === value));
    setListWindow({ start: 0, end: 0 });
    setPositioned(false);
    setOpen(true);
  };

  useEffect(() => {
    if (!allowWindowOverflow) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("blur-dropdown-overflow", {
        detail: {
          active: open,
          bottom: open ? windowOverflowBottom : 0,
        },
      }),
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent("blur-dropdown-overflow", {
          detail: {
            active: false,
            bottom: 0,
          },
        }),
      );
    };
  }, [allowWindowOverflow, open, windowOverflowBottom]);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = ref.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight ?? 0;
      const { font, padding } = fontSignature(
        menuRef.current?.querySelector(".adv-dropdown-item"),
      );
      const cache = widthCache.current;
      if (
        cache.options !== options ||
        cache.font !== font ||
        cache.width === 0
      ) {
        const measured = measuredMenuWidth(font, padding, options);
        if (measured > 0)
          widthCache.current = { options, font, width: measured };
      }
      const contentWidth =
        widthCache.current.width + scrollbarWidth(listRef.current);
      const menuWidth = contentWidth || (menuRef.current?.offsetWidth ?? 0);
      const spacing = 4;

      const fitsBelow =
        rect.bottom + spacing + menuHeight <= window.innerHeight;
      const fitsAbove = rect.top - spacing - menuHeight >= 0;
      const nextPlacement = !fitsBelow && fitsAbove ? "above" : "below";
      const top =
        nextPlacement === "below"
          ? rect.bottom + spacing
          : rect.top - spacing - menuHeight;
      const left = dropdownLeft(
        rect.left,
        rect.right,
        menuWidth,
        window.innerWidth,
      );

      setPlacement(nextPlacement);
      setPos((prev) =>
        prev.top === top && prev.left === left && prev.width === menuWidth
          ? prev
          : { top, left, width: menuWidth },
      );
      setPositioned(true);
    };

    const frame = window.requestAnimationFrame(updatePosition);
    const handleScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      updatePosition();
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, options, listWindow]);

  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;

    const row =
      list.querySelector<HTMLElement>(".adv-dropdown-item")?.offsetHeight ||
      rowHeight;
    if (row !== rowHeight) setRowHeight(row);

    if (activeIndex >= 0) {
      const rowTop = activeIndex * row;
      const rowBottom = rowTop + row;
      if (rowTop < list.scrollTop) {
        list.scrollTop = rowTop;
      } else if (rowBottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = rowBottom - list.clientHeight;
      }
    }

    applyWindow(row);
  }, [open, activeIndex, filtered, rowHeight, applyWindow]);

  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;

    const row =
      list.querySelector<HTMLElement>(".adv-dropdown-item")?.offsetHeight;
    if (!row || row === rowHeight) return;
    setRowHeight(row);
    applyWindow(row);
  }, [open, listWindow, rowHeight, applyWindow]);

  useEffect(() => {
    if (!open || !searchable || !positioned) return;
    inputRef.current?.focus();
  }, [open, searchable, positioned]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    if (document.activeElement && document.activeElement !== document.body) {
      return;
    }
    ref.current
      ?.querySelector<HTMLButtonElement>(".adv-dropdown-trigger")
      ?.focus();
  }, [open]);

  const handleListScroll = () => {
    applyWindow(rowHeight);
  };

  const handleQueryChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setActiveIndex(0);
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      const option = filtered[activeIndex] ?? filtered[0];
      if (!option) return;
      e.preventDefault();
      onChange(option.value);
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (filtered.length === 0) return;
      e.preventDefault();
      setActiveIndex((prev) =>
        e.key === "ArrowDown"
          ? Math.min(filtered.length - 1, Math.max(0, prev + 1))
          : Math.max(0, prev - 1),
      );
    }
  };

  const handleWheel = (e: WheelEvent) => {
    if (!hoverWheel || open) return;
    e.preventDefault();
    const currentIndex = options.findIndex((o) => o.value === value);
    if (currentIndex === -1) return;
    const direction = e.deltaY < 0 ? -1 : 1;
    const nextIndex = Math.max(
      0,
      Math.min(options.length - 1, currentIndex + direction),
    );
    if (nextIndex !== currentIndex) {
      onChange(options[nextIndex].value);
    }
  };

  const activeLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="adv-dropdown" ref={ref} onWheel={handleWheel}>
      <button type="button" className="adv-dropdown-trigger" onClick={toggle}>
        <span>{activeLabel}</span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          style={{ marginLeft: 4, flexShrink: 0 }}
        >
          <path
            d="M1 1L5 5L9 1"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="adv-dropdown-menu adv-dropdown-menu--portal"
            aria-hidden={!positioned}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width || undefined,
              zIndex: 10000,
              transform: placement === "above" ? "translateY(-4px)" : "none",
              visibility: positioned ? "visible" : "hidden",
              pointerEvents: positioned ? "auto" : "none",
            }}
          >
            {searchable && (
              <input
                ref={inputRef}
                className="adv-dropdown-search"
                type="text"
                value={query}
                placeholder="Search"
                onChange={handleQueryChange}
                onKeyDown={handleSearchKeyDown}
              />
            )}
            <div
              ref={listRef}
              className="adv-dropdown-list"
              onScroll={handleListScroll}
            >
              {listWindow.start > 0 && (
                <div style={{ height: listWindow.start * rowHeight }} />
              )}
              {filtered
                .slice(listWindow.start, listWindow.end)
                .map((option, offset) => {
                  const index = listWindow.start + offset;
                  const active = searchable
                    ? index === activeIndex
                    : option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`adv-dropdown-item ${active ? "active" : ""}`}
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              {listWindow.end < filtered.length && (
                <div
                  style={{
                    height: (filtered.length - listWindow.end) * rowHeight,
                  }}
                />
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
