import { channelTopics, curatedChannels, type ChannelTopic } from './channels';
export type Topic = Exclude<ChannelTopic, 'All topics'>;
export const classifiableTopics = channelTopics.filter((t): t is Topic => t !== 'All topics');
export interface ChannelProfile { id: string; title: string; description: string; keywords?: string }
export interface Classification { id: string; dev: boolean; topics: Topic[]; source: 'curated' | 'keywords' | 'uploads' | 'none' }
const rules: [Topic, RegExp][] = [
  ['AI & Agents', /\b(ai|a\.i\.|artificial intelligence|machine learning|deep learning|llms?|gpt|chatgpt|openai|anthropic|claude|langchain|prompt engineering|ai agents?|agentic|neural networks?|data science|computer vision|nlp)\b/i],
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
