# DevFlix

A responsive, Netflix-inspired home for free tech learning. Built with Vite, React, TypeScript, Tailwind CSS v4, Lucide icons and TanStack Query v5.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
cp .env.example .env.local
# Set VITE_YT_API_KEY in .env.local
npm run dev
```

Enable **YouTube Data API v3** in your Google Cloud project. Vite environment variables are public client-side values: restrict this key to the YouTube API and your production/localhost HTTP referrers. Never put a privileged server credential here. Restart Vite after changing the environment.

Without a key, DevFlix shows an explicitly labeled preview catalog. Search filters that sample catalog; playback and local saved items work. Live mode never silently replaces API failures with preview data.

```sh
npm run build
npm run preview
npm test
```

## Catalog

Edit `src/rows.ts` to change rows. It includes ByteByteGo’s System Design Fundamentals, Microsoft’s AI Agents for Beginners, Fireship’s 100 Seconds of Code, Hussein Nasser’s beginner backend playlist, and Theo’s public uploads playlist. The Theo feed includes his broader developer commentary, not exclusively React. Each row loads the first 20 public playlist entries. This intentionally limits browsing requests; search supports further pages.

## Cache and YouTube quota

- All API requests run through TanStack Query. `queryKeys.ts` separates playlist, detail and normalized search caches. Hero and first row share a playlist key, so concurrent consumers deduplicate requests.
- **One-hour stale time** means revisiting a row, reopening a modal, or repeating a search normally reuses fresh data without another request. Window focus refetching is disabled.
- **24-hour garbage collection and persisted-cache maximum age** preserve useful data across reloads without retaining it indefinitely. `PersistQueryClientProvider` waits for hydration before queries fetch. A demo/live cache buster prevents preview records contaminating the live catalog. The sync-storage persister throttles writes to one second.
- Playlist rows each have their own query, skeleton and retry UI. `IntersectionObserver` enables a row once it enters a 150px viewport margin; offscreen rows spend no quota until approached.
- `playlistItems.list` fetches 20 summaries per row. `videos.list` fetches full descriptions, durations and embeddability on card hover/focus, using the exact query later consumed by the modal. Fast clicks show the existing summary immediately while details load. Prefetching can consume quota for unwatched videos, but the fresh detail cache deduplicates repeat hovers.
- Search is **submit-only**, not per keystroke. `useInfiniteQuery` follows `nextPageToken`, requests 20 results at a time, and retains up to 10 pages. The sentinel loads more at the bottom; failed pages require explicit retry. Search requests have historically been considerably more expensive than playlist/detail requests; check current Google quota rules for your project.
- Client errors (including invalid keys and exhausted quota) do not retry automatically. Transient server/network failures retry once. Abort signals cancel obsolete requests.
- Cache persistence is best effort if browser storage is unavailable/full. My List and Continue Watching use separate, validated localStorage records, with a session-only fallback and cross-tab synchronization. They are not accounts or cloud sync.

Official references: [TanStack persistence](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient), [YouTube quota](https://developers.google.com/youtube/v3/determine_quota_cost), [search API](https://developers.google.com/youtube/v3/docs/search/list).

## Playback and accessibility

The privacy-enhanced YouTube iframe resumes at the last recorded second. Progress messages are checked against the iframe window and exact YouTube origin, saved every five seconds and on close/page exit. Merely opening a video does not add it to Continue Watching. Videos reaching 95% are removed from that row. Browser restrictions or blocked YouTube scripts can prevent progress reporting; the YouTube link remains available.

Cards support Left/Right, Home and End navigation, touch scrolling, and visible keyboard focus. The native dialog traps focus, supports Escape, and restores focus to the opener. Reduced motion is respected. React Query Devtools are included for development.

## Channels and Following

The Channels tab provides a curated starter directory with AI & Agents, Frontend, Backend, System Design and DevOps filters. Channel search runs on submission, searches YouTube beyond the directory, and has a More channels button. Search results are not automatically classified into our curated topics.

Follow/Unfollow stores channels separately in `devflix-following-v1`, persists across reloads, and synchronizes across tabs. These are local DevFlix follows, not YouTube account subscriptions. Channel cards link to the original YouTube channel.

Live avatars and uploads playlist IDs come from a batched `channels.list` request. Each followed channel has its own query, so one failing channel does not block the feed. Following merges the first 20 public uploads per channel, deduplicates videos, and sorts by video publication date (not the date it was added to a playlist). These queries inherit the existing one-hour freshness and 24-hour persistence settings. Unfollowing immediately removes that channel from the feed without deleting saved videos.

Preview mode supports following the starter directory and shows only matching sample videos, with clear labels. Live channel search and recent uploads require the API key.

## First-visit personalization

On first visit, a skippable two-step setup lets learners choose topics and creators. Topic tiles are multi-select with no minimum; the creator grid prioritizes matching topics and supports YouTube search. Selection is a draft until completion. Back/search preserve selections, Skip discards the draft while retaining existing follows, and Cancel during editing leaves saved preferences untouched.

Completing setup saves topics in `devflix-preferences-v1` and selected creators in the existing following store. The For you homepage shows matching topic collections, a featured video from the first matching collection, and a lazy-loaded New from your channels row. Continue Watching and My List remain available. DevOps has its own uploads collection. Discover keeps the full catalog, and explicit topic filters can explore outside selected interests.

Edit interests on the For you page reopens setup with existing topics and follows selected, including creators outside the starter directory. Returning visits skip setup. Preferences are local to this browser and synchronize between tabs; unavailable storage falls back to the current session. Personalization is explicit topic matching and channel follows, not inferred watch-history recommendations.

## Validation status

Production build and TypeScript checks pass. All 13 automated tests pass, covering onboarding completion, skip/cancel, returning visits, edit/search selection preservation, personalized homepage content, local video storage, query identities, channel follow/unfollow persistence, category filtering, feed merging and ordering, and the Channels-to-Following interaction. Live API and visual browser verification are not part of these automated tests. The local dev server could not be started in the execution environment because opening port 5173 was denied (EPERM).
