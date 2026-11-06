import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const defaultPath = join(
  process.env.LOCALAPPDATA ?? ".",
  "BlurAutoClicker",
  "Diagnostics",
  "Logs",
  "session.log",
);
const path = flag("--path", defaultPath);
const tail = Number(flag("--lines", "40"));
const follow = !args.includes("--once");

const read = (from, to) => {
  const size = to - from;
  if (size <= 0) return "";
  const buffer = Buffer.alloc(size);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buffer, 0, size, from);
  } finally {
    closeSync(fd);
  }
  return buffer.toString("utf8");
};

if (!existsSync(path)) {
  console.error(`no log file at ${path}`);
  process.exit(1);
}

const initialSize = statSync(path).size;
const initial = read(0, initialSize);
const lines = initial.split(/\r?\n/);
const shown = lines.slice(Math.max(0, lines.length - 1 - tail), -1);
if (shown.length > 0) console.log(shown.join("\n"));
let offset = initialSize;

if (!follow) process.exit(0);

console.log(`\n--- watching ${path} (Ctrl+C to stop) ---`);
setInterval(() => {
  try {
    if (!existsSync(path)) return;
    const size = statSync(path).size;
    if (size < offset) {
      offset = 0;
      console.log("--- log rotated ---");
    }
    if (size === offset) return;
    const chunk = read(offset, size);
    offset = size;
    process.stdout.write(chunk);
  } catch (error) {
    console.error(`log read failed: ${error.message}`);
  }
}, 400);
