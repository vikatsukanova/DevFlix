# DevFlix

A responsive, Netflix-inspired home for free tech learning. Built with Vite, React, TypeScript, Tailwind CSS v4, Lucide icons and TanStack Query v5.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
cp .env.example .env.local
# Set VITE_YT_API_KEY in .env.local
# Optional: set VITE_GOOGLE_CLIENT_ID to enable Import from YouTube
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

Home and Discover rows are live topic feeds, one per topic: AI & Agents, Frontend, Backend, System Design and DevOps. Each row is a YouTube search for embeddable videos published in the last 30 days, ordered by view count. Edit the queries and subtitles in `src/topics.ts` to change what a row finds. Every topic row is a `search.list` call, which costs 100 quota units, so the number of topics drives the cost of a fresh home page.

Rows load only when they scroll near the viewport (`IntersectionObserver` with a 150px margin), so offscreen topics spend no quota until approached. Results are cached for one hour and persisted for up to 24 hours. Without an API key, each row shows a rotated sample of the preview catalog, clearly labeled as preview.

## Cache and YouTube quota

- All API requests run through TanStack Query. `queryKeys.ts` separates trending, channel-upload, detail and normalized search caches. The hero and the first trending row share a query key, and onboarding reuses the same trending queries to suggest creators, so concurrent consumers deduplicate requests.
- **One-hour stale time** means revisiting a row, reopening a modal, or repeating a search normally reuses fresh data without another request. Window focus refetching is disabled.
- **24-hour garbage collection and persisted-cache maximum age** preserve useful data across reloads without retaining it indefinitely. `PersistQueryClientProvider` waits for hydration before queries fetch. A demo/live cache buster prevents preview records contaminating the live catalog. The sync-storage persister throttles writes to one second.
- Trending and channel rows each have their own query, skeleton and retry UI. `IntersectionObserver` enables a row once it enters a 150px viewport margin; offscreen rows spend no quota until approached.
- Trending rows use `search.list` (100 units each); followed-channel rows use `playlistItems.list` (1 unit per channel, 20 uploads). `videos.list` fetches full descriptions, durations and embeddability on card hover/focus, using the exact query later consumed by the modal. Fast clicks show the existing summary immediately while details load. Prefetching can consume quota for unwatched videos, but the fresh detail cache deduplicates repeat hovers.
- Search is **submit-only**, not per keystroke. `useInfiniteQuery` follows `nextPageToken`, requests 20 results at a time, and retains up to 10 pages. The sentinel loads more at the bottom; failed pages require explicit retry. Search requests have historically been considerably more expensive than playlist/detail requests; check current Google quota rules for your project.
- Client errors (including invalid keys and exhausted quota) do not retry automatically. Transient server/network failures retry once. Abort signals cancel obsolete requests.
- Cache persistence is best effort if browser storage is unavailable/full. My List and Continue Watching use separate, validated localStorage records, with a session-only fallback and cross-tab synchronization. They are not accounts or cloud sync.

