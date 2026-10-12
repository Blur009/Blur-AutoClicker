export function normalizeIntegerRaw(raw: string) {
  if (raw === "-" || raw === "") {
    return raw;
  }

  const negative = raw.startsWith("-");
  const digits = (negative ? raw.slice(1) : raw)
    .replace(/\D.*$/s, "")
    .replace(/^0+(?=\d)/, "");
  return `${negative ? "-" : ""}${digits}`;
}

export function normalizeDecimalRaw(raw: string) {
  if (raw === "-" || raw === "" || raw === "." || raw === "-.") {
    return raw;
  }

  const negative = raw.startsWith("-");
  const body = (negative ? raw.slice(1) : raw).replace(/[^\d.]/g, "");
  const dotIndex = body.indexOf(".");
  const digits =
    dotIndex === -1
      ? body
      : `${body.slice(0, dotIndex)}.${body.slice(dotIndex + 1).replace(/\./g, "")}`;
  const value = digits.replace(/^0+(?=\d)/, "");
  if (value === "" || value === ".") {
    return negative ? "-" : value;
  }
  return `${negative ? "-" : ""}${value}`;
}

export function normalizeDecimalLocale(raw: string) {
  if (
    raw === "-" ||
    raw === "" ||
    raw === "." ||
    raw === "," ||
    raw === "-." ||
    raw === "-,"
  ) {
    return raw;
  }

  const negative = raw.startsWith("-");
  let body = (negative ? raw.slice(1) : raw).replace(/[^\d.,]/g, "");
  const sepMatch = body.match(/[.,]/);
  if (sepMatch) {
    const sepIndex = sepMatch.index!;
    const intPart = body.slice(0, sepIndex);
    const rest = body.slice(sepIndex + 1).replace(/[.,]/g, "");
    const sep = body[sepIndex];
    body = `${intPart}${sep}${rest}`;
  }
  const value = body.replace(/^0+(?=\d)/, "");
  if (value === "" || value === "." || value === ",") {
    return negative ? "-" : value;
  }
  return `${negative ? "-" : ""}${value}`;
}

export function parseNormalizedDecimalLocale(normalized: string) {
  if (
    normalized === "" ||
    normalized === "-" ||
    normalized === "." ||
    normalized === ","
  ) {
    return 0;
  }
  const value = Number(normalized.replace(",", "."));
  return Number.isNaN(value) ? 0 : value;
}

export function parseDecimalLocale(raw: string) {
  return parseNormalizedDecimalLocale(normalizeDecimalLocale(raw));
}

export function formatDecimalLocale(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, { useGrouping: false });
}
