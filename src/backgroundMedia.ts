export const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "svg",
  "avif",
  "tiff",
  "tif",
  "ico",
  "heic",
  "heif",
  "apng",
  "jfif",
] as const;

export const VIDEO_EXTENSIONS = [
  "mp4",
  "webm",
  "ogg",
  "ogv",
  "mov",
  "m4v",
  "avi",
  "mkv",
] as const;

export const PLAYABLE_VIDEO_EXTENSIONS = ["mp4", "webm", "ogg", "ogv"] as const;

export const LEGACY_VIDEO_EXTENSIONS = ["mov", "m4v", "avi", "mkv"] as const;

const IMAGE_EXT_SET = new Set<string>(IMAGE_EXTENSIONS);
const VIDEO_EXT_SET = new Set<string>(VIDEO_EXTENSIONS);

const MAX_BACKGROUND_URL_LENGTH = 8192;
const MAX_DATA_URL_LENGTH = 1024 * 1024; // 1 MiB for base64 data:image (small wallpapers), http(s) stay 8 KiB

const ALLOWED_DATA_IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
  "image/avif",
  "image/tiff",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/apng",
  "image/heic",
  "image/heif",
]);

const DATA_IMAGE_RE =
  /^data:(image\/(?:png|jpeg|jpg|gif|webp|bmp|svg\+xml|avif|tiff|x-icon|vnd\.microsoft\.icon|apng|heic|heif));base64,[A-Za-z0-9+/=]+$/i;

export type MediaKind = "image" | "video";

export interface ResolvedBackground {
  kind: "image" | "video" | "none";
  src: string | null;
  cssUrl: string | null;
}

export function escapeCssUrl(url: string): string {
  return url
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\)/g, "\\)")
    .replace(/\n/g, "")
    .replace(/\r/g, "")
    .replace(/\0/g, "");
}

export function getExtension(raw: string): string | null {
  if (!raw) return null;
  // Strip query and fragment for URL-like strings, and also for paths
  const withoutQuery = raw.split("?")[0].split("#")[0];
  // For file paths, grab after last dot in last path segment
  const lastSlash = Math.max(
    withoutQuery.lastIndexOf("/"),
    withoutQuery.lastIndexOf("\\"),
  );
  const fileName =
    lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery;
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  // Extension must be alphanumeric only (prevent weird injection)
  if (!/^[a-z0-9]+$/.test(ext)) return null;
  return ext;
}

export function isImageExtension(ext: string | null): boolean {
  if (!ext) return false;
  return IMAGE_EXT_SET.has(ext);
}

export function isVideoExtension(ext: string | null): boolean {
  if (!ext) return false;
  return VIDEO_EXT_SET.has(ext);
}

export function isPlayableVideoExtension(ext: string | null): boolean {
  if (!ext) return false;
  return (PLAYABLE_VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

export function isLegacyVideoExtension(ext: string | null): boolean {
  if (!ext) return false;
  return (LEGACY_VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

export function getMediaKindFromExtension(ext: string | null): MediaKind {
  if (ext && isVideoExtension(ext)) return "video";
  return "image";
}

export function sanitizeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_BACKGROUND_URL_LENGTH) return null;
  if (
    trimmed.includes("\n") ||
    trimmed.includes("\r") ||
    trimmed.includes("\0")
  ) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  if (url.username || url.password) return null;
  if (url.href.length > MAX_BACKGROUND_URL_LENGTH) return null;
  return url.href;
}

export function sanitizeDataImageUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_DATA_URL_LENGTH) return null;
  if (
    trimmed.includes("\n") ||
    trimmed.includes("\r") ||
    trimmed.includes("\0")
  ) {
    return null;
  }
  const match = DATA_IMAGE_RE.exec(trimmed);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!ALLOWED_DATA_IMAGE_MIMES.has(mime)) return null;
  return trimmed;
}