Official references: [TanStack persistence](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient), [YouTube quota](https://developers.google.com/youtube/v3/determine_quota_cost), [search API](https://developers.google.com/youtube/v3/docs/search/list).

## Playback and accessibility

The privacy-enhanced YouTube iframe resumes at the last recorded second. Progress messages are checked against the iframe window and exact YouTube origin, saved every five seconds and on close/page exit. Merely opening a video does not add it to Continue Watching. Videos reaching 95% are removed from that row. Browser restrictions or blocked YouTube scripts can prevent progress reporting; the YouTube link remains available.

Cards support Left/Right, Home and End navigation, touch scrolling, and visible keyboard focus. The native dialog traps focus, supports Escape, and restores focus to the opener. Reduced motion is respected. React Query Devtools are included for development.

## Channels and Following

The Channels tab opens with trending creators: the channels behind the most-viewed recent videos in each topic, most frequent first. The AI & Agents, Frontend, Backend, System Design and DevOps filters narrow the list to one topic. These suggestions come from the same cached topic searches as the home rows, so browsing them adds no extra search cost. In preview mode, the tab shows the curated starter channels that match the topic.

Channel search runs on submission and searches YouTube beyond the suggestions. Results arrive 12 at a time with infinite scroll: a sentinel near the bottom requests the next page, and a failed page shows a retry button. Search results are not automatically classified into topics. Any channel whose ID appears in your last YouTube import shows a **Subscribed on YouTube** badge.

Follow/Unfollow stores channels separately in `devflix-following-v1`, persists across reloads, and synchronizes across tabs. These are local DevFlix follows, not YouTube account subscriptions. Channel cards link to the original YouTube channel.

Live avatars and uploads playlist IDs come from a batched `channels.list` request. Each followed channel has its own query, so one failing channel does not block the feed. Following merges the first 20 public uploads per channel, deduplicates videos, and sorts by video publication date (not the date it was added to a playlist). These queries inherit the existing one-hour freshness and 24-hour persistence settings. Unfollowing immediately removes that channel from the feed without deleting saved videos.

Preview mode supports following the starter directory and shows only matching sample videos, with clear labels. Live channel search and recent uploads require the API key.

## First-visit personalization

On first visit, a skippable two-step setup lets learners choose topics and creators. Topic tiles are multi-select with no minimum. The creator step suggests trending creators for the chosen topics, or for all topics when none are chosen, so each suggestion is a channel behind recent popular videos in that topic. Search runs on submission and uses infinite scroll, as on the Channels tab. Creators you already subscribe to on YouTube carry the same **Subscribed on YouTube** badge. Selection is a draft until completion. Back/search preserve selections, Skip discards the draft while retaining existing follows, and Cancel during editing leaves saved preferences untouched.

Completing setup saves topics in `devflix-preferences-v1` and selected creators in the existing following store. The For you page is ordered as follows:

1. **Continue Watching** and **My List**, when they have items.
2. **`<Topic>` from your channels** rows. Uploads from followed channels are grouped by the topic found in each video's title and description. When a video matches no topic, its channel's topics are used. Uploads that match neither go to **More from your channels**. Each row shows up to 20 videos.
3. **Trending in your interests**, with one trending row per selected topic. With no topics selected, the heading reads **Trending this month** and rows cover every topic.

Discover shows every topic, and explicit topic filters can explore outside selected interests. The For you hero features the first shown topic. Preview mode fills the followed-channel rows with the sample videos of the followed starter channels.

Edit interests on the For you page reopens setup with existing topics and follows selected, including creators outside the suggestions. Returning visits skip setup. Preferences are local to this browser and synchronize between tabs; unavailable storage falls back to the current session. Personalization is explicit topic matching and channel follows, not inferred watch-history recommendations.

## Import from YouTube

Importing your YouTube subscriptions is optional. It needs `VITE_GOOGLE_CLIENT_ID` in `.env.local` in addition to the existing `VITE_YT_API_KEY`. Without the client ID, or in preview mode, the import panel is hidden and creators can still be chosen manually.

Google Cloud setup:

1. Configure the **OAuth consent screen**. While the app is in *Testing*, add your own Google account as a test user.
2. Create an OAuth client ID of type **Web application**. Add `http://localhost:5173` and your production origin to **Authorized JavaScript origins**.
3. Enable **YouTube Data API v3** in the same project.

The only scope requested is `youtube.readonly`. The access token is held in memory for a single import and is revoked as soon as the subscriptions have been read. Nothing is written to YouTube. DevFlix does not store the token. It saves the channel IDs of your subscriptions in `devflix-youtube-subscriptions-v1` so that search and suggestion results can show the **Subscribed on YouTube** badge. Each import replaces that list, and it holds IDs only, not titles or other subscription details. Only the channels you keep selected are followed.

Each import reads up to 1000 subscriptions. Quota cost is about 1 unit per 50 subscriptions for each of `subscriptions.list` and `channels.list`.

A second pass covers subscriptions the keyword check did not match. For up to 500 of them, DevFlix reads the titles of the 10 most recent uploads with `playlistItems.list`, at 1 unit per channel, and runs the same topic checks on those titles. A channel is matched when at least two of its titles, and at least 30% of them, look like AI or dev content. Its topics come from titles that share a topic. Channels with no uploads, or with a failed title lookup, stay in the unmatched group.

Classification is keyword-based first. It checks each channel's title, description and channel keywords for AI and dev terms, and the upload-title pass above covers channels the keywords miss. Curated channels always match. Keyword matching can miss relevant channels or include unrelated ones, so matches arrive pre-selected for review and deselecting any of them is expected. The remaining subscriptions stay unselected behind **Show N other subscriptions** and can be picked individually.

## Validation status

Production build and TypeScript checks pass. All 31 automated tests pass, covering onboarding completion, skip/cancel, returning visits, edit/search selection preservation, personalized For you and Discover rows, YouTube import classification, the upload-title pass, pre-selection, error retry and the hidden-when-unconfigured state, stored subscription IDs and the Subscribed badge, topic-split rows for followed channels, local video storage, query identities, channel follow/unfollow persistence, category filtering, feed merging and ordering, and the Channels-to-Following interaction. Live API and visual browser verification are not part of these automated tests. The local dev server could not be started in the execution environment because opening port 5173 was denied (EPERM).
