# DevFlix: agent guide

Read by every agent on this repo (Claude, Codex, Gemini, Grok). React 19 + Vite SPA served by a Cloudflare Worker (`proxy/worker.ts`) that also proxies and caches `/api/youtube`. Optional Supabase sign-in syncs lists and settings.

## Roles

Work moves through three roles, each on a different model family so the reviewer doesn't share the builder's blind spots.

| Role | Model | Does | Never does |
| --- | --- | --- | --- |
| **Orchestrator** | Claude Opus 5.5 (the T3 thread Vika talks to) | Turns requests into `BACKLOG.md` items, asks Vika about `needs decision` items, writes builder briefs, dispatches builders and reviewers, reports back | Write feature code itself, beyond small review fixes |
| **Builder** | Codex GPT-6.2 Sol, in its own worktree | Implements one brief on its own branch, tests, opens a PR claiming `Fixes: DF-…` | Edit `BACKLOG.md`, touch other items, merge |
| **Reviewer** | Gemini 4 Neon | Reviews one PR against its brief and the rules below, posts findings on the PR | Push code, approve its own fixes, merge |

**Vika merges.** No agent merges a PR or pushes to `main` (the backlog stamp workflow is the only exception).

Role briefs: [`docs/agents/builder.md`](docs/agents/builder.md) · [`docs/agents/reviewer.md`](docs/agents/reviewer.md). The orchestrator passes the relevant one, plus the item, to each child.

## Flow

1. **Capture.** The orchestrator adds items to `BACKLOG.md` in a `backlog`-labelled PR. Unclear product calls become `needs decision` and go to Vika, not to a builder.
2. **Brief.** For each `open` item to work on: goal, done-when, files likely involved, out of scope. Items that touch the same files go to one builder, or run one after another.
3. **Build.** One builder per brief, each in its own worktree and branch (`df-<id>-<slug>`). Builders run in parallel when their files don't overlap.
4. **Review.** One reviewer per PR. Real findings go back to the builder (or the orchestrator fixes small ones); then the reviewer re-checks.
5. **Hand off.** The orchestrator tells Vika which PRs are green and reviewed, with anything to look at personally.
6. **Stamp.** After merge, `.github/workflows/stamp-backlog.yml` marks the claimed items `done`.

## Commands

```bash
npm ci                 # install (Node 22, see .nvmrc)
npm run dev            # Vite dev server
npm test               # Vitest: unit + component tests, and scripts/*.test.mjs
npm run build          # tsc -b && vite build
npm run build:cf       # the build Cloudflare runs (same-origin /api/youtube proxy)
npx wrangler@4 deploy --dry-run   # check the Worker bundles without deploying
```

Run `npm test` and `npm run build` before calling anything done. CI (`Test & build`) runs both; `Backlog guard` fails PRs that edit `BACKLOG.md`.

## Rules

- **Branches and PRs.** Every change goes through a PR into `main`. Never force-push, hard-reset or delete `main`.
- **Backlog.** Claim with `Fixes: DF-…` in the PR title or body. Don't edit `BACKLOG.md` in a fix PR. Don't pick up `needs decision` items.
- **Secrets.** `VITE_*` values are compiled into the public bundle; never put a secret there. The YouTube key lives only in the Worker (`YT_API_KEY`). Don't commit `.env*`.
- **Dependencies.** Ask before adding a runtime dependency. Dependabot groups updates; major bumps get their own PR and a changelog check (lucide-react 1.0 dropped brand icons, for example).
- **Scope.** One item per PR. Note unrelated problems you spot in the PR description for the orchestrator to capture; don't fix them on the side.
- **Tests.** Behaviour changes come with a test next to the code (`src/*.test.ts(x)`, `proxy/worker.test.ts`). Use Testing Library queries by role and label, as the existing tests do.
- **Cloudflare.** `wrangler.toml` drives both production and PR preview builds; the `[previews]` block must stay.
