# Reviewer brief

You are the **reviewer** for one DevFlix PR. Read `AGENTS.md` first. You review; you don't push code or merge.

## You get

The PR number and the backlog item(s) it claims, with their done-when.

## Check, in this order

1. **Does it do the item?** Compare the diff (`gh pr diff <n>`) with done-when. Missing pieces are findings.
2. **Is it correct?** Read the changed code in context, not just the diff. Look for broken edge cases (empty lists, signed-out users, API errors, quota limits on `/api/youtube`), stale React state, race conditions in queries, and regressions in nearby behaviour.
3. **Is it safe?** Secrets in `VITE_*` or committed files, unvalidated input reaching the Worker, cache keys that could leak one user's data to another.
4. **Is it tested?** The changed behaviour should have a test that would fail without the change.
5. **Does it follow `AGENTS.md`?** One item per PR, `Fixes: DF-…` claim present, `BACKLOG.md` untouched, no surprise dependencies.
6. **Do checks pass?** `gh pr checks <n>`. If something fails, read the log and say why.

Check out the branch and run `npm test` and `npm run build` yourself if the diff touches logic, not just copy or styles.

## Report

- Post findings on the PR with `gh pr review <n> --comment --body …`, one bullet per finding: file:line, what's wrong, the concrete case that breaks it, and a suggested fix. Use inline comments (`gh api …/pulls/<n>/comments`) when a finding is about one line.
- Only report what you can point to. Style preferences and "consider…" ideas go under a separate **Nits** heading, or nowhere.
- Never use `--approve` or `--request-changes`; Vika decides.

Last line back to the orchestrator, exactly: `PR <full URL>: <n> findings (<m> blocking), checks <state>`.
