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
| Hot this week | One search per selected topic for this week's most-viewed videos in your language and region (see Language and region settings). Keeps videos with at least 10K views that aren't Shorts (under 3 minutes), ranks each topic by views per day since upload, then alternates topics so AI doesn't fill the row. A single combined "A \| B \| C" search was tried and returned almost nothing popular, which is why each topic is searched on its own. If nothing qualifies, the row is empty rather than padded with small videos | 100 units per topic (shared with Rising creators for 6 hours), plus 1 to 2 units for stats and the language check |
| Deep dives | Relevance-ranked tutorials and courses in your language, 20 minutes or longer, within each topic's freshness window (see Freshness). Only videos with at least 5K views | 100 units (1 `search.list`), or 200 when AI and non-AI topics are both selected, plus 1 unit for the language check |
| Quick explainers | Relevance-ranked videos in your language within each topic's freshness window, filtered to 4 to 20 minutes, then trimmed to 10 minutes using real durations. Only videos with at least 5K views | Up to 200 units, plus 1 to 2 units for durations, views and the language check |
| Rising creators | This week's videos from the same per-topic searches as Hot this week, by channels with 1K to 250K subscribers. A video needs 10K+ views, at least 5 minutes of runtime and a title without hype patterns (money promises, "is dead", shouting or emoji walls). Ranked by views per subscriber, one video per channel | No extra searches; 2 to 3 units for stats, subscriber counts and the language check |

With no interests selected, the four rows cover every topic. Each row loads only when it scrolls near the viewport and is refreshed at most every 6 hours. The For you hero features the top **Hot this week** video.

**Freshness.** Each topic has a maximum video age in `src/topics.ts`: AI & Agents 45 days, Frontend 540, Backend 1095, System Design 1825 and DevOps 730. The cutoffs follow how quickly each topic goes stale. AI tooling changes monthly, so an old AI tutorial misleads, while backend and system design fundamentals stay true for years. `FAST_MOVING_DAYS` (90) marks the topics that get the short window. Deep dives and Quick explainers use `freshSearch`, which runs one search for the fast-moving topics with a 45-day window and one for the rest, using the longest window among them. Each video is then checked against its own cutoff. A video detected as AI is held to the 45-day cutoff even inside a backend search. A video matching several topics gets the most lenient cutoff, unless one of them is AI. The two result lists are interleaved and de-duplicated. The two searches cost 200 units when both AI and non-AI topics are selected, which includes the default with no interests. Otherwise the row runs one search. Edit the cutoffs in `src/topics.ts`.

**On-topic only.** Every feed drops videos in YouTube categories unrelated to learning: Film & Animation, Autos, Music, Pets, Sports, Travel, Gaming, Comedy, News & Politics, Shows and Trailers (`BLOCKED_CATEGORIES` in `src/api.ts`). The category comes from the same `videos.list` call as the language check, so it costs nothing extra. When your language is English, discovery rows and creator suggestions also require a dev or AI topic in the title or description, and skip titles about politics, news, games or AI doom and geopolitics (`isOffTopic` in `src/classify.ts`; "news feed" system design videos are allowed). For other languages these keyword checks are skipped and those rows rely on the YouTube categories and the language check, so they can include off-topic videos. A video whose only dev signal is "AI" also needs a sign it's about building (tutorial, code, API, framework, agents SDK and similar), so AI commentary doesn't count as a lesson. Followed channels only get the category filter.

Rows load only when they scroll near the viewport (`IntersectionObserver` with a 150px margin), so offscreen rows spend no quota until approached. Results are cached for one hour and persisted for up to 24 hours. Without an API key, each row shows a rotated sample of the preview catalog, clearly labeled as preview.

**Cards** show the channel's subscriber count (for example "3.9M subs") and the video's views and age ("1.2M views · 2d ago"). When those stats are unavailable, the card reads "Free lesson". Stats come from `videos.list` (statistics) and `channels.list` (subscribers), fetched once per row, about 2 units per row.

**Player.** When a video has a channel, the modal shows an **About the creator** panel with the name, tagline, subscriber and video counts, year joined, bio and a link to the channel.

