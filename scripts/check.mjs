#!/usr/bin/env node
/*
 * Custom `npm run check` orchestrator.
 * Made by AI
 * Runs every quality gate in order with a compact per-step line, then prints a
 * short summary. On a clean run it says so in one line; on warning/failure it
 * lists exactly which command failed and shows the captured output tail.
 *
 * `check` is read-only and CI-safe. `check --fix` additionally auto-fixes the
 * formatting/lint checks (prettier, eslint, cargo fmt, npm audit) and
 * re-verifies them — it never auto-edits code that only fails type/test checks.
 */

import { spawnSync } from 'node:child_process';

const COLOR =
  (process.stdout.isTTY || process.env.FORCE_COLOR) &&
  !process.env.NO_COLOR &&
  process.env.TERM !== 'dumb';
const esc = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : `${s}`);
// NOTE: every color entry is a *function* — always call it: C.red('text').
const C = {
  bold: esc('1'),
  dim: esc('2'),
  red: esc('31'),
  green: esc('32'),
  yellow: esc('33'),
  cyan: esc('36'),
  grey: esc('90'),
  reset: COLOR ? '\x1b[0m' : '',
};
const TAG = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };

/** @typedef {{ name: string, cmd: string[], warn?: RegExp[], fix?: string[] }} Check */

/** @type {Check[]} */
const CHECKS = [
  {
    name: 'cargo test',
    cmd: ['cargo', 'test', '--manifest-path', 'src-tauri/Cargo.toml'],
    warn: [/^warning(\[\w+\])?:/m],
  },
  { name: 'npm test', cmd: ['npm', 'run', 'test'], warn: [/^warning:/m] },
  {
    name: 'eslint',
    cmd: ['npm', 'run', 'lint'],
    warn: [/\bwarning\b/i],
    fix: ['npm', 'run', 'lint', '--', '--fix'],
  },
  {
    name: 'prettier',
    cmd: ['npm', 'run', 'format:check'],
    fix: ['npm', 'run', 'format:write'],
  },
  {
    name: 'frontend:build',
    cmd: ['npm', 'run', 'frontend:build'],
    warn: [/warning/i],
  },
  {
    name: 'cargo check',
    cmd: ['cargo', 'check', '--manifest-path', 'src-tauri/Cargo.toml', '--locked'],
    warn: [/^warning(\[\w+\])?:/m],
  },
  {
    name: 'clippy',
    cmd: ['cargo', 'clippy', '--manifest-path', 'src-tauri/Cargo.toml'],
    warn: [/^warning(\[\w+\])?:/m],
  },
  {
    name: 'fmt',
    cmd: ['cargo', 'fmt', '--manifest-path', 'src-tauri/Cargo.toml', '--check'],
    fix: ['cargo', 'fmt', '--manifest-path', 'src-tauri/Cargo.toml'],
  },
  { name: 'npm audit', cmd: ['npm', 'audit'], fix: ['npm', 'audit', 'fix'] },
];

/**
 * @param {Check} c
 * @returns {{ name: string, cmd: string, status: 'pass'|'warn'|'fail', out: string, ms: number, code: number|null }}
 */
function run(c) {
  const t0 = Date.now();
  const r = spawnSync(c.cmd[0], c.cmd.slice(1), {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
  });
  const ms = Date.now() - t0;
  const out = r.error ? String(r.error) : (r.stdout || '') + (r.stderr || '');
  let status = 'pass';
  if (r.status !== 0) status = 'fail';
  else if (c.warn && c.warn.some((re) => re.test(out))) status = 'warn';
  return { name: c.name, cmd: c.cmd.join(' '), status, out, ms, code: r.status };
}

/**
 * @returns {boolean} true if a running instance was detected (and we aborted)
 */
