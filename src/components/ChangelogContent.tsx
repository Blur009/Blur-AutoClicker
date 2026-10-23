import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ChangelogEntry } from "../changelog";
import "./ChangelogContent.css";

const MARKDOWN_CACHE_MAX = 20;

interface RenderedItem {
  html: { __html: string };
  subitems: Array<{ __html: string }>;
}

const markdownCache = new Map<string, RenderedItem[][]>();

function renderMarkdown(text: string): { __html: string } {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html
    .split(/(<a[^>]*>.*?<\/a>|<code>.*?<\/code>)/g)
    .map((part) =>
      part.startsWith("<a") || part.startsWith("<code")
        ? part
        : part.replace(/(?<!["'=])https?:\/\/[^\s<)]+/g, '<a href="$&">$&</a>'),
    )
    .join("");

  return { __html: html };
}

function renderEntryItems(entry: ChangelogEntry): RenderedItem[][] {
  const cached = markdownCache.get(entry.version);
  if (cached) return cached;
  const rendered = entry.sections.map((section) =>
    section.items.map((item) => ({
      html: renderMarkdown(item.text),
      subitems: item.subitems.map((subitem) => renderMarkdown(subitem)),
    })),
  );
  if (markdownCache.size >= MARKDOWN_CACHE_MAX) {
    const oldest = markdownCache.keys().next();
    if (!oldest.done) markdownCache.delete(oldest.value);
  }
  markdownCache.set(entry.version, rendered);
  return rendered;
}

interface Props {
  entries: ChangelogEntry[];
}

export default function ChangelogContent({ entries }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [keepAllEntries, setKeepAllEntries] = useState(false);
  const clipRef = useRef<HTMLDivElement>(null);
  const fromHeightRef = useRef<number | null>(null);

  const toggleExpanded = useCallback((next: boolean) => {
    fromHeightRef.current = clipRef.current?.offsetHeight ?? null;
    if (next) setKeepAllEntries(true);
    setExpanded(next);
  }, []);

  useLayoutEffect(() => {
    const clip = clipRef.current;
    const from = fromHeightRef.current;
    fromHeightRef.current = null;
    if (!clip || from === null) return;

    clip.style.maxHeight = "";
    const firstEntry = clip.firstElementChild as HTMLElement | null;
    const cap = parseFloat(getComputedStyle(clip).maxHeight);
    const to = expanded
      ? clip.scrollHeight
      : Math.min(
          firstEntry?.offsetHeight ?? clip.scrollHeight,
          Number.isFinite(cap) ? cap : Infinity,
        );
    if (from === to) return;

    clip.style.maxHeight = `${from}px`;
    void clip.offsetHeight;
    clip.style.maxHeight = `${to}px`;
  }, [expanded]);

  useLayoutEffect(() => {
    const clip = clipRef.current;
    if (!clip || expanded || keepAllEntries) return;
    clip.style.maxHeight = "";
  }, [expanded, keepAllEntries]);

  const clearAnimatedHeight = useCallback(
    (event: ReactTransitionEvent<HTMLDivElement>) => {
      const clip = clipRef.current;
      if (
        !clip ||
        event.target !== clip ||
        event.propertyName !== "max-height"
      ) {
        return;
      }
      if (expanded) clip.style.maxHeight = "";
      else setKeepAllEntries(false);
    },
    [expanded],
  );

  const handleContentClick = useCallback((event: React.MouseEvent) => {
    const anchor = (event.target as Element).closest("a");
    if (anchor) {
      event.preventDefault();
      try {
        const raw = anchor.getAttribute("href") || "";
        const decoded = raw
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
        const lower = decoded.toLowerCase();
        if (!lower.startsWith("http://") && !lower.startsWith("https://"))
          return;
        const url = new URL(decoded);
        if (url.protocol === "https:" || url.protocol === "http:") {
          void openUrl(decoded);
        }
      } catch {
        void 0;
      }
    }
  }, []);

  if (entries.length <= 1) {
    return (
      <div className="changelog-content" onClick={handleContentClick}>
        {entries.map((entry) => (
          <ChangelogEntryCard key={entry.version} entry={entry} />
        ))}
      </div>
    );
  }

  return (
    <div className="changelog-content" onClick={handleContentClick}>
      <div
        ref={clipRef}
        className={`changelog-clip${expanded ? "" : " changelog-collapsed"}`}
        onTransitionEnd={clearAnimatedHeight}
      >
        {(expanded || keepAllEntries ? entries : entries.slice(0, 1)).map(
          (entry) => (
            <ChangelogEntryCard key={entry.version} entry={entry} />
          ),
        )}
      </div>
      {!expanded && (
        <button
          className="changelog-expand-btn"
          onClick={() => toggleExpanded(true)}
        >
          <span>Show all ({entries.length - 1} more versions)</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M3 1L7 5L3 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      {expanded && (
        <button
          className="changelog-expand-btn"
          onClick={() => toggleExpanded(false)}
        >
          <span>Show less</span>
          <svg
            className="changelog-expand-arrow--up"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
          >
            <path
              d="M3 1L7 5L3 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

function ChangelogEntryCard({ entry }: { entry: ChangelogEntry }) {
  const renderedItems = renderEntryItems(entry);
  return (
    <div className="changelog-entry">
      <div className="changelog-entry-header">
        <span className="changelog-version">v{entry.version}</span>
        <span className="changelog-date">{entry.date}</span>
      </div>
      {entry.sections.map((section, s) => (
        <div key={section.heading} className="changelog-section">
          <span className="changelog-section-heading">{section.heading}</span>
          <ul className="changelog-items">
            {section.items.map((item, i) => {
              const rendered = renderedItems[s]?.[i];
              const subitems = rendered?.subitems ?? [];
              return (
                <li key={i} className="changelog-item">
                  <span
                    dangerouslySetInnerHTML={
                      rendered?.html ?? renderMarkdown(item.text)
                    }
                  />
                  {subitems.length > 0 && (
                    <ul className="changelog-subitems">
                      {subitems.map((subitem, j) => (
                        <li
                          key={j}
                          className="changelog-subitem"
                          dangerouslySetInnerHTML={subitem}
                        />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