**Creator data.** Names, descriptions, subscriber and video counts, join dates and avatars come from YouTube's `channels.list`. Bios prefer Wikipedia. DevFlix finds the Wikidata item whose **YouTube channel ID** property (P2397) equals the channel's ID, then loads that item's English Wikipedia summary. The match is exact, so a creator never gets someone else's biography. Wikidata and Wikipedia are free and need no key. Many creators have no Wikipedia page, so the panel falls back to the channel's own description. The short tagline uses Wikidata's description when one exists, otherwise the first sentence of the channel description. In preview mode the creator strip uses the curated channels and their descriptions, and the stats and Wikipedia lookups are off.

## Language and region settings

Open **Settings** from the avatar button at the top right (its accessible name is "Settings"). The dialog has three controls and saves only when you press **Save**. **Cancel** discards the draft.

- **Language** sets the spoken language videos must be in. Choose English, Spanish, Portuguese, French, German, Hindi, Japanese, Korean, Chinese, Russian, or **Any language**.
- **Region** lists the countries you chose as removable chips, with an **Add a country** menu. At least one country stays selected. The first country is also sent to YouTube as its search region.
- **Creators** sets how strictly the region applies:
  - **Prefer my region** (default) hides creators who list another country and keeps creators who list no country.
  - **Only my region** keeps only creators who list one of your countries, and only videos tagged with your language. It is the strictest mode, so rows can be shorter.
  - **Anywhere** turns the region check off.

**Defaults without location permission.** DevFlix never asks for your location. The first-run country comes from the region part of your browser's language tag (for example `en-CA` gives Canada). If the tag has no region, a small table maps your time zone to a country. Neighbouring markets are added to the default: US with Canada, UK with Ireland, and Australia with New Zealand. If nothing is detected, the United States is used. The language defaults to English and creators to **Prefer my region**. Settings are stored only in this browser, under `devflix-settings-v1`.

**How the language filter decides.** The spoken (audio) language tag decides, and regional variants of the chosen language count (Spanish accepts `es-MX`). A few English regional tags that are often applied to mixed-language audio do not count as English (`UNRELIABLE_ENGLISH_TAGS` in `src/api.ts`). Without an audio tag, a different metadata language drops the video. For Latin-script languages, a title with 30% or more non-Latin letters is also dropped. In **Only my region** mode, videos without an audio tag are dropped. Search requests send the chosen language as `relevanceLanguage` and the first chosen country as `regionCode`. These only bias YouTube's ranking, so each result is still checked with `videos.list` (1 unit per 50 videos). Creator suggestions and channel search results get the same check at the channel level: DevFlix samples each channel's 5 latest uploads and keeps the channel when at least 60% match, remembered for the session (1 unit per channel plus 1 per 50 videos).

**Creator region.** The region check uses the country each channel lists, because the YouTube Data API does not report where views come from. It costs about 1 unit per row (a `channels.list` call per 50 creators). Followed channels are never filtered by region.

**Changing settings.** Saving refetches YouTube data: cached results for the old settings are dropped, and the rows on screen reload with the new ones. The search, row, playlist and channel query keys include the current settings, so results saved under different settings do not mix.

**Limits outside English.** The dev and off-topic keyword lists in `src/homeRows.ts` are English-only (`isOnTopic`). With another language, discovery rows and creator suggestions rely on YouTube's categories and the language check described above, so they may include off-topic videos that an English row would drop.

## Cache and YouTube quota

