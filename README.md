# DevFlix

A Netflix-style home for free tech lessons from YouTube: AI, frontend, backend, system design and DevOps.

Built with Vite, React, TypeScript, TanStack Query and the YouTube Data API. There is no backend: everything runs in the browser.

## Quick start

Needs Node.js 20.19+ or 22.12+.

```sh
npm install
cp .env.example .env.local   # then add your keys
npm run dev
```

| Variable | Required | What it's for |
| --- | --- | --- |
| `VITE_YT_API_KEY` | Yes, for live data | YouTube Data API v3 key. Without it you get a labelled preview catalog. |
| `VITE_GOOGLE_CLIENT_ID` | No | Turns on **Import from YouTube** during setup. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | No | Turns on **Sign in**, so lists and settings follow you across devices. |

Vite variables are visible to anyone using the app, so restrict the API key to the YouTube Data API and your site's URLs in Google Cloud. Restart `npm run dev` after editing `.env.local`.

Other commands: `npm test`, `npm run build`, `npm run preview`.

## What's in the app

- **Setup:** pick topics and creators, or import your YouTube subscriptions.
- **For you:**
  - Your creators as round avatars. Click one to see their profile and only their videos.
  - **New from your channels**, newest first.
  - Four discovery rows (below).
- **Channels:** browse trending creators, filter by subscriber count, and search YouTube.
- **Following:** recent uploads from everyone you follow.
- **My List** and **Continue Watching**, saved in your browser. Continue Watching has a Clear button.
- **Player:** opens in a modal, with an **About the creator** panel showing subscribers, channel age and a short bio.
- **Settings** (avatar, top right): language and region preferences.
- **Accounts (optional):** sign in with Google to keep everything above on every device. Without signing in, it all saves in your browser.

### Discovery rows

| Row | What it shows |
| --- | --- |
| Hot this week | Videos from the last 7 days with 10K+ views, fastest-growing first. |
| Deep dives | Long tutorials and courses, 20+ minutes. |
| Quick explainers | Videos under 10 minutes. |
| Rising creators | Smaller channels (1K–250K subscribers) with a video taking off this week. |

Rows use your chosen topics and load as you scroll.

## How videos are picked

Every discovery video passes these checks:

1. **Language:** the video's spoken language must match your setting.
2. **Category:** gaming, music, sports, news and politics, and other off-topic YouTube categories are hidden.
3. **On topic:** the title or description must be about dev or AI. Commentary, clickbait and game or politics titles are skipped. These keyword checks only run when the language is English.
4. **Fresh enough:** limits depend on the topic, because AI changes fast and fundamentals don't.

   | Topic | Max age |
   | --- | --- |
   | AI & Agents | 45 days |
   | Frontend | 18 months |
   | DevOps | 2 years |
   | Backend | 3 years |
   | System Design | 5 years |

5. **Region:** follows your Settings (below).

Videos from channels you follow only get checks 1 and 2.

To tune these, edit:

| File | What it controls |
| --- | --- |
| `src/topics.ts` | Topics, search keywords and age limits |
| `src/classify.ts` | Keyword lists |
| `src/api.ts` | Blocked categories |
| `src/homeRows.ts` | Row rules |

## Settings

| Setting | Default | Options |
| --- | --- | --- |
| Language | English | 10 languages, or Any language |
| Region | Your country, from your browser's language and time zone (no location permission) | Any countries you add |
| Creators | Prefer my region | **Prefer my region**: hide creators who list another country.<br>**Only my region**: the creator must list your country and the video must be tagged with your language.<br>**Anywhere**: no region filter. |

Settings are saved in your browser. Changing them reloads the feeds.

## Accounts (optional)

Signing in saves your topics, followed channels, imported subscriptions, My List, Continue Watching and settings to your account. Nobody has to sign in: without an account, everything is saved in the browser as before.

