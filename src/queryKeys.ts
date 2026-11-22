import { settingsKey } from './settings';
export const queryKeys = {
  channelDirectory: ['youtube', 'channel-directory'] as const,
  channelSearch: (term: string) => ['youtube', 'channel-search', term.trim().toLowerCase(), settingsKey()] as const,
  channelUploads: (id: string) => ['youtube', 'channel-uploads', id, settingsKey()] as const,
  all: ['youtube'] as const,
  playlist: (id: string) => ['youtube', 'playlist', id, settingsKey()] as const,
  video: (id: string) => ['youtube', 'video', id] as const,
  search: (term: string) => ['youtube', 'search', term.trim().toLowerCase(), settingsKey()] as const,
  trending: (topic: string) => ['youtube', 'trending', topic, settingsKey()] as const,
  trendingCreators: (ids: string[]) => ['youtube', 'trending-creators', [...ids].sort().join(','), settingsKey()] as const,
};
