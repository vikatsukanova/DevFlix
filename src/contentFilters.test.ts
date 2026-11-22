import { describe, expect, it } from 'vitest';
import { isClickbait, isDevRelated, isOffTopic } from './classify';

describe('isOffTopic', () => {
  it('flags politics, news and games', () => {
    for (const t of ['GTA 6 trailer breakdown', 'Election night live', 'Trump on AI chips', 'AI news this week', 'Minecraft redstone computer', 'Grand Theft Auto VI leaks']) expect(isOffTopic(t)).toBe(true);
  });
  it('leaves dev titles alone', () => {
    for (const t of ['System design: news feed', 'Postgres internals', 'Build an AI agent with LangGraph']) expect(isOffTopic(t)).toBe(false);
  });
});

describe('isDevRelated', () => {
  it('needs a dev or AI topic', () => {
    expect(isDevRelated('Kubernetes networking explained')).toBe(true);
    expect(isDevRelated('Learn Python in one video')).toBe(true);
    expect(isDevRelated('My morning routine')).toBe(false);
  });
});

describe('isClickbait', () => {
  it('flags hype phrases, shouting and emoji walls', () => {
    for (const t of ['This AI tool is INSANE', 'Coding is DEAD and OVER', 'Claude Code 🤯🔥', 'Make $10k/month with AI agents', 'Web dev is dead']) expect(isClickbait(t)).toBe(true);
  });
  it('allows normal titles, acronyms and numbers', () => {
    for (const t of ['Make 5 apps with React', 'HTML and JSON basics', 'REST vs GraphQL', 'Build a RAG app 🚀']) expect(isClickbait(t)).toBe(false);
  });
});