- All API requests run through TanStack Query. `queryKeys.ts` separates trending, channel-upload, detail and normalized search caches. The For you hero and the Hot this week row share a query key, and onboarding reuses the same trending queries to suggest creators, so concurrent consumers deduplicate requests.
- **One-hour stale time** means revisiting a row, reopening a modal, or repeating a search normally reuses fresh data without another request. Window focus refetching is disabled.
- **24-hour garbage collection and persisted-cache maximum age** preserve useful data across reloads without retaining it indefinitely. `PersistQueryClientProvider` waits for hydration before queries fetch. A demo/live cache buster prevents preview records contaminating the live catalog. The sync-storage persister throttles writes to one second.
- Home rows and channel rows each have their own query, skeleton and retry UI. `IntersectionObserver` enables a row once it enters a 150px viewport margin; offscreen rows spend no quota until approached.
- Search-based rows (the four home rows) use `search.list` at 100 units per call, plus the language check described under Language and region settings. New from your channels uses `playlistItems.list` (1 unit per channel, 20 uploads), and creator profiles use `channels.list` (1 unit per 50 channels). `videos.list` fetches full descriptions, durations and embeddability on card hover/focus, using the exact query later consumed by the modal. Fast clicks show the existing summary immediately while details load. Prefetching can consume quota for unwatched videos, but the fresh detail cache deduplicates repeat hovers.
- Search is **submit-only**, not per keystroke. `useInfiniteQuery` follows `nextPageToken`, requests 20 results at a time, and retains up to 10 pages. The sentinel loads more at the bottom; failed pages require explicit retry. Search requests have historically been considerably more expensive than playlist/detail requests; check current Google quota rules for your project.
- Client errors (including invalid keys and exhausted quota) do not retry automatically. Transient server/network failures retry once. Abort signals cancel obsolete requests.
- Cache persistence is best effort if browser storage is unavailable/full. My List and Continue Watching use separate, validated localStorage records, with a session-only fallback and cross-tab synchronization. They are not accounts or cloud sync.

Official references: [TanStack persistence](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient), [YouTube quota](https://developers.google.com/youtube/v3/determine_quota_cost), [search API](https://developers.google.com/youtube/v3/docs/search/list).

## Playback and accessibility

The privacy-enhanced YouTube iframe resumes at the last recorded second. Progress messages are checked against the iframe window and exact YouTube origin, saved every five seconds and on close/page exit. Merely opening a video does not add it to Continue Watching. Videos reaching 95% are removed from that row. Browser restrictions or blocked YouTube scripts can prevent progress reporting; the YouTube link remains available.

Cards support Left/Right, Home and End navigation, touch scrolling, and visible keyboard focus. The native dialog traps focus, supports Escape, and restores focus to the opener. Reduced motion is respected. React Query Devtools are included for development.

## Channels and Following

The Channels tab opens with trending creators: the channels behind the most-viewed recent videos in each topic, most frequent first. The AI & Agents, Frontend, Backend, System Design and DevOps filters narrow the list to one topic. These suggestions come from the same cached topic searches as the home rows, so browsing them adds no extra search cost. In preview mode, the tab shows the curated starter channels that match the topic.

**Subscriber size and sort.** The Channels tab and the onboarding creator step offer size chips (Any size, Under 100K, 100K–1M and 1M+) and a sort menu (Most subscribers, Fewest subscribers, or Suggested order). Bounds are inclusive at the lower end: 100,000 falls in 100K–1M and 1,000,000 falls in 1M+. Creators with unknown subscriber counts appear only under Any size and sort last. Creator cards show their subscriber count (for example "1.2M subscribers") in place of the channel description. The size and sort controls are hidden in preview mode, where the sample collection has no counts.

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

The creator step has the same subscriber size chips and sort as the Channels tab. Preview mode fills the followed-channel row with the sample videos of the followed starter channels.

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

Production build and TypeScript checks pass. All 125 automated tests pass. The suite covers onboarding completion, skip/cancel, returning visits, edit/search selection preservation, personalized For you rows, the single New from your channels row and creator filtering, YouTube import classification, the upload-title pass, pre-selection, error retry and the hidden-when-unconfigured state, stored subscription IDs and the Subscribed badge, home row ranking and duration filtering, topic freshness cutoffs and the merged freshness search, language filtering with its batched check (in any-language, English and Only my region modes), Settings defaults, detection, validation and persistence, the Settings dialog (save, cancel and the last-country rule), region filtering with explicit settings and the settings-driven search parameters, subscriber size buckets and sorting, creator profiles, Wikipedia matching through Wikidata, formatting helpers, local video storage, query identities, channel follow/unfollow persistence, category filtering, feed merging and ordering, and the Channels-to-Following interaction. Live API and visual browser verification are not part of these automated tests. The local dev server could not be started in the execution environment because opening port 5173 was denied (EPERM).
