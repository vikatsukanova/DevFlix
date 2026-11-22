/**
 * Discovery (home rows, creator suggestions, channel search) favours creators whose channel lists one of these
 * countries, matching the app's target audience. Creators who don't list a country are always included.
 * YouTube's Data API doesn't report where views come from, so the channel's listed country is the signal used.
 * Edit this list to target a different audience.
 */
export const PREFERRED_COUNTRIES = ['US', 'CA', 'GB', 'IE', 'AU', 'NZ'];
export const isPreferredRegion = (country?: string) => !country || PREFERRED_COUNTRIES.includes(country.toUpperCase());
