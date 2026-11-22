import { useCallback, useState, type ComponentType } from 'react';
import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { Check, Plus, Search, Users } from 'lucide-react';
import { channelTopics, type Channel, type ChannelTopic } from './channels';
import { channelUploads, mergeFeed, searchChannels } from './channelApi';
import { toggleFollow, useFollowing } from './channelStore';
import { useSubscriptions } from './subscriptionStore';
import { useLoadMoreSentinel, useTrendingCreators } from './trending';
import { allTopics } from './topics';
import { demoVideos, isDemo, type Video } from './api';
import { queryKeys } from './queryKeys';
import { formatCount, useCreatorProfiles } from './creators';
export type SizeFilter = 'any' | 'small' | 'mid' | 'large';
export type SizeSort = 'most' | 'fewest' | 'suggested';
const sizeOptions: { id: SizeFilter; label: string }[] = [{ id: 'any', label: 'Any size' }, { id: 'small', label: 'Under 100K' }, { id: 'mid', label: '100K–1M' }, { id: 'large', label: '1M+' }];
const matchesSize = (n: number | undefined, f: SizeFilter) => f === 'any' || (n !== undefined && (f === 'small' ? n < 100_000 : f === 'mid' ? n >= 100_000 && n < 1_000_000 : n >= 1_000_000));
/** Filter by subscriber size and sort; unknown counts are excluded by size chips and go last when sorting. */
export function filterBySize<T extends { id: string }>(items: T[], subs: Record<string, number | undefined> | undefined, size: SizeFilter, sort: SizeSort): T[] {
  if (!subs || isDemo) return items;
  const kept = items.filter(c => matchesSize(subs[c.id], size));
  if (sort === 'suggested') return kept;
  const dir = sort === 'most' ? -1 : 1;
  return [...kept].sort((a, b) => { const x = subs[a.id], y = subs[b.id]; return x === undefined || y === undefined ? Number(x === undefined) - Number(y === undefined) : dir * (x - y); });
}
export function SizeControls({ size, onSize, sort, onSort }: { size: SizeFilter; onSize: (s: SizeFilter) => void; sort: SizeSort; onSort: (s: SizeSort) => void }) {
  if (isDemo) return null;
  return <div className="size-filter"><div className="topics" role="group" aria-label="Subscriber size">{sizeOptions.map(o => <button key={o.id} type="button" className={o.id === size ? 'selected' : ''} aria-pressed={o.id === size} onClick={() => onSize(o.id)}>{o.label}</button>)}</div><select className="size-sort" aria-label="Sort creators" value={sort} onChange={e => onSort(e.target.value as SizeSort)}><option value="most">Sort: Most subscribers</option><option value="fewest">Sort: Fewest subscribers</option><option value="suggested">Sort: Suggested order</option></select></div>;
}
export function SubscriberCount({ subscribers, loading }: { subscribers?: number; loading?: boolean }) {
  if (isDemo || loading) return null;
  const n = formatCount(subscribers);
  return <span className="subscriber-count">{n ? `${n} subscribers` : 'Subscribers hidden'}</span>;
}
function FollowButton({ channel }: { channel: Channel }) {
  const active = useFollowing().some(c => c.id === channel.id);
  return <button className={`button ${active ? 'secondary' : 'primary'}`} aria-pressed={active} aria-label={`${active ? 'Unfollow' : 'Follow'} ${channel.title}`} onClick={() => toggleFollow(channel)}>{active ? <Check size={16}/> : <Plus size={16}/>} {active ? 'Following' : 'Follow'}</button>;
}
function ChannelCard({ channel, subscribers, loading }: { channel: Channel; subscribers?: number; loading?: boolean }) {
  const [failed, setFailed] = useState(false);
  const subscribed = useSubscriptions().has(channel.id);
  return <article className="channel-card"><div className="channel-avatar">{channel.thumbnail && !failed ? <img src={channel.thumbnail} alt="" loading="lazy" onError={() => setFailed(true)}/> : channel.title.slice(0, 2).toUpperCase()}</div><a href={`https://www.youtube.com/channel/${channel.id}`} target="_blank" rel="noreferrer"><h2>{channel.title} ↗</h2></a><SubscriberCount subscribers={subscribers} loading={loading}/>{subscribed && <span className="subscribed-badge">Subscribed on YouTube</span>}<div className="channel-tags">{channel.topics.map(t => <span key={t}>{t}</span>)}</div><FollowButton channel={channel}/></article>;
}
export function ChannelsPage() {
  const [topic, setTopic] = useState<ChannelTopic>('All topics');
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const trending = useTrendingCreators(topic === 'All topics' ? allTopics : [topic], !term);
  const results = useInfiniteQuery({ queryKey: queryKeys.channelSearch(term), initialPageParam: '', queryFn: ({ pageParam, signal }) => searchChannels(term, pageParam, signal), getNextPageParam: page => page.nextPageToken, enabled: !!term && !isDemo });
  const loadMore = useCallback(() => void results.fetchNextPage(), [results.fetchNextPage]);
  const sentinel = useLoadMoreSentinel(!!term && !!results.hasNextPage && !results.isFetchingNextPage && !results.isFetchNextPageError, loadMore);
  const channels = term && !isDemo ? [...new Map(results.data?.pages.flatMap(p => p.channels).map(c => [c.id, c])).values()] : trending.creators.filter(c => !term || `${c.title} ${c.description}`.toLowerCase().includes(term.toLowerCase()));
  const [size, setSize] = useState<SizeFilter>('any');
  const [sort, setSort] = useState<SizeSort>('most');
  const profiles = useCreatorProfiles(channels.map(c => c.id), !isDemo);
  const subs = profiles.data ? Object.fromEntries(Object.entries(profiles.data).map(([id, p]) => [id, p.subscribers])) : undefined;
  const shown = filterBySize(channels, subs, size, sort);
  return <section className="results"><p className="eyebrow">FIND YOUR PEOPLE</p><h1>Learn from the builders<span className="heading-dot">.</span></h1><p className="muted">Browse the creators behind this month’s most-watched videos in each topic, or search YouTube for a creator you love. Follows stay in DevFlix on this browser.</p><form className="channel-search" onSubmit={e => { e.preventDefault(); setTerm(input.trim()); setTopic('All topics'); }}><Search size={18}/><input aria-label="Search YouTube channels" value={input} onChange={e => setInput(e.target.value)} placeholder="Search channels by name or topic…"/><button className="button primary" type="submit">Search</button></form>{term ? <div className="channel-search-summary"><h2>Channels matching “{term}”</h2><button className="text-button" onClick={() => { setTerm(''); setInput(''); }}>Back to collection</button></div> : <div className="topics" aria-label="Channel topics">{channelTopics.map(t => <button key={t} className={t === topic ? 'selected' : ''} aria-pressed={t === topic} onClick={() => setTopic(t)}>{t}</button>)}</div>}<SizeControls size={size} onSize={setSize} sort={sort} onSort={setSort}/>{isDemo && <p className="muted">Preview mode: browse and follow starter channels. Connect YouTube to search beyond this collection and see their latest uploads.</p>}{!term && trending.isPending && <p role="status">Finding trending creators…</p>}{!term && trending.error && <div role="alert" className="error-box"><p>{trending.error.message}</p><button className="text-button" onClick={() => trending.retry()}>Retry</button></div>}{term && !isDemo && results.isPending && <p role="status">Searching channels…</p>}{term && results.isError && <div role="alert" className="error-box"><p>{results.error.message}</p><button className="text-button" onClick={() => results.isFetchNextPageError ? void results.fetchNextPage() : void results.refetch()}>Try again</button></div>}<div className="channel-grid">{shown.map(c => <ChannelCard key={c.id} channel={c} subscribers={subs?.[c.id]} loading={profiles.isPending && !isDemo}/>)}</div>{!shown.length && !!channels.length && !isDemo && <p className="empty">No creators match this size. Try another range.</p>}{!channels.length && !(!term && (trending.isPending || trending.error)) && (isDemo || !term || (!results.isPending && !results.isError)) && <p className="empty">No channels found. Try another name or topic.</p>}{term && results.isFetchingNextPage && <p role="status">Loading more channels…</p>}{term && results.isFetchNextPageError && <button className="button secondary" onClick={() => void results.fetchNextPage()}>Retry loading more</button>}<div ref={sentinel}/></section>;
}
export function FollowingPage({ onOpen, onBrowse, Card }: { onOpen: (v: Video) => void; onBrowse: () => void; Card: ComponentType<{ video: Video; onOpen: (v: Video) => void }> }) {
  const following = useFollowing();
  const feeds = useQueries({ queries: following.map(channel => ({ queryKey: queryKeys.channelUploads(channel.id), queryFn: ({ signal }: { signal: AbortSignal }) => channelUploads(channel, signal), enabled: !isDemo })) });
  const videos = isDemo ? demoVideos.filter(v => following.some(c => c.title === v.channel)) : mergeFeed(feeds.map(f => f.data ?? []));
  const loading = !isDemo && feeds.some(f => f.isPending);
  return <section className="results"><p className="eyebrow">YOUR CREATORS. YOUR CURIOSITY.</p><h1>Following<span className="heading-dot">.</span></h1><p className="muted">Recent uploads from your channels, newest first. Up to 20 videos per channel.</p>{!following.length ? <div className="empty-library"><Users size={34}/><h2>Your feed starts with a follow.</h2><p>Choose the creators you want to learn from.</p><button className="button primary" onClick={onBrowse}>Discover channels</button></div> : <><div className="following-channels">{following.map(c => <div key={c.id}><span>{c.title}</span><FollowButton channel={c}/></div>)}</div>{isDemo && <p className="demo-banner">Preview videos only. Connect YouTube to load recent uploads from your followed channels.</p>}{loading && <p role="status">Loading your channels…</p>}{feeds.map((f, index) => f.isError && <div className="error-box" key={following[index].id} role="alert"><p>{following[index].title}: {f.error.message}</p><button className="text-button" onClick={() => void f.refetch()}>Retry channel</button></div>)}<div className="results-grid">{videos.map(v => <Card key={v.id} video={v} onOpen={onOpen}/>)}</div>{!videos.length && !loading && !feeds.some(f => f.isError) && <p className="empty">{isDemo ? 'No preview videos for these channels. Your follows are saved for live mode.' : 'No public uploads available from these channels yet.'}</p>}</>}</section>;
}
