// i18n.ts
// Sets up internationalization (i18n) with a small React context and JSON files.
// Defines available languages and translation resources.
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import ar from "./locales/ar.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";

export const LANGUAGE_CODES = ["en", "es", "fr", "ar", "de"] as const;
export type Language = (typeof LANGUAGE_CODES)[number];

export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGE_OPTIONS: readonly { code: Language; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
  { code: "de", label: "Deutsch"},
];

type TranslationTree = typeof en;
type DotKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${DotKeys<T[K]>}`;
}[keyof T & string];
export type TranslationKey = DotKeys<TranslationTree>;

type TranslationVars = Record<string, string | number>;

const translations: Record<Language, TranslationTree> = {
  en,
  es,
  fr,
  ar,
  de,
};

type I18nContextValue = {
  language: Language;
  dir: "ltr" | "rtl";
  t: (key: TranslationKey, vars?: TranslationVars) => string;
};

const I18nContext = createContext<I18nContextValue>({
  language: DEFAULT_LANGUAGE,
  dir: "ltr",
  t: (key) => key,
});

export function isLanguage(value: unknown): value is Language {
  return (
    typeof value === "string" &&
    (LANGUAGE_CODES as readonly string[]).includes(value)
  );
}

export function isRtlLanguage(language: Language): boolean {
  return language === "ar";
}

function getTranslationValue(
  language: Language,
  key: TranslationKey,
): string | undefined {
  const value = key.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, translations[language]);

  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (match, key) =>
    vars[key] === undefined ? match : String(vars[key]),
  );
}

export function translate(
  language: Language,
  key: TranslationKey,
  vars?: TranslationVars,
): string {
  return interpolate(
    getTranslationValue(language, key) ??
      getTranslationValue(DEFAULT_LANGUAGE, key) ??
      key,
    vars,
  );
}

export function I18nProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const dir: I18nContextValue["dir"] = isRtlLanguage(language) ? "rtl" : "ltr";
  const t = useCallback(
    (key: TranslationKey, vars?: TranslationVars) =>
      translate(language, key, vars),
    [language],
  );
  const value = useMemo(() => ({ language, dir, t }), [dir, language, t]);

  return createElement(I18nContext.Provider, { value }, children);
}

export function useTranslation() {
  return useContext(I18nContext);
}

const STATIC_STOP_REASON_KEYS: Record<string, TranslationKey> = {
  "Stopped from UI": "stopReason.stoppedFromUi",
  "Stopped from toggle": "stopReason.stoppedFromToggle",
  "Stopped from hotkey": "stopReason.stoppedFromHotkey",
  "Stopped from hold hotkey": "stopReason.stoppedFromHoldHotkey",
  Stopped: "stopReason.stopped",
  "Top-left corner failsafe": "stopReason.topLeftCornerFailsafe",
  "Top-right corner failsafe": "stopReason.topRightCornerFailsafe",
  "Bottom-left corner failsafe": "stopReason.bottomLeftCornerFailsafe",
  "Bottom-right corner failsafe": "stopReason.bottomRightCornerFailsafe",
  "Top edge failsafe": "stopReason.topEdgeFailsafe",
  "Right edge failsafe": "stopReason.rightEdgeFailsafe",
  "Bottom edge failsafe": "stopReason.bottomEdgeFailsafe",
  "Left edge failsafe": "stopReason.leftEdgeFailsafe",
};

export function translateStopReason(
  stopReason: string,
  t: I18nContextValue["t"],
): string {
  const staticKey = STATIC_STOP_REASON_KEYS[stopReason];
  if (staticKey) return t(staticKey);

  const clickLimit = stopReason.match(/^Click limit reached \((.+)\)$/);
  if (clickLimit) {
    return t("stopReason.clickLimitReached", { count: clickLimit[1] });
  }

  const timeLimit = stopReason.match(/^Time limit reached \((.+)\)$/);
  if (timeLimit) {
    return t("stopReason.timeLimitReached", { time: timeLimit[1] });
  }

  return stopReason;
}
