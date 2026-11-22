import { getSettings, type Settings } from './settings';
/**
 * Whether a creator fits the region chosen in Settings, judged from the country listed on their channel
 * (YouTube's Data API doesn't report where views come from). "prefer" keeps creators with no listed country,
 * "only" requires one of the chosen countries, "any" turns the check off.
 */
export function isPreferredRegion(country?: string, settings: Settings = getSettings()): boolean {
  if (settings.creatorRegion === 'any') return true;
  if (!country) return settings.creatorRegion === 'prefer';
  return settings.countries.includes(country.toUpperCase());
}
