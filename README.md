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

**For you** opens with a creator strip: one avatar button per followed channel, each with a one-line tagline, labeled `Show videos from <name>`. Selecting a creator filters the feed and shows a profile card beneath the strip with the handle, subscriber and video counts, join year, a short bio and an Open on YouTube link. **Find more** opens the Channels tab.

Under the strip, home has a single **New from your channels** row of the newest public uploads from followed channels (`playlistItems.list`, 1 unit per channel). It becomes **New from <name>** when one creator is selected. Four topic rows follow, built in `src/homeRows.ts` from your selected interests:

| Row | What it shows | Quota per load |
| --- | --- | --- |
| Hot this week | Most-viewed embeddable videos from the last 7 days | 100 units (1 `search.list`) |
| Deep dives | Relevance-ranked tutorials and courses from the last year, 20 minutes or longer | 100 units (1 `search.list`) |
| Quick explainers | Most-viewed videos from the last 90 days, filtered to 4 to 20 minutes, then trimmed to 10 minutes using real durations | 100 units, plus 1 unit (`videos.list`) for durations |
| Rising creators | Videos from the last 30 days by channels with 1K to 250K subscribers, ranked by views per subscriber, one video per channel | 100 units, plus 2 units (`videos.list` and `channels.list`) |

With no interests selected, the four rows cover every topic. Each row loads only when it scrolls near the viewport. The For you hero features the top **Hot this week** video.

**Discover** keeps one **Trending in <topic>** row per topic (AI & Agents, Frontend, Backend, System Design and DevOps). Each is a `search.list` for embeddable videos from the last 30 days, ordered by view count, at 100 units per row. Edit the queries and subtitles in `src/topics.ts` to change what those rows find.

Rows load only when they scroll near the viewport (`IntersectionObserver` with a 150px margin), so offscreen rows spend no quota until approached. Results are cached for one hour and persisted for up to 24 hours. Without an API key, each row shows a rotated sample of the preview catalog, clearly labeled as preview.

**Cards** show the channel's subscriber count (for example "3.9M subs") and the video's views and age ("1.2M views · 2d ago"). When those stats are unavailable, the card reads "Free lesson". Stats come from `videos.list` (statistics) and `channels.list` (subscribers), fetched once per row, about 2 units per row.

**Player.** When a video has a channel, the modal shows an **About the creator** panel with the name, tagline, subscriber and video counts, year joined, bio and a link to the channel.

**Creator data.** Names, descriptions, subscriber and video counts, join dates and avatars come from YouTube's `channels.list`. Bios prefer Wikipedia. DevFlix finds the Wikidata item whose **YouTube channel ID** property (P2397) equals the channel's ID, then loads that item's English Wikipedia summary. The match is exact, so a creator never gets someone else's biography. Wikidata and Wikipedia are free and need no key. Many creators have no Wikipedia page, so the panel falls back to the channel's own description. The short tagline uses Wikidata's description when one exists, otherwise the first sentence of the channel description. In preview mode the creator strip uses the curated channels and their descriptions, and the stats and Wikipedia lookups are off.

## Cache and YouTube quota

- All API requests run through TanStack Query. `queryKeys.ts` separates trending, channel-upload, detail and normalized search caches. The For you hero and the Hot this week row share a query key, and onboarding reuses the same trending queries to suggest creators, so concurrent consumers deduplicate requests.
- **One-hour stale time** means revisiting a row, reopening a modal, or repeating a search normally reuses fresh data without another request. Window focus refetching is disabled.
- **24-hour garbage collection and persisted-cache maximum age** preserve useful data across reloads without retaining it indefinitely. `PersistQueryClientProvider` waits for hydration before queries fetch. A demo/live cache buster prevents preview records contaminating the live catalog. The sync-storage persister throttles writes to one second.
- Home rows, Discover trending rows and channel rows each have their own query, skeleton and retry UI. `IntersectionObserver` enables a row once it enters a 150px viewport margin; offscreen rows spend no quota until approached.
- Search-based rows (the four home rows and each Discover topic) use `search.list` at 100 units per call. New from your channels uses `playlistItems.list` (1 unit per channel, 20 uploads), and creator profiles use `channels.list` (1 unit per 50 channels). `videos.list` fetches full descriptions, durations and embeddability on card hover/focus, using the exact query later consumed by the modal. Fast clicks show the existing summary immediately while details load. Prefetching can consume quota for unwatched videos, but the fresh detail cache deduplicates repeat hovers.
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
2. The creator strip and, when one is selected, its profile card.
3. **New from your channels** (or **New from <name>**), one row of up to 30 uploads from followed channels.
4. The four topic rows: **Hot this week**, **Deep dives**, **Quick explainers** and **Rising creators**. See Catalog for what each one shows and what it costs.

Discover shows every topic, and explicit topic filters can explore outside selected interests. Discover keeps its per-topic **Trending in <topic>** rows. Preview mode fills the followed-channel row with the sample videos of the followed starter channels.

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

Production build and TypeScript checks pass. All 48 automated tests pass. The suite covers onboarding completion, skip/cancel, returning visits, edit/search selection preservation, personalized For you and Discover rows, the single New from your channels row and creator filtering, YouTube import classification, the upload-title pass, pre-selection, error retry and the hidden-when-unconfigured state, stored subscription IDs and the Subscribed badge, home row ranking and duration filtering, creator profiles, Wikipedia matching through Wikidata, formatting helpers, local video storage, query identities, channel follow/unfollow persistence, category filtering, feed merging and ordering, and the Channels-to-Following interaction. Live API and visual browser verification are not part of these automated tests. The local dev server could not be started in the execution environment because opening port 5173 was denied (EPERM).
