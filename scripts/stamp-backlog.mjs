#!/usr/bin/env node
/**
 * Stamp BACKLOG.md rows to `done` after a fix PR merges.
 * Fix PRs claim work with `Fixes: DF-007` in the title or body and never edit
 * the ledger, so this script is its single writer for `done`.
 *
 * Usage:
 *   node scripts/stamp-backlog.mjs --id DF-007 [--id DF-011] [--claims-text "Fixes: DF-7"]
 *     [--pr-url URL] [--file PATH] [--dry-run]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ID_RE = /\bDF-\d+\b/g;
const FIXES_RE = /\b(?:Fix(?:es|ed)?|Closes|Resolves)\b\s*:?\s*([^\n\r]+)/gi;
const OPEN_STATUSES = ['open', 'needs decision'];

const byNumber = (a, b) => Number(a.slice(3)) - Number(b.slice(3));

/** IDs claimed with `Fixes: DF-…` (also Fix/Fixed/Closes/Resolves) in free text. */
export function parseClaims(text) {
  const ids = new Set();
  for (const match of text.matchAll(FIXES_RE)) {
    for (const id of (match[1] ?? '').matchAll(ID_RE)) ids.add(id[0]);
  }
  return [...ids].sort(byNumber);
}

export function parseArgs(argv) {
  const ids = [];
  let prUrl = '';
  let file = 'BACKLOG.md';
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--id') {
      const value = argv[++i];
      if (!value || !/^DF-\d+$/.test(value)) throw new Error(`Invalid --id ${value ?? ''}`);
      ids.push(value);
    } else if (arg === '--claims-text') {
      ids.push(...parseClaims(argv[++i] ?? ''));
    } else if (arg === '--pr-url') {
      prUrl = argv[++i] ?? '';
    } else if (arg === '--file') {
      file = argv[++i] ?? file;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { ids: [...new Set(ids)].sort(byNumber), prUrl, file, dryRun };
}

/**
 * Flip each ID's row from an open status to `done`, appending the PR link to
 * the last cell. Rows already `done`/`wontfix` or missing are reported in `skipped`.
 */
export function stampBacklog(markdown, ids, { prUrl = '' } = {}) {
  const lines = markdown.split('\n');
  const changed = [];
  const skipped = [];
  for (const id of ids) {
    const index = lines.findIndex(line => line.startsWith(`| ${id} |`));
    if (index === -1) {
      skipped.push(`${id} (row missing)`);
      continue;
    }
    const cells = lines[index].split('|');
    // ['', ' DF-1 ', ' `open` ', ' P1 ', ' item ', ' notes ', '']
    const status = cells[2]?.trim().replace(/`/g, '');
    if (!OPEN_STATUSES.includes(status)) {
      skipped.push(`${id} (already ${status || 'unknown'})`);
      continue;
    }
    cells[2] = ' `done` ';
    if (prUrl) {
      const last = cells.length - 2;
      const notes = cells[last].trim();
      cells[last] = ` ${notes ? `${notes} · ` : ''}Shipped: ${prUrl} `;
    }
    lines[index] = cells.join('|');
    changed.push(id);
  }
  return { markdown: lines.join('\n'), changed, skipped };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.ids.length === 0) {
    console.error('No DF-IDs to stamp. Pass --id DF-007 and/or --claims-text "Fixes: DF-007".');
    process.exit(2);
  }
  const before = readFileSync(opts.file, 'utf8');
  const { markdown, changed, skipped } = stampBacklog(before, opts.ids, { prUrl: opts.prUrl });
  const wrote = changed.length > 0 && !opts.dryRun;
  if (wrote) writeFileSync(opts.file, markdown);
  console.log(JSON.stringify({ changed, skipped, wrote, file: opts.file }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
