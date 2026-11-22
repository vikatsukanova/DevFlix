import { channelTopics, curatedChannels, type ChannelTopic } from './channels';
export type Topic = Exclude<ChannelTopic, 'All topics'>;
export const classifiableTopics = channelTopics.filter((t): t is Topic => t !== 'All topics');
export interface ChannelProfile { id: string; title: string; description: string; keywords?: string }
export interface Classification { id: string; dev: boolean; topics: Topic[]; source: 'curated' | 'keywords' | 'none' }
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
