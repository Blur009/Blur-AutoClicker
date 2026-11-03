#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { buildIndex, renderIndex } from "./settings-index.mjs";

const OUT = "src/settingsSearchIndex.ts";

const entries = buildIndex();
writeFileSync(OUT, renderIndex(entries));
console.log(
  `${OUT}: ${entries.length} settings across ${new Set(entries.map((e) => e.tab)).size} tabs`,
);
