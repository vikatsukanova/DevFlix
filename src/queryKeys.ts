export const queryKeys = {
  channelDirectory: ['youtube', 'channel-directory'] as const,
  channelSearch: (term: string) => ['youtube', 'channel-search', term.trim().toLowerCase()] as const,
  channelUploads: (id: string) => ['youtube', 'channel-uploads', id] as const,
  all: ['youtube'] as const,
  playlist: (id: string) => ['youtube', 'playlist', id] as const,
  video: (id: string) => ['youtube', 'video', id] as const,
  search: (term: string) => ['youtube', 'search', term.trim().toLowerCase()] as const,
};
