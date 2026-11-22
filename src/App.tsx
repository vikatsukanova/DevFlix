import Onboarding from './Onboarding';
import { usePreferences } from './preferences';
import { ChannelsPage, FollowingPage } from './ChannelsPage';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Bookmark, Check, ChevronLeft, ChevronRight, Code2, Play, Plus, Search, Settings as SettingsIcon, Sparkles, X } from 'lucide-react';
import { demoVideos, durationSeconds, isDemo, search, videoOptions, type Video } from './api';
import { allTopics, orderTopics, topicFeeds } from './topics';
import { useFollowedFeed } from './trending';
import { creatorTagline, formatAge, formatCount, useCreatorProfiles, useCreatorWiki, useVideoDetails, type CreatorProfile, type Wiki } from './creators';
import { fetchHomeRow, homeRowKey, homeRows, type HomeRowId } from './homeRows';
import { useFollowing } from './channelStore';
import type { Channel } from './channels';
import type { Topic } from './classify';
type Category = Topic | 'All topics';
const categories: Category[] = ['All topics', ...allTopics];
import { queryKeys } from './queryKeys';
import { COUNTRIES, LANGUAGES, saveSettings, useSettings, type CreatorRegion } from './settings';
import { clearWeekPools } from './homeRows';
import { clearChannelLanguageCache } from './channelApi';
import { clearWatching, saveProgress, toggleSaved, useLibrary } from './storage';
function useVisible() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => { const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: '150px' }); if (ref.current) observer.observe(ref.current); return () => observer.disconnect(); }, []);
  return { ref, visible };
}
function SaveButton({ video, compact = false }: { video: Video; compact?: boolean }) {
  const saved = useLibrary().saved.some(v => v.id === video.id);
  return <button className="button secondary" onClick={() => toggleSaved(video)} aria-pressed={saved} aria-label={saved ? 'Remove from My List' : 'Add to My List'}>{saved ? <Check size={19}/> : <Plus size={19}/>} {!compact && (saved ? 'In My List' : 'My List')}</button>;
}
function Card({ video, onOpen, views, subscribers }: { video: Video; onOpen: (v: Video) => void; views?: number; subscribers?: number }) {
  const client = useQueryClient();
  const progress = useLibrary().watching.find(p => p.video.id === video.id);
  const prefetch = () => { if (!isDemo) void client.prefetchQuery(videoOptions(video.id)); };
  const subs = formatCount(subscribers);
  const viewCount = formatCount(views);
  const age = formatAge(video.publishedAt);
  const stats = [viewCount && `${viewCount} views`, age].filter(Boolean).join(' · ');
  return <button className="video-card" onMouseEnter={prefetch} onFocus={prefetch} onClick={() => onOpen(video)}>
    <div className="thumbnail"><img src={video.thumbnail} alt="" loading="lazy"/><span className="card-play"><Play fill="currentColor" size={22}/></span><span className="youtube-label">YouTube</span>{progress && <div className="progress"><i style={{ width: `${Math.min(100, progress.seconds / progress.duration * 100)}%` }}/></div>}</div>
    <h3>{video.title}</h3><p>{video.channel}{subs && <span> · {subs} subs</span>}</p><p className="card-stats">{stats || 'Free lesson'}</p>
  </button>;
}
/** Cards for a row of videos, with view and subscriber counts fetched once for the whole row. */
function VideoRail({ videos, onOpen }: { videos: Video[]; onOpen: (v: Video) => void }) {
  const { stats, profiles } = useVideoDetails(videos);
  return <>{videos.map(v => <Card key={v.id} video={v} onOpen={onOpen} views={stats[v.id]?.views} subscribers={v.channelId ? (profiles as Record<string, CreatorProfile>)[v.channelId]?.subscribers : undefined}/>)}</>;
}
/** Two-step clear so one stray click doesn't wipe your progress. Only Continue Watching is cleared; My List stays. */
function ClearWatching() {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <button className="text-button rail-action" onClick={() => setConfirming(true)}>Clear</button>;
  return <span className="rail-confirm" role="group" aria-label="Clear Continue Watching?"><span>Clear all?</span><button className="text-button rail-action" onClick={() => { clearWatching(); setConfirming(false); }}>Yes, clear</button><button className="text-button rail-action" onClick={() => setConfirming(false)}>Cancel</button></span>;
}
function Rail({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const cards = Array.from(rail.current?.querySelectorAll<HTMLButtonElement>('.video-card') ?? []);
    const index = cards.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
    cards[next]?.focus({ preventScroll: true }); cards[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
  return <section className="row"><div className="row-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div className="rail-controls">{action}<button aria-label={`Scroll ${title} left`} onClick={() => rail.current?.scrollBy({ left: -700, behavior: 'smooth' })}><ChevronLeft size={18}/></button><button aria-label={`Scroll ${title} right`} onClick={() => rail.current?.scrollBy({ left: 700, behavior: 'smooth' })}><ChevronRight size={18}/></button></div></div><div className="rail" ref={rail} onKeyDown={navigate}>{children}</div></section>;
}
function ErrorBox({ message, retry }: { message: string; retry: () => void }) { return <div className="error-box" role="alert"><p>{message}</p><button className="text-button" onClick={retry}>Try again ↗</button></div>; }
function Skeletons() { return <>{Array.from({ length: 5 }, (_, i) => <div className="skeleton" key={i}><div/><i/><i/></div>)}</>; }
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
function CreatorAvatar({ name, src, size = 64 }: { name: string; src?: string; size?: number }) {
  return <span className="creator-avatar" style={{ width: size, height: size, fontSize: size / 3 }} aria-hidden="true">{src ? <img src={src} alt="" loading="lazy"/> : initials(name)}</span>;
}
function creatorFacts(profile?: CreatorProfile): string[] {
  if (!profile) return [];
  const subs = formatCount(profile.subscribers), videos = formatCount(profile.videoCount);
  const since = profile.joined && !Number.isNaN(Date.parse(profile.joined)) ? new Date(profile.joined).getUTCFullYear() : undefined;
  return [subs && `${subs} subscribers`, videos && `${videos} videos`, since && `On YouTube since ${since}`, profile.country].filter((x): x is string => !!x);
}
function CreatorBio({ profile, wiki }: { profile?: CreatorProfile; wiki?: Wiki | null }) {
  if (wiki?.extract) return <p className="creator-bio">{wiki.extract} <a className="text-button inline" href={wiki.url} target="_blank" rel="noreferrer">Source: Wikipedia</a></p>;
  return profile?.description ? <p className="creator-bio clamp">{profile.description}</p> : null;
}
function CreatorChip({ channel, profile, selected, onSelect }: { channel: Channel; profile?: CreatorProfile; selected: boolean; onSelect: () => void }) {
  const wiki = useCreatorWiki(channel.id).data;
  const tagline = creatorTagline(profile ?? channel, wiki);
  return <button className={`creator-chip${selected ? ' selected' : ''}`} aria-pressed={selected} aria-label={`Show videos from ${channel.title}`} onClick={onSelect}><CreatorAvatar name={channel.title} src={profile?.thumbnail ?? channel.thumbnail}/><strong>{channel.title}</strong>{tagline && <span>{tagline}</span>}</button>;
}
function CreatorProfileCard({ channel, profile, onClear }: { channel: Channel; profile?: CreatorProfile; onClear: () => void }) {
  const wiki = useCreatorWiki(channel.id).data;
  const facts = creatorFacts(profile);
  return <section className="creator-profile" aria-label={`About ${channel.title}`}><CreatorAvatar name={channel.title} src={profile?.thumbnail ?? channel.thumbnail} size={84}/><div><h2>{channel.title}</h2>{profile?.handle && <p className="creator-handle">{profile.handle.startsWith('@') ? profile.handle : `@${profile.handle}`}</p>}{facts.length > 0 && <p className="creator-facts">{facts.join(' · ')}</p>}<CreatorBio profile={profile ?? { id: channel.id, title: channel.title, description: channel.description }} wiki={wiki}/><div className="creator-links"><a className="text-button" href={`https://www.youtube.com/channel/${channel.id}`} target="_blank" rel="noreferrer">Open on YouTube <ArrowUpRight size={14}/></a><button className="text-button" onClick={onClear}>Show all creators</button></div></div></section>;
}
function FollowedSection({ onOpen, onBrowse }: { onOpen: (v: Video) => void; onBrowse: () => void }) {
  const { ref, visible } = useVisible();
  const following = useFollowing();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = following.find(c => c.id === selectedId);
  const profiles: Record<string, CreatorProfile> = useCreatorProfiles(following.map(c => c.id)).data ?? {};
  const feed = useFollowedFeed(visible);
  const videos = selected ? feed.videos.filter(v => v.channelId === selected.id || v.channel === selected.title) : feed.videos;
  return <div ref={ref}>
    {following.length > 0 && <div className="creator-strip" role="group" aria-label="Your creators">{following.map(c => <CreatorChip key={c.id} channel={c} profile={profiles[c.id]} selected={c.id === selected?.id} onSelect={() => setSelectedId(c.id === selected?.id ? null : c.id)}/>)}<button className="creator-chip find-more" onClick={onBrowse}><span className="creator-avatar" style={{ width: 64, height: 64 }}><Plus size={24}/></span><strong>Find more</strong></button></div>}
    {selected && <CreatorProfileCard channel={selected} profile={profiles[selected.id]} onClear={() => setSelectedId(null)}/>}
    {!following.length ? <><div className="row-heading"><div><h2>New from your channels</h2></div></div><div className="home-empty"><p>Follow creators to get rows of their newest videos by topic.</p><button className="text-button" onClick={onBrowse}>Explore channels ↗</button></div></> : <Rail title={selected ? `New from ${selected.title}` : 'New from your channels'} subtitle={isDemo ? 'A preview from the creators you picked.' : 'Newest uploads from the creators you follow.'}>
      {feed.isPending && <p role="status" className="muted">Loading your channels…</p>}
      {feed.errors.map(e => <ErrorBox key={e.channel.id} message={`${e.channel.title}: ${e.message}`} retry={e.retry}/>)}
      <VideoRail videos={videos.slice(0, 30)} onOpen={onOpen}/>
      {!feed.isPending && !videos.length && <p className="empty">{isDemo ? 'Your channels are saved. Connect YouTube to see their latest videos.' : selected ? `No recent public videos from ${selected.title}.` : 'No public videos from your channels yet.'}</p>}
    </Rail>}
  </div>;
}
const homeRowOptions = (id: HomeRowId, topics: Topic[], enabled: boolean) => ({ staleTime: 6 * 60 * 60 * 1000, queryKey: homeRowKey(id, topics), queryFn: ({ signal }: { signal: AbortSignal }) => fetchHomeRow(id, topics, signal), enabled });
function HomeRow({ row, topics, onOpen }: { row: typeof homeRows[number]; topics: Topic[]; onOpen: (v: Video) => void }) {
  const { ref, visible } = useVisible();
  const query = useQuery(homeRowOptions(row.id, topics, visible));
  return <div ref={ref}><Rail title={row.title} subtitle={row.subtitle}>{query.isError ? <ErrorBox message={query.error.message} retry={() => void query.refetch()}/> : !query.data ? <Skeletons/> : query.data.length ? <VideoRail videos={query.data} onOpen={onOpen}/> : <p className="empty">No videos here yet. Check back soon.</p>}</Rail></div>;
}
function SearchResults({ term, onOpen }: { term: string; onOpen: (v: Video) => void }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const query = useInfiniteQuery({ queryKey: queryKeys.search(term), initialPageParam: '', queryFn: ({ pageParam, signal }) => isDemo ? Promise.resolve({ videos: demoVideos.filter(v => `${v.title} ${v.channel}`.toLowerCase().includes(term.toLowerCase())), nextPageToken: undefined }) : search(term, pageParam, signal), getNextPageParam: page => page.nextPageToken, enabled: !!term, maxPages: 10 });
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = query;
  useEffect(() => { const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage(); }); if (sentinel.current) observer.observe(sentinel.current); return () => observer.disconnect(); }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
  const videos = [...new Map(query.data?.pages.flatMap(p => p.videos).map(v => [v.id, v])).values()];
  return <section className="results"><p className="eyebrow">FOLLOW YOUR CURIOSITY</p><h1>Results for “{term}”</h1>{isDemo && <p className="muted">Preview results. Add your API key to search all of YouTube.</p>}{query.isError && !query.data ? <ErrorBox message={query.error.message} retry={() => void query.refetch()}/> : query.isPending ? <p role="status">Searching YouTube…</p> : <div className="results-grid"><VideoRail videos={videos} onOpen={onOpen}/></div>}{!query.isPending && !query.isError && !videos.length && <p className="empty">No videos found. Try another topic or creator.</p>}<div ref={sentinel}/>{isFetchingNextPage && <p role="status">Loading more lessons…</p>}{hasNextPage && <button className="button secondary" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{isFetchNextPageError ? 'Retry loading more' : 'Load more'}</button>}</section>;
}
function formatDuration(iso?: string): string | undefined {
  const total = durationSeconds(iso);
  if (total === undefined) return undefined;
  const h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), sec = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
function CreatorAside({ channelId, fallbackName }: { channelId: string; fallbackName: string }) {
  const profile = (useCreatorProfiles([channelId]).data as Record<string, CreatorProfile> | undefined)?.[channelId];
  const wiki = useCreatorWiki(channelId).data;
  const name = profile?.title ?? fallbackName;
  const subs = formatCount(profile?.subscribers), videos = formatCount(profile?.videoCount);
  const since = profile?.joined && !Number.isNaN(Date.parse(profile.joined)) ? new Date(profile.joined).getUTCFullYear() : undefined;
  const tagline = creatorTagline(profile, wiki);
  return <aside className="creator-aside" aria-label="About the creator"><h3>About the creator</h3><div className="creator-aside-head"><CreatorAvatar name={name} src={profile?.thumbnail} size={56}/><div><strong>{name}</strong>{tagline && <span>{tagline}</span>}</div></div><ul className="creator-aside-facts">{subs && <li>{subs} subscribers</li>}{videos && <li>{videos} videos</li>}{since && <li>On YouTube since {since}</li>}</ul><CreatorBio profile={profile} wiki={wiki}/><a className="text-button" href={`https://www.youtube.com/channel/${channelId}`} target="_blank" rel="noreferrer">Open channel on YouTube <ArrowUpRight size={14}/></a></aside>;
}
function VideoModal({ video, onClose }: { video: Video; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const library = useLibrary();
  const start = useRef(Math.floor(library.watching.find(p => p.video.id === video.id)?.seconds ?? 0));
  const detail = useQuery({ ...videoOptions(video.id), enabled: !isDemo });
  const current = detail.data ?? video;
  const { stats } = useVideoDetails([video]);
  const meta = [formatCount(stats[video.id]?.views) && `${formatCount(stats[video.id]?.views)} views`, formatAge(current.publishedAt), formatDuration(current.duration ?? stats[video.id]?.duration)].filter(Boolean).join(' · ');
  useEffect(() => { const previous = document.activeElement as HTMLElement; dialog.current?.showModal(); const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = overflow; previous?.focus(); }; }, []);
  useEffect(() => {
    // IFrame API messages are accepted only from this player and YouTube's exact origin.
    let seconds = start.current, duration = 0;
    const send = (payload: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(payload), 'https://www.youtube-nocookie.com');
    const listen = () => send({ event: 'listening', id: 'devflix-player', channel: 'widget' });
    function message(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== 'https://www.youtube-nocookie.com') return;
      try { const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; if (data.event === 'infoDelivery' && data.info) { if (typeof data.info.currentTime === 'number') seconds = data.info.currentTime; if (typeof data.info.duration === 'number') duration = data.info.duration; } } catch { /* ignore other player messages */ }
    }
    window.addEventListener('message', message);
    const handshake = window.setInterval(listen, 1000);
    const timer = window.setInterval(() => saveProgress(video, seconds, duration), 5000);
    const flush = () => saveProgress(video, seconds, duration);
    window.addEventListener('pagehide', flush);
    return () => { flush(); clearInterval(handshake); clearInterval(timer); window.removeEventListener('message', message); window.removeEventListener('pagehide', flush); };
  }, [video]);
  return <dialog className={`video-modal${video.channelId ? ' with-aside' : ''}`} ref={dialog} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="video-title"><div className="modal-inner"><button className="close-modal" aria-label="Close video" onClick={onClose}><X/></button><div className="modal-main">{detail.data?.embeddable === false ? <div className="empty">Embedding is disabled for this video. Open it on YouTube below.</div> : <iframe ref={frame} title={video.title} src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&enablejsapi=1&start=${start.current}&origin=${encodeURIComponent(window.location.origin)}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen/>}<div className="modal-copy"><p className="eyebrow">{current.channel}</p><h2 id="video-title">{current.title}</h2>{meta && <p className="modal-meta">{meta}</p>}<div className="modal-actions"><SaveButton video={current}/><a className="text-button" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer">Watch on YouTube <ArrowUpRight size={16}/></a></div>{detail.isError && <ErrorBox message={detail.error.message} retry={() => void detail.refetch()}/>}<p className="description">{current.description}</p></div></div>{video.channelId && <CreatorAside channelId={video.channelId} fallbackName={current.channel}/>}</div></dialog>;
}
function SettingsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const client = useQueryClient();
  const settings = useSettings();
  const [draft, setDraft] = useState(settings);
  useEffect(() => { const previous = document.activeElement as HTMLElement; dialog.current?.showModal(); const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = overflow; previous?.focus(); }; }, []);
  const label = (code: string) => COUNTRIES.find(c => c.code === code)?.label ?? code;
  const available = COUNTRIES.filter(c => !draft.countries.includes(c.code));
  const regions: { value: CreatorRegion; title: string; hint: string }[] = [
    { value: 'prefer', title: 'Prefer my region', hint: "Hide creators who list another country. Creators who don't list one still show." },
    { value: 'only', title: 'Only my region', hint: 'Only creators who list one of your countries, and only videos tagged with your language. Strictest; rows may be shorter.' },
    { value: 'any', title: 'Anywhere', hint: 'No region filter.' },
  ];
  const save = () => { saveSettings(draft); clearWeekPools(); clearChannelLanguageCache(); void client.resetQueries({ queryKey: ['youtube'] }); onClose(); };
  return <dialog className="settings-dialog" ref={dialog} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="settings-title"><form onSubmit={e => { e.preventDefault(); save(); }}>
    <h2 id="settings-title">Settings</h2>
    <div className="settings-field"><label htmlFor="settings-language">Language</label><select id="settings-language" value={draft.language} onChange={e => setDraft({ ...draft, language: e.target.value })}>{LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select></div>
    <div className="settings-field"><span className="settings-label" id="settings-region">Region</span>
      <ul className="settings-chips" aria-labelledby="settings-region">{draft.countries.map(code => <li key={code}><span>{label(code)}</span><button type="button" aria-label={`Remove ${label(code)}`} disabled={draft.countries.length <= 1} onClick={() => setDraft({ ...draft, countries: draft.countries.filter(c => c !== code) })}><X size={12}/></button></li>)}</ul>
      {draft.countries.length <= 1 && <p className="settings-hint">Keep at least one country.</p>}
      {available.length > 0 && <select aria-label="Add a country" value="" onChange={e => { if (e.target.value) setDraft({ ...draft, countries: [...draft.countries, e.target.value] }); }}><option value="">Add a country</option>{available.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select>}
    </div>
    <fieldset className="settings-field"><legend className="settings-label">Creators</legend>{regions.map(r => <label key={r.value} className="settings-radio"><input type="radio" name="creator-region" value={r.value} checked={draft.creatorRegion === r.value} onChange={() => setDraft({ ...draft, creatorRegion: r.value })}/><span><strong>{r.title}</strong><small>{r.hint}</small></span></label>)}</fieldset>
    <p className="settings-note">Detected from your browser's language and time zone. Saved in this browser.</p>
    <div className="settings-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary">Save</button></div>
  </form></dialog>;
}
export default function App() {
  const [view, setView] = useState<'home' | 'list' | 'search' | 'channels' | 'following'>('home');
  const [category, setCategory] = useState<Category>('All topics');
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Video | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const library = useLibrary();
  const preferences = usePreferences();
  const [editingInterests, setEditingInterests] = useState(false);
  const setupOpen = !preferences.completed || editingInterests;
  const homeTopics: Topic[] = category !== 'All topics' ? [category] : preferences.interests.length ? orderTopics(preferences.interests).filter(t => preferences.interests.includes(t)) : allTopics;
  const featured = useQuery(homeRowOptions('hot', homeTopics, !setupOpen && view === 'home'));
  const hero = featured.data?.[0];
  const main = useRef<HTMLElement>(null);
  useEffect(() => { if (!setupOpen) main.current?.focus(); }, [setupOpen]);
  if (setupOpen) return <Onboarding editing={preferences.completed} onDone={() => { setEditingInterests(false); setView('home'); setCategory('All topics'); }}/>;
  return <><a className="skip-link" href="#main">Skip to content</a><header><a className="logo" href="#" onClick={() => { setView('home'); setCategory('All topics'); }}>DEV<span>FLIX</span><i/></a><nav aria-label="Main navigation"><button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>For you</button><button className={view === 'channels' ? 'active' : ''} onClick={() => setView('channels')}>Channels</button><button className={view === 'following' ? 'active' : ''} onClick={() => setView('following')}>Following</button><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>My List <span className="list-count">{library.saved.length}</span></button></nav><form className="search" onSubmit={e => { e.preventDefault(); if (input.trim()) { setTerm(input.trim()); setView('search'); } }}><Search size={17}/><input aria-label="Search videos" placeholder="What do you want to learn?" value={input} onChange={e => setInput(e.target.value)}/><button type="submit" aria-label="Submit search"><ArrowUpRight size={16}/></button></form><button type="button" className="avatar profile-button" aria-label="Settings" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>D</button></header>
    <main id="main" ref={main} tabIndex={-1}>{view === 'home' ? <><section className="hero"><div className="hero-art" style={hero ? { backgroundImage: `url(${hero.thumbnail})` } : undefined}/><div className="hero-shade"/><div className="hero-content"><div className="feature-tag"><span/> THE DEVELOPER’S WATCHLIST</div><p className="hero-kicker">A little curiosity. A lot of possibility.</p><h1>Less scrolling.<br/>More <span>building.</span></h1><p className="hero-description">Big ideas from the people who build them.<br/>The best of tech, one free lesson at a time.</p>{hero ? <><div className="hero-actions"><button className="button primary" onClick={() => setSelected(hero)}><Play size={19} fill="currentColor"/> Start watching</button><SaveButton video={hero}/></div><div className="featured-info"><span>FEATURED LESSON</span><strong>{hero.title}</strong><p>{hero.channel} <span>•</span> Free on YouTube</p></div></> : featured.isError ? <ErrorBox message={featured.error.message} retry={() => void featured.refetch()}/> : <p role="status">Finding your next great lesson…</p>}</div><div className="hero-side-label"><Code2 size={16}/> NEVER STOP LEARNING</div></section>
    <div className="browse-content">{view === 'home' && <div className="personalized-heading"><div><p className="eyebrow">YOUR WATCHLIST STARTS HERE</p><h2>A little more you.</h2><p className="muted">{preferences.interests.length ? `Inspired by your interests: ${preferences.interests.join(' · ')}` : 'A starting collection for your next idea.'}</p></div><button className="button secondary" onClick={() => setEditingInterests(true)}>Edit interests</button></div>}<div className="browse-toolbar"><div className="topics" aria-label="Filter by topic">{categories.map(c => <button key={c} aria-pressed={category === c} className={category === c ? 'selected' : ''} onClick={() => setCategory(c)}>{c === 'All topics' && <Sparkles size={14}/>} {c}</button>)}</div><span className="free-label"><i/> Always free. Always curious.</span></div>{isDemo && <div className="demo-banner"><span><b>Preview mode</b> · Explore a sample collection. Connect YouTube to unlock the full catalog.</span><code>VITE_YT_API_KEY</code></div>}{library.watching.length > 0 && category === 'All topics' && <Rail title="Continue Watching" subtitle="Pick up where curiosity left off." action={<ClearWatching/>}><VideoRail videos={library.watching.map(p => p.video)} onOpen={setSelected}/></Rail>}{library.saved.length > 0 && category === 'All topics' && <Rail title="My List" subtitle="Good ideas for later."><VideoRail videos={library.saved} onOpen={setSelected}/></Rail>}{view === 'home' && <><FollowedSection onOpen={setSelected} onBrowse={() => setView('channels')}/>{homeRows.map(row => <HomeRow key={row.id} row={row} topics={homeTopics} onOpen={setSelected}/>)}</>}</div></> : view === 'channels' ? <ChannelsPage/> : view === 'following' ? <FollowingPage onOpen={setSelected} onBrowse={() => setView('channels')} Card={Card}/> : view === 'search' ? <SearchResults key={term} term={term} onOpen={setSelected}/> : <section className="results"><p className="eyebrow">YOUR PERSONAL COLLECTION</p><h1>My List<span className="heading-dot">.</span></h1><p className="muted">The next thing you’ll learn is waiting here.</p>{library.saved.length ? <div className="results-grid"><VideoRail videos={library.saved} onOpen={setSelected}/></div> : <div className="empty-library"><Bookmark size={32}/><h2>Make room for your next idea.</h2><p>Save a lesson with the My List button. Find it here whenever you’re ready.</p><button className="button primary" onClick={() => setView('home')}>Explore lessons <ArrowUpRight size={17}/></button></div>}</section>}</main><footer><a className="logo" href="#">DEV<span>FLIX</span><i/></a><p>Stay curious. Keep building.</p><span>Made for developers · Powered by YouTube</span></footer>{settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)}/>}{selected && <VideoModal key={selected.id} video={selected} onClose={() => setSelected(null)}/>}</>;
}
