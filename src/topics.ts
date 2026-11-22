import type { Topic } from './classify';
/** Live topic rows. Each is a YouTube search for the most-viewed recent videos, not a fixed playlist. */
export const topicFeeds: { topic: Topic; subtitle: string; query: string; keywords: string; maxAgeDays: number }[] = [
  { topic: 'AI & Agents', maxAgeDays: 45, keywords: 'AI agents', subtitle: 'What builders are watching about AI right now.', query: 'AI agents LLM tutorial for developers' },
  { topic: 'Frontend', maxAgeDays: 540, keywords: 'React frontend', subtitle: 'The latest in React and the modern web.', query: 'React frontend web development' },
  { topic: 'Backend', maxAgeDays: 1095, keywords: 'backend engineering', subtitle: 'APIs, databases and the code behind the screen.', query: 'backend engineering databases APIs' },
  { topic: 'System Design', maxAgeDays: 1825, keywords: 'system design', subtitle: 'Architecture explained, freshly posted.', query: 'system design software architecture' },
  { topic: 'DevOps', maxAgeDays: 730, keywords: 'DevOps', subtitle: 'Ship it: cloud, containers and delivery.', query: 'DevOps Kubernetes Docker cloud' },
];
/**
 * How old a video can be before it's considered outdated. AI tooling changes monthly; backend and
 * system design fundamentals stay true for years. Used by Deep dives and Quick explainers.
 */
export const maxAgeDays = (topic: Topic) => topicFeeds.find(f => f.topic === topic)?.maxAgeDays ?? 365;
/** Topics that go stale quickly get their own search window so old videos can't crowd them out. */
export const FAST_MOVING_DAYS = 90;
export const allTopics = topicFeeds.map(f => f.topic);
export function orderTopics(interests: Topic[]): Topic[] {
  return [...interests.filter(t => allTopics.includes(t)), ...allTopics.filter(t => !interests.includes(t))];
}
