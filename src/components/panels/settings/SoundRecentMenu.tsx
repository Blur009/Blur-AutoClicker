import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon, XIcon } from "@animateicons/react/lucide";
import {
  filterRecentSoundPaths,
  soundFileNameOf,
  soundFolderOf,
} from "../../../soundRecents";
import { dropdownLeft } from "../advanced/sections/dropdownPlacement";

const POPOVER_WIDTH = 304;
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;

interface Props {
  paths: readonly string[];
  label: string;
  onPick: (path: string) => void;
  onRemove: (path: string) => void;
}

export default function SoundRecentMenu({
  paths,
  label,
  onPick,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef(false);

  const matches = useMemo(
    () => filterRecentSoundPaths(paths, query),
    [paths, query],
  );

  const width = Math.min(
    POPOVER_WIDTH,
    Math.max(0, window.innerWidth - VIEWPORT_MARGIN * 2),
  );

  const close = useCallback((restoreFocus = false) => {
    restoreFocusRef.current = restoreFocus;
    setOpen(false);
    setQuery("");
    setPosition(null);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const toggle = toggleRef.current;
    const popover = popoverRef.current;
    if (!toggle) return;
    const anchor = toggle.getBoundingClientRect();
    const menuWidth = Math.min(
      POPOVER_WIDTH,
      window.innerWidth - VIEWPORT_MARGIN * 2,
    );
    const height = popover?.offsetHeight ?? 0;
    const below = anchor.bottom + ANCHOR_GAP;
    const flip =
      height > 0 && below + height > window.innerHeight - VIEWPORT_MARGIN;
    const top = flip
      ? Math.max(VIEWPORT_MARGIN, anchor.top - ANCHOR_GAP - height)
      : below;
    const left = dropdownLeft(
      anchor.left,
      anchor.right,
      menuWidth,
      window.innerWidth,
    );
    setPosition({ left, top });
  }, [open, query, matches.length]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close(true);
    };
    const onScroll = (event: Event) => {
      if (popoverRef.current?.contains(event.target as Node)) return;
      close();
    };
    const onResize = () => close();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    toggleRef.current?.focus();
  }, [open]);

  return (
    <div className="sound-recent" ref={wrapperRef}>
      <button
        ref={toggleRef}
        type="button"
        className="settings-btn-quiet sound-recent-toggle"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Recent ${label.toLowerCase()} sound files`}
        title="Recent sound files"
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        <ChevronDownIcon size={12} isAnimated={false} aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="sound-recent-popover"
            role="dialog"
            aria-label="Recent sound files"
            style={{
              left: position ? position.left : 0,
              top: position ? position.top : 0,
              width,
              visibility: position ? "visible" : "hidden",
            }}
          >
            <input
              ref={searchRef}
              type="search"
              className="sound-recent-search"
              placeholder="Search files"
              aria-label="Search files in recent sounds"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <p className="sound-recent-status" role="status">
              {paths.length === 0
                ? "No sounds picked yet."
                : matches.length === 0
                  ? "No file matches that."
                  : `${matches.length} of ${paths.length} files`}
            </p>
            {matches.length > 0 && (
              <ul className="sound-recent-list">
                {matches.map((path) => (
                  <li key={path} className="sound-recent-row">
                    <button
                      type="button"
                      className="sound-recent-pick"
                      onClick={() => {
                        onPick(path);
                        close(true);
                      }}
                    >
                      <span className="sound-recent-name">
                        {soundFileNameOf(path)}
                      </span>
                      <span className="sound-recent-path">
                        {soundFolderOf(path)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="sound-recent-remove"
                      aria-label={`Remove ${soundFileNameOf(path)} from history`}
                      title="Remove from history"
                      onClick={() => {
                        onRemove(path);
                        searchRef.current?.focus();
                      }}
                    >
                      <XIcon size={10} isAnimated={false} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
