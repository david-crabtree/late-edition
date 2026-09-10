import { describe, expect, it } from 'vitest';
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

  it('HTML renders citations as superscript links to numbered sources', () => {
    const html = renderHtml(edition({ body: 'A fact [research:bbbbbbbbbbbb].', sources: SOURCES }));
    expect(html).toContain('<sup class="cite">');
    expect(html).toContain('href="#src-1"');
    expect(html).toContain('id="src-1"');
    expect(html).not.toContain('research:bbbbbbbbbbbb');
  });
});
