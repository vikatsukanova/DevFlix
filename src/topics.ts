import type { Topic } from './classify';
/** Live topic rows. Each is a YouTube search for the most-viewed recent videos, not a fixed playlist. */
export const topicFeeds: { topic: Topic; subtitle: string; query: string; keywords: string }[] = [
  { topic: 'AI & Agents', keywords: 'AI agents', subtitle: 'What builders are watching about AI right now.', query: 'AI agents LLM tutorial for developers' },
  { topic: 'Frontend', keywords: 'React frontend', subtitle: 'The latest in React and the modern web.', query: 'React frontend web development' },
  { topic: 'Backend', keywords: 'backend engineering', subtitle: 'APIs, databases and the code behind the screen.', query: 'backend engineering databases APIs' },
  { topic: 'System Design', keywords: 'system design', subtitle: 'Architecture explained, freshly posted.', query: 'system design software architecture' },
  { topic: 'DevOps', keywords: 'DevOps', subtitle: 'Ship it: cloud, containers and delivery.', query: 'DevOps Kubernetes Docker cloud' },
];
export const allTopics = topicFeeds.map(f => f.topic);
export function orderTopics(interests: Topic[]): Topic[] {
  return [...interests.filter(t => allTopics.includes(t)), ...allTopics.filter(t => !interests.includes(t))];
}
