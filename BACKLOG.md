# Backlog

The single ledger of DevFlix work. The orchestrator plans from it; builders claim from it.

## How to use

1. **Capture.** New items get the next free `DF-` number and land on `main` in a PR with the `backlog` label (the orchestrator does this). Keep each item atomic: what's wrong or wanted, and what done looks like.
2. **Status** is one of `open` · `needs decision` · `done` · `wontfix`. `needs decision` items wait for Vika; agents do not pick them up.
3. **Claim in the PR, never edit this file.** A fix PR puts `Fixes: DF-007` (several IDs are fine) in its title or body. CI fails a PR that touches this file unless it carries the `backlog` label.
4. **Stamp after merge.** When a PR with `Fixes: DF-…` merges, `.github/workflows/stamp-backlog.yml` flips those rows to `done` on `main` and links the PR. Manual fallback: `node scripts/stamp-backlog.mjs --id DF-007 --pr-url <url>`.
5. **Wrong stamp?** Open a `backlog`-labelled PR that sets the row back to `open`.

Priority: **P0** broken or blocking · **P1** wrong behaviour or missing piece · **P2** polish · **P3** new feature.

## Items

| ID | Status | Priority | Item | Done when / notes |
| --- | --- | --- | --- | --- |
