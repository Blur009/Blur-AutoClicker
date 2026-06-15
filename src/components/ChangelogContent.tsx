import { useCallback, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { ChangelogEntry } from '../changelog';
import './ChangelogContent.css';

function renderMarkdown(text: string): { __html: string } {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/(?<!["'=])https?:\/\/[^\s<)]+/g, '<a href="$&">$&</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  return { __html: html };
}

interface Props {
  entries: ChangelogEntry[];
}

export default function ChangelogContent({ entries }: Props) {
  const [expanded, setExpanded] = useState(false);

  const handleContentClick = useCallback((event: React.MouseEvent) => {
    const anchor = (event.target as Element).closest('a');
    if (anchor) {
      event.preventDefault();
      void openUrl(anchor.href);
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
      <div className={!expanded ? 'changelog-collapsed' : ''}>
        {(expanded ? entries : entries.slice(0, 1)).map((entry) => (
          <ChangelogEntryCard key={entry.version} entry={entry} />
        ))}
      </div>
      {!expanded && (
        <button
          className="changelog-expand-btn"
          onClick={() => setExpanded(true)}
        >
          <span>Show all ({entries.length - 1} more versions)</span>
          <svg
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
  return (
    <div className="changelog-entry">
      <div className="changelog-entry-header">
        <span className="changelog-version">v{entry.version}</span>
        <span className="changelog-date">{entry.date}</span>
      </div>
      {entry.sections.map((section) => (
        <div key={section.heading} className="changelog-section">
          <span className="changelog-section-heading">
            {section.heading}
          </span>
          <ul className="changelog-items">
            {section.items.map((item, i) => (
              <li key={i} className="changelog-item" dangerouslySetInnerHTML={renderMarkdown(item)} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