export function sanitizeAssetUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_BACKGROUND_URL_LENGTH) return null;
  if (
    trimmed.includes("\n") ||
    trimmed.includes("\r") ||
    trimmed.includes("\0")
  ) {
    return null;
  }
  // asset://localhost/...
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "asset:") return null;
    if (!url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function isSafeConvertedAssetUrl(url: string): boolean {
  if (!url) return false;
  if (url.length > MAX_BACKGROUND_URL_LENGTH) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      if (parsed.hostname === "asset.localhost") {
        return true;
      }
      return false;
    }
    if (parsed.protocol === "asset:") return true;
    return false;
  } catch {
    return false;
  }
}

export function classifyRawInput(raw: string): {
  type: "http" | "data" | "asset" | "local" | "empty" | "blocked";
  kind: MediaKind | "none";
  sanitized: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { type: "empty", kind: "none", sanitized: null };
  if (
    trimmed.includes("\n") ||
    trimmed.includes("\r") ||
    trimmed.includes("\0")
  ) {
    return { type: "blocked", kind: "none", sanitized: null };
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("data:")) {
    if (trimmed.length > MAX_DATA_URL_LENGTH)
      return { type: "blocked", kind: "none", sanitized: null };
  } else if (trimmed.length > MAX_BACKGROUND_URL_LENGTH) {
    return { type: "blocked", kind: "none", sanitized: null };
  }
  if (lower.startsWith("data:")) {
    const sanitized = sanitizeDataImageUrl(trimmed);
    if (!sanitized) return { type: "blocked", kind: "none", sanitized: null };
    return { type: "data", kind: "image", sanitized };
  }
  if (lower.startsWith("asset://")) {
    const sanitized = sanitizeAssetUrl(trimmed);
    if (!sanitized) return { type: "blocked", kind: "none", sanitized: null };
    const ext = getExtension(trimmed);
    return { type: "asset", kind: getMediaKindFromExtension(ext), sanitized };
  }
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    const sanitized = sanitizeHttpUrl(trimmed);
    if (!sanitized) return { type: "blocked", kind: "none", sanitized: null };
    const ext = getExtension(sanitized);

    return { type: "http", kind: getMediaKindFromExtension(ext), sanitized };
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    if (!/^[a-zA-Z]:[\\/]/.test(trimmed)) {
      return { type: "blocked", kind: "none", sanitized: null };
    }
  }

  const ext = getExtension(trimmed);
  return {
    type: "local",
    kind: getMediaKindFromExtension(ext),
    sanitized: null,
  };
}

export function resolveBackgroundSource(
  raw: string,
  convertedUrl?: string | null,
): ResolvedBackground {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "none", src: null, cssUrl: null };

  const classification = classifyRawInput(trimmed);

  if (classification.type === "blocked" || classification.type === "empty") {
    return { kind: "none", src: null, cssUrl: null };
  }

  if (classification.type === "data") {
    const sanitized = classification.sanitized;
    if (!sanitized) return { kind: "none", src: null, cssUrl: null };
    return { kind: "image", src: sanitized, cssUrl: escapeCssUrl(sanitized) };
  }

  if (classification.type === "asset") {
    const sanitized = classification.sanitized;
    if (!sanitized) return { kind: "none", src: null, cssUrl: null };
    if (classification.kind === "video") {
      return { kind: "video", src: sanitized, cssUrl: null };
    }
    return { kind: "image", src: sanitized, cssUrl: escapeCssUrl(sanitized) };
  }

  if (classification.type === "http") {
    const sanitized = classification.sanitized;
    if (!sanitized) return { kind: "none", src: null, cssUrl: null };
    if (classification.kind === "video") {
      return { kind: "video", src: sanitized, cssUrl: null };
    }
    return { kind: "image", src: sanitized, cssUrl: escapeCssUrl(sanitized) };
  }

  // local
  if (classification.type === "local") {
    if (!convertedUrl) return { kind: "none", src: null, cssUrl: null };
    if (!isSafeConvertedAssetUrl(convertedUrl)) {
      return { kind: "none", src: null, cssUrl: null };
    }
    if (classification.kind === "video") {
      return { kind: "video", src: convertedUrl, cssUrl: null };
    }
    return {
      kind: "image",
      src: convertedUrl,
      cssUrl: escapeCssUrl(convertedUrl),
    };
  }

  return { kind: "none", src: null, cssUrl: null };
}
