#!/usr/bin/env node
//─────────────────────────────────────────────
// node scripts/bump-version.mjs 0.0.0
//─────────────────────────────────────────────
import { readFileSync, writeFileSync } from "fs";

const newVersion = process.argv[2];

if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error("Usage: node scripts/bump-version.mjs <semver>");
  console.error("  e.g.  node scripts/bump-version.mjs 3.10.0");
  process.exit(1);
}

let count = 0;

// ── 1. package.json ─────────────────────────────────────────────────────────
{
  const path = "package.json";
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  const old = pkg.version;
  pkg.version = newVersion;
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`\u2713 ${path}: ${old} \u2192 ${newVersion}`);
  count++;
}

// ── 2. src-tauri/Cargo.toml ─────────────────────────────────────────────────
{
  const path = "src-tauri/Cargo.toml";
  const text = readFileSync(path, "utf8");
  const updated = text.replace(
    /^version = "[\d.]+"$/m,
    `version = "${newVersion}"`,
  );
  writeFileSync(path, updated);
  console.log(`\u2713 ${path}: updated`);
  count++;
}

// ── 3. src-tauri/tauri.conf.json ────────────────────────────────────────────
{
  const path = "src-tauri/tauri.conf.json";
  const conf = JSON.parse(readFileSync(path, "utf8"));
  conf.version = newVersion;
  writeFileSync(path, JSON.stringify(conf, null, 2) + "\n");
  console.log(`\u2713 ${path}: updated`);
  count++;
}

// ── 4. package-lock.json (root version + package entry) ────────────────────
{
  const path = "package-lock.json";
  const lock = JSON.parse(readFileSync(path, "utf8"));
  lock.version = newVersion;
  if (lock.packages?.[""]?.version) {
    lock.packages[""].version = newVersion;
  }
  writeFileSync(path, JSON.stringify(lock, null, 2) + "\n");
  console.log(`\u2713 ${path}: updated`);
  count++;
}

// ── 5. src-tauri/Cargo.lock (root package version) ─────────────────────────
{
  const path = "src-tauri/Cargo.lock";
  const text = readFileSync(path, "utf8");
  const updated = text.replace(
    /^version = "[\d.]+"$/m,
    `version = "${newVersion}"`,
  );
  writeFileSync(path, updated);
  console.log(`\u2713 ${path}: updated`);
  count++;
}

console.log(`\nDone! ${count} files updated to ${newVersion}.`);