- **First sign-in:** what's saved in this browser is uploaded to your new account.
- **Later sign-ins:** your account's data replaces this browser's copy, so every device shows the same thing.
- **While signed in:** changes upload within a few seconds.
- **Signing out** clears this browser's copy, so a shared computer keeps nothing of yours.

Accounts use [Supabase](https://supabase.com) (free tier is plenty) for Google sign-in and one database table. There is no server to run. To turn it on:

1. Create a Supabase project. In **SQL Editor**, run `supabase/schema.sql`. It creates the `profiles` table with row-level security, so each person can only read and write their own row.
2. In Google Cloud, open your OAuth client (the one from the YouTube import works) and add `https://<your-project>.supabase.co/auth/v1/callback` as an authorized redirect URI.
3. In Supabase, go to **Authentication → Sign In / Providers → Google**, turn it on, and paste the OAuth client ID and secret.
4. In **Authentication → URL Configuration**, set the Site URL to your deployed site and add `http://localhost:5173/**` to the redirect URLs.
5. Put the project URL and publishable key (**Project Settings → API Keys**) in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

The publishable key is meant to be public; row-level security is what protects the data.

## Import from YouTube (optional)

Reads your subscriptions (read-only) and pre-selects the AI and dev channels for you to review. Nothing on YouTube changes, and access is revoked right after the import.

To turn it on:

1. In Google Cloud, set up the **OAuth consent screen** and add yourself as a test user.
2. Create an **OAuth client ID** (Web application) with `http://localhost:5173` as an authorized JavaScript origin.
3. Put the client ID in `VITE_GOOGLE_CLIENT_ID`.

Google will warn that the app isn't verified while it's in testing. That's expected.

## YouTube quota

The default quota is 10,000 units a day. Searches cost 100 units. Everything else costs about 1 unit per 50 items.

| Action | Approximate cost |
| --- | --- |
| First load of For you (all 5 topics) | ~900 units |
| Each extra page of search results | ~100 units |
| Subscription import | up to ~500 units |

Results are cached in the browser to keep this down. Home rows refresh at most every 6 hours, and other data every hour. If the quota runs out, rows show an error until it resets at midnight Pacific time.

## Project structure

| File | What it does |
| --- | --- |
| `App.tsx` | Layout, rows, player and settings dialog |
| `Onboarding.tsx` | Topic and creator setup |
| `ChannelsPage.tsx` | Channel browsing and Following |
| `api.ts` | YouTube requests, language and category filters |
| `homeRows.ts` | Discovery rows |
| `trending.ts` | Trending creators, followed feed, infinite-scroll helper |
| `creators.ts` | Channel stats, Wikipedia bios, formatting |
| `classify.ts` | Topic, relevance and clickbait checks |
| `settings.ts` | Saved settings |
| `account.ts`, `localData.ts` | Optional sign-in and syncing saved data to an account |
| `region.ts` | Region check |
| `youtubeAuth.ts` | Google sign-in for the import |
| `youtubeImport.ts` | Reads and sorts subscriptions |
| `*Store.ts`, `storage.ts`, `preferences.ts` | Local data |

## Tests

`npm test` runs 137 tests with Vitest and Testing Library. They cover onboarding, the feeds and their filters, settings, the import, accounts, and local storage. They mock the network, so they don't use your quota or check live YouTube data.

## Workflow and deploys

All changes go through pull requests to `main`.

1. Branch from `main`, commit, and open a PR.
2. **CI** (`.github/workflows/ci.yml`) runs `npm test` and `npm run build` on every PR and on every push to `main`. The PR can only merge once it passes.
3. After CI passes on `main`, **Deploy** (`.github/workflows/deploy.yml`) builds the site and publishes it to GitHub Pages. You can also run it by hand from the Actions tab.

Dependabot opens weekly PRs for npm updates and monthly ones for GitHub Actions.

Deploys read `VITE_YT_API_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the repository's Actions secrets. These end up in the public bundle, so restrict the API key to your Pages URL, and add the Pages URL as an authorized JavaScript origin on the OAuth client.
