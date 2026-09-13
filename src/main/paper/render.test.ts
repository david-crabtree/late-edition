import { describe, expect, it } from 'vitest';
import { OUTPUT_DISCLAIMER } from '../core/disclaimer.js';
import type { Edition, Story } from '../core/edition.js';
import { renderHtml, renderMarkdown } from './render.js';

function edition(story: Partial<Story>): Edition {
  const full: Story = {
    slug: 's',
    beatId: 'brief',
    beatName: 'The Newsdesk',
    headline: 'Headline',
    standfirst: 'Deck.',
    body: '',
    byline: 'A Reporter',
    placement: 'page_one',
    chosenAngle: '',
    rationale: '',
    sources: [],
    reports: [],
    ...story,
  };
  return {
    id: '2026-09-10-001',
    number: 1,
    date: '2026-09-10',
    paperName: 'The Daily Bit',
    stories: [full],
    briefs: [],
    editorsLog: [],
    corrections: [],
    tokenUsage: [],
    generatedAt: '2026-09-10T00:00:00Z',
  };
}

const SOURCES = [
  { signalId: 'research:aaaaaaaaaaaa', title: 'Primary source', url: 'https://example.com/a' },
  { signalId: 'research:bbbbbbbbbbbb', title: 'Second source', url: 'https://example.com/b' },
];

describe('citation rendering', () => {
  it('converts inline signal-id citations to numbered footnotes and lists sources', () => {
    const md = renderMarkdown(
      edition({
        body: 'A fact [research:aaaaaaaaaaaa]. Another, both [research:aaaaaaaaaaaa, research:bbbbbbbbbbbb].',
        sources: SOURCES,
      }),
    );
    expect(md).toContain('A fact [1].');
    expect(md).toContain('[1,2]');
    expect(md).not.toContain('research:aaaaaaaaaaaa'); // raw id never shown in prose
    expect(md).toContain('1. Primary source — https://example.com/a');
  });

  it('drops the brief instruction and unknown ids from the prose', () => {
    const md = renderMarkdown(
      edition({
        body: 'Editor said [brief:cccccccccccc] but the fact is real [research:aaaaaaaaaaaa].',
        sources: SOURCES, // note: brief: is NOT in sources
      }),
    );
    expect(md).not.toContain('brief:');
    expect(md).toContain('the fact is real [1].');
  });

  it('scrubs stray model-invented citation markers like [#3]', () => {
    const md = renderMarkdown(
      edition({
        body: 'A claim [#3][#4] and [ref] here [research:aaaaaaaaaaaa].',
        sources: SOURCES,
      }),
    );
    expect(md).not.toContain('[#3]');
    expect(md).not.toContain('[ref]');
    expect(md).toContain('[1]');
  });

  it('links a source only when its URL is one a browser should follow', () => {
    const html = renderHtml(
      edition({
        body: 'A [research:aaaaaaaaaaaa] and B [research:bbbbbbbbbbbb].',
        sources: [
          { signalId: 'research:aaaaaaaaaaaa', title: 'Fine', url: 'https://example.com/ok' },
          { signalId: 'research:bbbbbbbbbbbb', title: 'Hostile', url: 'javascript:alert(1)' },
        ],
      }),
    );
    expect(html).toContain('<a href="https://example.com/ok">Fine</a>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<li id="src-2">Hostile</li>');
  });

  it('HTML renders citations as superscript links to numbered sources', () => {
    const html = renderHtml(edition({ body: 'A fact [research:bbbbbbbbbbbb].', sources: SOURCES }));
    expect(html).toContain('<sup class="cite">');
    expect(html).toContain('href="#src-1"');
    expect(html).toContain('id="src-1"');
    expect(html).not.toContain('research:bbbbbbbbbbbb');
  });
  // The notice has to live in the artefact, not just the app window — an edition gets
  // copied, exported and posted somewhere else, and it must carry this with it.
  it('writes the AI-output disclaimer into both the Markdown and the HTML', () => {
    const ed = edition({ body: 'A claim [research:aaaaaaaaaaaa].', sources: SOURCES });
    expect(renderMarkdown(ed)).toContain(OUTPUT_DISCLAIMER);
    expect(renderHtml(ed)).toContain('About this edition.');
    expect(renderHtml(ed)).toContain('not journalism');
  });
});

/**
 * On a cached provider almost none of the traffic is fresh input. Counting only input and
 * output put a real edition at 15,170 tokens against a true 325,959, while the app's own
 * readout counted cache and showed the larger figure. Two numbers for one edition, twenty
 * times apart, both labelled "tok".
 */
describe('the token line', () => {
  const USAGE = [
    {
      provider: 'claude',
      role: 'reporter',
      inputTokens: 2,
      outputTokens: 2075,
      cacheReadTokens: 29338,
      cacheWriteTokens: 8050,
    },
    {
      provider: 'claude',
      role: 'writer',
      inputTokens: 2,
      outputTokens: 1679,
      cacheReadTokens: 29338,
      cacheWriteTokens: 10233,
    },
  ];

  const withUsage = () => ({ ...edition({ body: 'A line.' }), tokenUsage: USAGE });

  it('counts cache traffic, because the provider does', () => {
    // 4 fresh + 3,754 out + 58,676 read + 18,283 written.
    const total = 2 + 2075 + 2 + 1679 + 29338 + 8050 + 29338 + 10233;
    expect(total).toBe(80717);
    expect(renderMarkdown(withUsage())).toContain('claude: 80,717 tok');
  });

  // A read is roughly a tenth of a fresh token; a write is roughly a quarter more than
  // one. Printing them as a single "cached" figure hides the expensive half.
  it('names reads and writes separately', () => {
    const md = renderMarkdown(withUsage());
    expect(md).toContain('58,676 read from cache');
    expect(md).toContain('18,283 written to it');
  });

  it('says nothing about cache when a provider does not use it', () => {
    const ed = {
      ...edition({ body: 'A line.' }),
      tokenUsage: [{ provider: 'fake', role: 'writer', inputTokens: 10, outputTokens: 20 }],
    };
    const md = renderMarkdown(ed);
    expect(md).toContain('fake: 30 tok');
    expect(md).not.toMatch(/cache/i);
  });
});
