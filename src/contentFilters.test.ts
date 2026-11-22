import { describe, expect, it } from 'vitest';
import { isClickbait, isDevRelated, isOffTopic } from './classify';
import { decodeEntities } from './api';

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

describe('AI commentary vs AI building', () => {
  const title = "US AI in China's robots. Why 50 could trigger extinction. Stephen Fry";
  it('rejects AI doom and geopolitics commentary', () => {
    expect(isOffTopic(title)).toBe(true);
    expect(isDevRelated(title)).toBe(false);
    expect(isDevRelated('Why AI will change everything')).toBe(false);
  });
  it('accepts AI videos about building', () => {
    for (const t of ['Build an AI agent with LangGraph', 'Claude Code workflow for big repos', 'RAG explained in 10 minutes', 'OpenAI API tutorial']) expect(isDevRelated(t)).toBe(true);
  });
  it('still accepts non-AI dev topics without a builder word', () => {
    expect(isDevRelated('Kubernetes networking')).toBe(true);
  });
});

describe('decodeEntities', () => {
  it('turns YouTube\'s HTML escapes back into characters', () => {
    expect(decodeEntities('US AI in China&#39;s robots')).toBe("US AI in China's robots");
    expect(decodeEntities('Tom &amp; Jerry &quot;quoted&quot; &lt;tag&gt; &#x1F680;')).toBe('Tom & Jerry "quoted" <tag> 🚀');
    expect(decodeEntities('&unknown; stays')).toBe('&unknown; stays');
  });
});
