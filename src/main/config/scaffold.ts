import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../store/paths.js';

/**
 * Scaffold a fresh newsroom at `root`. Defaults every role to the `fake` provider so
 * `late-edition run` works out of the box with zero tokens and zero CLIs; comments
 * show how to switch desks to real providers.
 */
export function scaffoldNewsroom(root: string): void {
  const p = paths(root);
  mkdirSync(p.newsroom, { recursive: true });
  mkdirSync(p.beatsDir, { recursive: true });
  mkdirSync(p.personasDir, { recursive: true });
  mkdirSync(join(p.newsroom, 'prompts'), { recursive: true });

  writeFileSync(p.configFile, CONFIG_YAML);
  writeFileSync(p.staffFile, STAFF_YAML);
  writeFileSync(p.styleFile, STYLE_MD);
  writeFileSync(join(p.beatsDir, 'the-wire.yaml'), BEAT_WIRE);
  writeFileSync(join(p.beatsDir, 'the-codebase.yaml'), BEAT_CODEBASE);
  writeFileSync(join(p.personasDir, 'sam-vance.md'), PERSONA_SAM);

  // We deliberately do NOT pre-copy the prompt templates: a newsroom tracks the
  // latest built-in prompts automatically. Drop a <name>.md here only to override one.
  writeFileSync(join(p.newsroom, 'prompts', 'README.md'), PROMPTS_README);
}

const PROMPTS_README = `# Prompt overrides

Late Edition ships built-in prompt templates for each role (reporter, editor, writer,
copydesk, frontpage). This newsroom uses them automatically — you don't need copies here.

To customise one, create a file named after the role and it will override the built-in:

    newsroom/prompts/reporter.md
    newsroom/prompts/editor.md
    newsroom/prompts/writer.md
    newsroom/prompts/copydesk.md
    newsroom/prompts/frontpage.md

Templates use \`{{placeholders}}\` such as {{style}}, {{persona}}, {{beatName}} and
{{angleDirective}}. See the built-in defaults in the source
(src/main/pipeline/prompts.ts) for the full list and shape.
`;

const CONFIG_YAML = `paper:
  name: "The Daily Bit"
  tagline: "All the code that's fit to print"
  timezone: local

schedule:
  daily_at: "07:00"   # scheduling arrives in a later milestone

edition:
  max_page_one: 3
`;

const STAFF_YAML = `# Which provider runs each desk. Everything defaults to the offline \`fake\` provider
# so a fresh newsroom runs with no tokens and no CLIs. Switch a desk to a real
# provider once \`late-edition detect\` shows it as ready, e.g. { provider: claude }.

managing_editor: { provider: fake }   # ideally your strongest model, e.g. claude

reporters:
  default: { provider: fake }         # cheaper models; e.g. { provider: codex }
  # the_codebase: { provider: claude }

writers:
  default: { provider: fake }         # e.g. { provider: claude }

copy_desk: { provider: fake }         # cheap + strict; e.g. { provider: ollama, model: llama3.2 }
`;

const STYLE_MD = `# House style — "Noir"

Terse, wry, 1940s wire-service voice. Short sentences. Concrete nouns. No hype, no
marketing adjectives, no exclamation marks. Lead with what changed and who it hits.
Attribute every fact. When in doubt, cut it.

Never let voice bend a fact. If it isn't in the sources, it didn't happen.
`;

const BEAT_WIRE = `id: the_wire
name: "The Wire"
reporter: "Sam Vance"
angles: 1
sources:
  - id: hn_frontpage
    type: rss
    url: "https://hnrss.org/frontpage"
    max: 15
`;

const BEAT_CODEBASE = `id: the_codebase
name: "The Codebase"
reporter: "Sam Vance"
# Commission two independent angles on each story. When they disagree, the paper runs
# a "Competing Takes" box instead of quietly picking one. Set mix_providers: true (and
# configure two real providers in staff.yaml) to have different models file the angles.
angles: 2
mix_providers: false
sources:
  # Point this at any local git repo. Defaults to the current directory.
  - id: this_repo
    type: git_local
    path: "."
    max: 20
`;

const PERSONA_SAM = `# Sam Vance

**Beat:** The Wire, The Codebase
**Voice:** Dry, unimpressed, allergic to hype. Has seen every "revolutionary" release
before and files it straight.
**Bio:** Twenty years on the technology desk. Keeps a red pencil behind one ear and a
grudge against unverified claims.

Persona affects voice only — never the facts.
`;
