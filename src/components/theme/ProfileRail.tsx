import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { MAX_THEME_PROFILES, type ThemeProfile } from "../../themeModel";

interface Props {
  profiles: ThemeProfile[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

interface MenuState {
  profileId: string;
  x: number;
  y: number;
}

function PlusIcon() {
  return (
    <svg
      className="theme-rail-add-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export default function ProfileRail({
  profiles,
  activeId,
  onSelect,
  onNew,
  onDuplicate,
  onDelete,
}: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const railItemRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusRef = useRef<"duplicate" | "delete" | null>(null);
  const deleteIndexRef = useRef(0);

  const atLimit = profiles.length >= MAX_THEME_PROFILES;
  const visibleMenu =
    menu && profiles.some((profile) => profile.id === menu.profileId)
      ? menu
      : null;

  const openMenu = (
    profileId: string,
    x: number,
    y: number,
    opener: HTMLElement,
  ) => {
    openerRef.current = opener;
    setConfirmDelete(false);
    setMenuPosition({ left: x, top: y });
    setMenu({ profileId, x, y });
  };

  const closeMenu = useCallback(() => {
    const active = document.activeElement;
    const menuElement = menuRef.current;
    setMenu(null);
    const nothingElseFocused =
      !active ||
      active === document.body ||
      (menuElement !== null && menuElement.contains(active));
    if (nothingElseFocused) openerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!visibleMenu) return;
    const element = menuRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const left = Math.min(
      visibleMenu.x,
      Math.max(0, window.innerWidth - rect.width),
    );
    const top = Math.min(
      visibleMenu.y,
      Math.max(0, window.innerHeight - rect.height),
    );
    setMenuPosition((previous) =>
      previous.left === left && previous.top === top ? previous : { left, top },
    );
  }, [visibleMenu, confirmDelete]);

  useLayoutEffect(() => {
    if (visibleMenu) firstItemRef.current?.focus();
  }, [visibleMenu]);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    const target =
      pending === "duplicate"
        ? profiles[profiles.length - 1]
        : profiles[Math.min(deleteIndexRef.current, profiles.length - 1)];
    if (target) railItemRefs.current.get(target.id)?.focus();
  }, [profiles]);

  useEffect(() => {
    if (!visibleMenu) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      closeMenu();
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu();
    };

    const handleFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (
        next instanceof Node &&
        (menuRef.current?.contains(next) || openerRef.current?.contains(next))
      ) {
        return;
      }
      setMenu(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusout", handleFocusOut);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("blur", closeMenu);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("blur", closeMenu);
    };
  }, [closeMenu, visibleMenu]);

  const handleRailKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    profileId: string,
  ) => {
    const opensMenu =
      event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
    if (!opensMenu) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    openMenu(profileId, rect.left, rect.bottom, event.currentTarget);
  };

  return (
    <aside className="theme-rail" aria-label="Theme profiles">
      <div className="theme-rail-header">
        <span>Profiles</span>
        <span className="theme-rail-count">
          {profiles.length}/{MAX_THEME_PROFILES}
        </span>
      </div>
      <div className="theme-rail-list">
        {profiles.map((profile) => (
          <div
            className="theme-rail-item"
            data-active={profile.id === activeId}
            key={profile.id}
          >
            <button
              ref={(element) => {
                if (element) railItemRefs.current.set(profile.id, element);
                else railItemRefs.current.delete(profile.id);
              }}
              type="button"
              className="theme-rail-profile"
              aria-label={`Edit profile ${profile.name}`}
              aria-current={profile.id === activeId ? "true" : undefined}
              aria-haspopup="menu"
              aria-expanded={visibleMenu?.profileId === profile.id}
              onClick={() => onSelect(profile.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                openMenu(
                  profile.id,
                  event.clientX,
                  event.clientY,
                  event.currentTarget,
                );
              }}
              onKeyDown={(event) => handleRailKey(event, profile.id)}
            >
              <span className="theme-rail-name">{profile.name}</span>
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="theme-icon-btn theme-rail-add"
        aria-label="New profile"
        aria-disabled={atLimit}
        aria-describedby={atLimit ? "theme-rail-limit-note" : undefined}
        onClick={() => {
          if (atLimit) return;
          onNew();
        }}
      >
        <PlusIcon />
      </button>
      {atLimit && (
        <p className="theme-rail-note" id="theme-rail-limit-note">
          The {MAX_THEME_PROFILES} theme limit is reached.
        </p>
      )}
      {visibleMenu && (
        <div
          ref={menuRef}
          className="theme-menu"
          role="menu"
          aria-label="Profile actions"
          style={{ left: menuPosition.left, top: menuPosition.top }}
        >
          <button
            ref={atLimit ? undefined : firstItemRef}
            type="button"
            role="menuitem"
            className="theme-menu-item"
            disabled={atLimit}
            onClick={() => {
              const id = visibleMenu.profileId;
              closeMenu();
              if (profiles.length >= MAX_THEME_PROFILES) return;
              pendingFocusRef.current = "duplicate";
              onDuplicate(id);
            }}
          >
            Duplicate
          </button>
          <button
            ref={atLimit ? firstItemRef : undefined}
            type="button"
            role="menuitem"
            className="theme-menu-item theme-menu-item--danger"
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              const id = visibleMenu.profileId;
              deleteIndexRef.current = profiles.findIndex(
                (profile) => profile.id === id,
              );
              pendingFocusRef.current = "delete";
              closeMenu();
              onDelete(id);
            }}
          >
            {confirmDelete ? "Confirm delete" : "Delete"}
          </button>
        </div>
      )}
    </aside>
  );
}
