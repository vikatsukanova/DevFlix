import { channelTopics, curatedChannels, type ChannelTopic } from './channels';
export type Topic = Exclude<ChannelTopic, 'All topics'>;
export const classifiableTopics = channelTopics.filter((t): t is Topic => t !== 'All topics');
export interface ChannelProfile { id: string; title: string; description: string; keywords?: string }
export interface Classification { id: string; dev: boolean; topics: Topic[]; source: 'curated' | 'keywords' | 'uploads' | 'none' }
const rules: [Topic, RegExp][] = [
  ['AI & Agents', /\b(ai|a\.i\.|genai|artificial intelligence|machine learning|deep learning|llms?|gpt[-\d.o]*|chatgpt|openai|anthropic|claude|gemini|llama|mistral|ollama|copilot|cursor (ai|ide|editor)|windsurf|codex|langchain|langgraph|llamaindex|crewai|autogen|n8n|hugging ?face|mcp|rag|embeddings?|vector (databases?|db)|fine[- ]?tun(e|ing)|prompt engineering|prompts?|agents?|agentic|vibe[- ]?coding|neural networks?|transformers?|diffusion|data science|computer vision|nlp)\b/i],
  ['Frontend', /\b(react|javascript|typescript|frontend|front-end|css|html|next\.?js|vue|svelte|angular|tailwind|web dev(elopment)?)\b/i],
  ['Backend', /\b(backend|back-end|node\.?js|databases?|sql|postgres(ql)?|golang|django|spring boot|rest apis?|distributed systems)\b/i],
  ['System Design', /\b(system design|software architecture|scalability|microservices|distributed systems)\b/i],
  ['DevOps', /\b(devops|kubernetes|k8s|docker|terraform|ci\/cd|aws|azure|gcp|cloud engineering|sre)\b/i],
];
const generalDev = /\b(programming|coding|software engineer(ing)?|developers?|computer science|leetcode|open source|python|rust lang|c\+\+|full[- ]stack)\b/i;
/** Keyword guess from title, description and channel keywords. The learner reviews every result, so misses and false hits are recoverable. */
export function classifyByKeywords(channel: ChannelProfile): Classification {
  const curated = curatedChannels.find(c => c.id === channel.id);
  if (curated) return { id: channel.id, dev: true, topics: curated.topics.filter((t): t is Topic => t !== 'All topics'), source: 'curated' };
  const text = `${channel.title}\n${channel.description}\n${channel.keywords ?? ''}`;
  const topics = rules.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
  const dev = topics.length > 0 || generalDev.test(text);
  return { id: channel.id, dev, topics, source: dev ? 'keywords' : 'none' };
}
/** Topics whose keywords appear in a video's title or description. */
export function topicsForText(text: string): Topic[] {
  return rules.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
}
/** Second pass for channels whose profile says little: judge them by what they actually upload. */
export function classifyByTitles(id: string, titles: string[]): Classification {
  if (!titles.length) return { id, dev: false, topics: [], source: 'none' };
  const hits = titles.filter(t => topicsForText(t).length > 0 || generalDev.test(t)).length;
  const counts = new Map<Topic, number>();
  for (const title of titles) for (const topic of topicsForText(title)) counts.set(topic, (counts.get(topic) ?? 0) + 1);
  const dev = hits >= Math.max(2, Math.ceil(titles.length * 0.3));
  return { id, dev, topics: dev ? [...counts].filter(([, n]) => n >= 2).map(([t]) => t) : [], source: dev ? 'uploads' : 'none' };
}
/** True when a title or description is about software development or AI. */
export function isDevRelated(text: string): boolean {
  return topicsForText(text).length > 0 || generalDev.test(text);
}
/** Politics, news, games and entertainment that slip in through broad searches (e.g. "AI" in a GTA 6 video). */
const offTopic = /\b(news(?! ?feeds?)|breaking news|politics?|political|election|elections|president|congress|senate|parliament|democrats?|republicans?|trump|biden|tariffs?|war|ukraine|russia|israel|gaza|iran|gta ?(vi|v|6|5)?|grand theft auto|fortnite|minecraft|roblox|call of duty|valorant|playstation|ps5|xbox|nintendo|gameplay|walkthrough|let'?s play|trailer|movie|box office|celebrity|nfl|nba|world cup)\b/i;
export function isOffTopic(title: string): boolean {
  return offTopic.test(title);
}
/** Hype-style titles: money promises, "is dead", shock words, shouting or emoji walls. */
const clickbaitWords = /\b(you won'?t believe|shocking|insane|is (dead|over)|destroyed|exposed|gone wrong|100% free|for free forever|passive income|get rich|make \$\d+k?|\$\d+k?\s*\/\s*(day|month|week)|secret (trick|hack)|nobody (is talking|tells you))\b/i;
export function isClickbait(title: string): boolean {
  const shouting = (title.match(/\b[A-Z]{4,}\b/g) ?? []).filter(w => !/^(HTML|JSON|REST|HTTP|AWS|GCP|SQL|LLMS?|CRUD|OAUTH|NGINX)$/.test(w)).length;
  const emoji = (title.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  return clickbaitWords.test(title) || shouting >= 2 || emoji >= 2;
}