async function guardRunningInstance() {
  if (process.platform !== 'win32') return false;

  const r = spawnSync('tasklist', ['/NH'], { encoding: 'utf8', shell: true });
  const out = r.stdout || '';
  let running = /BlurAutoClicker/i.test(out) || /crashpad_handler/i.test(out);

  if (!running) {
    try {
      const { openSync, closeSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const resource = resolve('src-tauri/resources/crashpad_handler.exe');
      const fd = openSync(resource, 'r+');
      closeSync(fd);
    } catch {
      running = true;
    }
  }

  if (!running) return false;

  process.stdout.write(
    `\n${C.red('CHECK ABORTED — BlurAutoClicker is currently running.')}\n` +
      `${C.bold('Close BlurAutoClicker')} (and any ${C.bold('crashpad_handler.exe')} it spawned), then re-run ${C.bold('npm run check')}.\n` +
      `${C.dim('A running instance locks src-tauri/resources/crashpad_handler.exe, so every cargo step fails with "os error 32: file in use by another process".')}\n`,
  );
  process.exit(1);
}

async function main() {
  const total = CHECKS.length;
  const doFix = process.argv.includes('--fix');
  const results = [];
  const t0 = Date.now();

  process.stdout.write(`Running ${total} quality checks…\n`);
  await guardRunningInstance();

  for (let i = 0; i < total; i++) {
    const c = CHECKS[i];
    const label = c.name.padEnd(16);
    process.stdout.write(`  [${i + 1}/${total}] ${C.cyan(label)} … `);
    const res = run(c);
    const tag =
      res.status === 'pass'
        ? C.green(TAG.pass)
        : res.status === 'warn'
          ? C.yellow(TAG.warn)
          : C.red(TAG.fail);
    process.stdout.write(`${tag} ${C.grey(`${res.ms}ms`)}\n`);
    results.push(res);
  }

  if (doFix) {
    for (let i = 0; i < total; i++) {
      const c = CHECKS[i];
      if (results[i].status !== 'fail' || !c.fix) continue;
      const label = c.name.padEnd(16);
      process.stdout.write(
        `  [${i + 1}/${total}] ${C.cyan(label)} ${C.dim('(auto-fix)')} … `,
      );
      const fr = spawnSync(c.fix[0], c.fix.slice(1), {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        shell: true,
      });
      if (fr.status !== 0)
        process.stdout.write(`${C.dim(`(fixer exited ${fr.status}) `)}`);
      const res = run(c);
      const tag =
        res.status === 'pass'
          ? C.green('fixed')
          : res.status === 'warn'
            ? C.yellow('still warnings')
            : C.red('still failing');
      process.stdout.write(`${tag} ${C.grey(`${res.ms}ms`)}\n`);
      results[i] = res;
    }
  }

  const fails = results.filter((r) => r.status === 'fail');
  const warns = results.filter((r) => r.status === 'warn');
  const totalMs = ((Date.now() - t0) / 1000).toFixed(1);

  if (fails.length === 0 && warns.length === 0) {
    process.stdout.write(
      `\n${C.green(`All ${total} quality checks passed`)} (${totalMs}s)\n`,
    );
    process.exit(0);
  }

  process.stdout.write(
    `\n${C.bold('Result')}: ${fails.length} failed, ${warns.length} with warnings\n`,
  );
  for (const r of [...fails, ...warns]) {
    const mark = r.status === 'fail' ? C.red(TAG.fail) : C.yellow(TAG.warn);
    process.stdout.write(`  ${mark} ${C.bold(r.name)}  ${C.dim(`[${r.cmd}]`)}\n`);
  }

  for (const r of fails) {
    process.stdout.write(`\n${C.bold(r.name)} output (last lines):\n`);
    const lines = r.out.replace(/\r\n/g, '\n').trim().split('\n');
    process.stdout.write(`${C.dim(lines.slice(-40).join('\n'))}\n`);
  }

  const verdict =
    fails.length > 0
      ? `${fails.length} check(s) failed`
      : `${warns.length} check(s) passed with warnings`;
  process.stdout.write(`\n${C.bold(verdict)} (${totalMs}s)\n`);
  process.exit(fails.length > 0 ? 1 : 0);
}

main();
