import Onboarding from './Onboarding';
import { matchesInterests, usePreferences } from './preferences';
import { useFollowing } from './channelStore';
import { channelUploads, mergeFeed } from './channelApi';
import { ChannelsPage, FollowingPage } from './ChannelsPage';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Bookmark, Check, ChevronLeft, ChevronRight, Code2, Play, Plus, Search, Sparkles, X } from 'lucide-react';
import { categories, rows, type Category } from './rows';
import { demoVideos, isDemo, playlist, search, videoOptions, type Video } from './api';
import { queryKeys } from './queryKeys';
import { saveProgress, toggleSaved, useLibrary } from './storage';
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
function Card({ video, onOpen }: { video: Video; onOpen: (v: Video) => void }) {
  const client = useQueryClient();
  const progress = useLibrary().watching.find(p => p.video.id === video.id);
  const prefetch = () => { if (!isDemo) void client.prefetchQuery(videoOptions(video.id)); };
  return <button className="video-card" onMouseEnter={prefetch} onFocus={prefetch} onClick={() => onOpen(video)}>
    <div className="thumbnail"><img src={video.thumbnail} alt="" loading="lazy"/><span className="card-play"><Play fill="currentColor" size={22}/></span><span className="youtube-label">YouTube</span>{progress && <div className="progress"><i style={{ width: `${Math.min(100, progress.seconds / progress.duration * 100)}%` }}/></div>}</div>
    <h3>{video.title}</h3><p>{video.channel}<span> • Free lesson</span></p>
  </button>;
}
function Rail({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
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
  return <section className="row"><div className="row-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div className="rail-controls"><button aria-label={`Scroll ${title} left`} onClick={() => rail.current?.scrollBy({ left: -700, behavior: 'smooth' })}><ChevronLeft size={18}/></button><button aria-label={`Scroll ${title} right`} onClick={() => rail.current?.scrollBy({ left: 700, behavior: 'smooth' })}><ChevronRight size={18}/></button></div></div><div className="rail" ref={rail} onKeyDown={navigate}>{children}</div></section>;
}
function ErrorBox({ message, retry }: { message: string; retry: () => void }) { return <div className="error-box" role="alert"><p>{message}</p><button className="text-button" onClick={retry}>Try again ↗</button></div>; }
function PlaylistRow({ row, index, onOpen }: { row: typeof rows[number]; index: number; onOpen: (v: Video) => void }) {
  const { ref, visible } = useVisible();
  const query = useQuery({ queryKey: queryKeys.playlist(row.playlistId), queryFn: ({ signal }) => isDemo ? Promise.resolve([...demoVideos.slice(index), ...demoVideos.slice(0, index)]) : playlist(row.playlistId, signal), enabled: visible });
  return <div ref={ref}><Rail title={row.title} subtitle={row.subtitle}>{query.isError ? <ErrorBox message={query.error.message} retry={() => void query.refetch()}/> : !query.data ? Array.from({ length: 5 }, (_, i) => <div className="skeleton" key={i}><div/><i/><i/></div>) : query.data.length ? query.data.map(v => <Card key={v.id} video={v} onOpen={onOpen}/>) : <p className="empty">No public videos in this playlist yet.</p>}</Rail></div>;
}
function FollowingRail({ onOpen, onBrowse }: { onOpen: (v: Video) => void; onBrowse: () => void }) {
  const following = useFollowing();
  const { ref, visible } = useVisible();
  const feeds = useQueries({ queries: following.map(channel => ({ queryKey: queryKeys.channelUploads(channel.id), queryFn: ({ signal }: { signal: AbortSignal }) => channelUploads(channel, signal), enabled: visible && !isDemo })) });
  const videos = isDemo ? demoVideos.filter(v => following.some(c => c.title === v.channel)) : mergeFeed(feeds.map(f => f.data ?? []));
  return <div ref={ref}><Rail title="New from your channels" subtitle={isDemo ? 'A preview from the creators you picked.' : 'Your favorite creators, newest uploads first.'}>{!following.length ? <div className="home-empty"><p>Find the people you want to learn from.</p><button className="text-button" onClick={onBrowse}>Explore channels ↗</button></div> : <>{!isDemo && feeds.some(f => f.isPending) && <p role="status" className="muted">Loading your channels…</p>}{feeds.map((f, i) => f.isError ? <ErrorBox key={following[i].id} message={`${following[i].title}: ${f.error.message}`} retry={() => void f.refetch()}/> : null)}{videos.slice(0, 20).map(v => <Card key={v.id} video={v} onOpen={onOpen}/>)}{!videos.length && (isDemo || feeds.every(f => f.isSuccess)) && <p className="empty">{isDemo ? 'Your channels are saved. Connect YouTube to see their latest videos.' : 'No public videos available yet.'}</p>}</>}</Rail></div>;
}
function SearchResults({ term, onOpen }: { term: string; onOpen: (v: Video) => void }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const query = useInfiniteQuery({ queryKey: queryKeys.search(term), initialPageParam: '', queryFn: ({ pageParam, signal }) => isDemo ? Promise.resolve({ videos: demoVideos.filter(v => `${v.title} ${v.channel}`.toLowerCase().includes(term.toLowerCase())), nextPageToken: undefined }) : search(term, pageParam, signal), getNextPageParam: page => page.nextPageToken, enabled: !!term, maxPages: 10 });
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = query;
  useEffect(() => { const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage(); }); if (sentinel.current) observer.observe(sentinel.current); return () => observer.disconnect(); }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
  const videos = [...new Map(query.data?.pages.flatMap(p => p.videos).map(v => [v.id, v])).values()];
  return <section className="results"><p className="eyebrow">FOLLOW YOUR CURIOSITY</p><h1>Results for “{term}”</h1>{isDemo && <p className="muted">Preview results. Add your API key to search all of YouTube.</p>}{query.isError && !query.data ? <ErrorBox message={query.error.message} retry={() => void query.refetch()}/> : query.isPending ? <p role="status">Searching YouTube…</p> : <div className="results-grid">{videos.map(v => <Card video={v} key={v.id} onOpen={onOpen}/>)}</div>}{!query.isPending && !query.isError && !videos.length && <p className="empty">No videos found. Try another topic or creator.</p>}<div ref={sentinel}/>{isFetchingNextPage && <p role="status">Loading more lessons…</p>}{hasNextPage && <button className="button secondary" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{isFetchNextPageError ? 'Retry loading more' : 'Load more'}</button>}</section>;
}
function VideoModal({ video, onClose }: { video: Video; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const library = useLibrary();
  const start = useRef(Math.floor(library.watching.find(p => p.video.id === video.id)?.seconds ?? 0));
  const detail = useQuery({ ...videoOptions(video.id), enabled: !isDemo });
  const current = detail.data ?? video;
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
  return <dialog className="video-modal" ref={dialog} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="video-title"><div className="modal-inner"><button className="close-modal" aria-label="Close video" onClick={onClose}><X/></button>{detail.data?.embeddable === false ? <div className="empty">Embedding is disabled for this video. Open it on YouTube below.</div> : <iframe ref={frame} title={video.title} src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&enablejsapi=1&start=${start.current}&origin=${encodeURIComponent(window.location.origin)}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen/>}<div className="modal-copy"><p className="eyebrow">{current.channel}</p><h2 id="video-title">{current.title}</h2><div className="modal-actions"><SaveButton video={current}/><a className="text-button" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer">Watch on YouTube <ArrowUpRight size={16}/></a></div>{detail.isError && <ErrorBox message={detail.error.message} retry={() => void detail.refetch()}/>}<p className="description">{current.description}</p></div></div></dialog>;
}
export default function App() {
  const [view, setView] = useState<'home' | 'browse' | 'list' | 'search' | 'channels' | 'following'>('home');
  const [category, setCategory] = useState<Category>('All topics');
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Video | null>(null);
  const library = useLibrary();
  const preferences = usePreferences();
  const [editingInterests, setEditingInterests] = useState(false);
  const setupOpen = !preferences.completed || editingInterests;
  const homeRows = rows.filter(row => matchesInterests(row.category, preferences.interests));
  const featuredRow = view === 'home' ? homeRows[0] ?? rows[0] : rows[0];
  const featured = useQuery({ queryKey: queryKeys.playlist(featuredRow.playlistId), queryFn: ({ signal }) => isDemo ? Promise.resolve(demoVideos) : playlist(featuredRow.playlistId, signal), enabled: !setupOpen && (view === 'home' || view === 'browse') });
  const hero = featured.data?.[0];
  const main = useRef<HTMLElement>(null);
  useEffect(() => { if (!setupOpen) main.current?.focus(); }, [setupOpen]);
  if (setupOpen) return <Onboarding editing={preferences.completed} onDone={() => { setEditingInterests(false); setView('home'); setCategory('All topics'); }}/>;
  return <><a className="skip-link" href="#main">Skip to content</a><header><a className="logo" href="#" onClick={() => { setView('home'); setCategory('All topics'); }}>DEV<span>FLIX</span><i/></a><nav aria-label="Main navigation"><button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>For you</button><button className={view === 'browse' ? 'active' : ''} onClick={() => setView('browse')}>Discover</button><button className={view === 'channels' ? 'active' : ''} onClick={() => setView('channels')}>Channels</button><button className={view === 'following' ? 'active' : ''} onClick={() => setView('following')}>Following</button><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>My List <span className="list-count">{library.saved.length}</span></button></nav><form className="search" onSubmit={e => { e.preventDefault(); if (input.trim()) { setTerm(input.trim()); setView('search'); } }}><Search size={17}/><input aria-label="Search videos" placeholder="What do you want to learn?" value={input} onChange={e => setInput(e.target.value)}/><button type="submit" aria-label="Submit search"><ArrowUpRight size={16}/></button></form><div className="avatar" aria-label="Local learner profile">D</div></header>
    <main id="main" ref={main} tabIndex={-1}>{view === 'browse' || view === 'home' ? <><section className="hero"><div className="hero-art" style={hero ? { backgroundImage: `url(${hero.thumbnail})` } : undefined}/><div className="hero-shade"/><div className="hero-content"><div className="feature-tag"><span/> THE DEVELOPER’S WATCHLIST</div><p className="hero-kicker">A little curiosity. A lot of possibility.</p><h1>Less scrolling.<br/>More <span>building.</span></h1><p className="hero-description">Big ideas from the people who build them.<br/>The best of tech, one free lesson at a time.</p>{hero ? <><div className="hero-actions"><button className="button primary" onClick={() => setSelected(hero)}><Play size={19} fill="currentColor"/> Start watching</button><SaveButton video={hero}/></div><div className="featured-info"><span>FEATURED LESSON</span><strong>{hero.title}</strong><p>{hero.channel} <span>•</span> Free on YouTube</p></div></> : featured.isError ? <ErrorBox message={featured.error.message} retry={() => void featured.refetch()}/> : <p role="status">Finding your next great lesson…</p>}</div><div className="hero-side-label"><Code2 size={16}/> NEVER STOP LEARNING</div></section>
    <div className="browse-content">{view === 'home' && <div className="personalized-heading"><div><p className="eyebrow">YOUR WATCHLIST STARTS HERE</p><h2>A little more you.</h2><p className="muted">{preferences.interests.length ? `Inspired by your interests: ${preferences.interests.join(' · ')}` : 'A starting collection for your next idea.'}</p></div><button className="button secondary" onClick={() => setEditingInterests(true)}>Edit interests</button></div>}<div className="browse-toolbar"><div className="topics" aria-label="Filter by topic">{categories.map(c => <button key={c} aria-pressed={category === c} className={category === c ? 'selected' : ''} onClick={() => setCategory(c)}>{c === 'All topics' && <Sparkles size={14}/>} {c}</button>)}</div><span className="free-label"><i/> Always free. Always curious.</span></div>{isDemo && <div className="demo-banner"><span><b>Preview mode</b> · Explore a sample collection. Connect YouTube to unlock the full catalog.</span><code>VITE_YT_API_KEY</code></div>}{library.watching.length > 0 && category === 'All topics' && <Rail title="Continue Watching" subtitle="Pick up where curiosity left off.">{library.watching.map(p => <Card key={p.video.id} video={p.video} onOpen={setSelected}/>)}</Rail>}{library.saved.length > 0 && category === 'All topics' && <Rail title="My List" subtitle="Good ideas for later.">{library.saved.map(v => <Card key={v.id} video={v} onOpen={setSelected}/>)}</Rail>}{view === 'home' && category === 'All topics' && <FollowingRail onOpen={setSelected} onBrowse={() => setView('channels')}/>} {view === 'home' && <div className="row-heading"><h2>Explore your interests</h2><button className="text-button" onClick={() => setView('browse')}>Discover all topics ↗</button></div>}{(view === 'home' && category === 'All topics' ? homeRows : rows).map((row, index) => category === 'All topics' || category === row.category ? <PlaylistRow key={row.playlistId} row={row} index={index} onOpen={setSelected}/> : null)}</div></> : view === 'channels' ? <ChannelsPage/> : view === 'following' ? <FollowingPage onOpen={setSelected} onBrowse={() => setView('channels')} Card={Card}/> : view === 'search' ? <SearchResults key={term} term={term} onOpen={setSelected}/> : <section className="results"><p className="eyebrow">YOUR PERSONAL COLLECTION</p><h1>My List<span className="heading-dot">.</span></h1><p className="muted">The next thing you’ll learn is waiting here.</p>{library.saved.length ? <div className="results-grid">{library.saved.map(v => <Card key={v.id} video={v} onOpen={setSelected}/>)}</div> : <div className="empty-library"><Bookmark size={32}/><h2>Make room for your next idea.</h2><p>Save a lesson with the My List button. Find it here whenever you’re ready.</p><button className="button primary" onClick={() => setView('browse')}>Explore lessons <ArrowUpRight size={17}/></button></div>}</section>}</main><footer><a className="logo" href="#">DEV<span>FLIX</span><i/></a><p>Stay curious. Keep building.</p><span>Made for developers · Powered by YouTube</span></footer>{selected && <VideoModal key={selected.id} video={selected} onClose={() => setSelected(null)}/>}</>;
}
