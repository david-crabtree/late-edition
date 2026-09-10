import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../store/paths.js';

/**
 * Scaffold a fresh newsroom at `root`. Every desk starts unstaffed: a run stops and names
 * the empty desk rather than filling the paper with invented copy. The written comments show
 * how to wire each desk to a real provider, and `--provider fake` gives a zero-token dry run.
 */
export function scaffoldNewsroom(root: string): void {
  const p = paths(root);
  mkdirSync(p.newsroom, { recursive: true });
  mkdirSync(p.beatsDir, { recursive: true });
  mkdirSync(p.assignmentsDir, { recursive: true });
  mkdirSync(p.personasDir, { recursive: true });
  mkdirSync(join(p.newsroom, 'prompts'), { recursive: true });

  writeFileSync(p.configFile, CONFIG_YAML);
  writeFileSync(p.staffFile, STAFF_YAML);
  writeFileSync(p.styleFile, STYLE_MD);
  writeFileSync(join(p.beatsDir, 'the-wire.yaml'), BEAT_WIRE);
  writeFileSync(join(p.beatsDir, 'the-codebase.yaml'), BEAT_CODEBASE);
  writeFileSync(join(p.assignmentsDir, 'competitor-watch.yaml'), ASSIGNMENT_SAMPLE);
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

# How an approved edition reaches your team. Distribution is opt-in: run with
# --distribute (or set auto_send: true). Secrets stay OUT of this file — each channel
# names an environment variable that holds its webhook URL.
distribution:
  auto_send: false
  channels:
    # - type: slack
    #   webhook_env: SLACK_WEBHOOK_URL
    # - type: teams
    #   webhook_env: TEAMS_WEBHOOK_URL
    # - type: webhook
    #   url_env: LATE_EDITION_WEBHOOK_URL
    # - type: rss
    #   base_url: "https://your-host.example/editions"   # optional; omit for local file links
`;

const STAFF_YAML = `# Which provider (and model) runs each desk. Desks start \`unset\`: a desk with no agent
# stops the edition and says so, rather than quietly filling the paper with invented copy.
# Set each one to a provider that \`late-edition detect\` shows as ready.
#
# For a no-tokens dry run of the whole pipeline, pass \`--provider fake\` instead of wiring
# the offline stand-in into a desk. Its output is invented and labelled as such.
#
# COST: research is by far the most expensive tier (it browses the web), and the managing
# editor sets the whole paper's judgement — so the cheap-but-effective recipe is to tier the
# models: a strong model for the editor, mid for reporters/writers, and a CHEAP model for the
# token-hungry researcher and the strict-but-mechanical copy desk. Configure the models here
# and run WITHOUT \`--provider\` (that flag forces one provider AND drops per-desk models).
#
# Ready-to-use single-subscription example (uncomment, needs \`claude\` ready):
#   managing_editor: { provider: claude, model: opus }
#   researchers: { default: { provider: claude, model: haiku } }
#   reporters:   { default: { provider: claude, model: sonnet } }
#   writers:     { default: { provider: claude, model: sonnet } }
#   copy_desk:   { provider: claude, model: haiku }

managing_editor: { provider: unset }  # your strongest model — this desk makes the call

# The desk that gathers sourced intel before reporters write. Point it at a web-capable agent
# so it can actually browse; keep it on a CHEAP model — this is the token-hungry tier. Falls
# back to your reporter if omitted. On per beat with \`research: 1\`; a \`--brief\` topic digs
# by default. Bound the dig with \`max_findings\` on a beat (default 6).
researchers:
  default: { provider: unset }        # e.g. { provider: claude, model: haiku }

reporters:
  default: { provider: unset }        # mid model; e.g. { provider: claude, model: sonnet }

writers:
  default: { provider: unset }        # mid model; e.g. { provider: claude, model: sonnet }

copy_desk: { provider: unset }        # cheap + strict; e.g. { provider: claude, model: haiku }

# The picture desk writes a shot list, caption and alt text - no image is made. It only runs
# when you switch it on. Leave it unset and it borrows the writers' desk.
photo_desk: { provider: unset }       # cheap; e.g. { provider: claude, model: haiku }
`;

const ASSIGNMENT_SAMPLE = `# A standing assignment: an ongoing topic the newsroom works on a cadence, building on its
# own past coverage each run. Run it by hand ("run the story") or let a scheduler run the
# due ones:
#   late-edition assignment run competitor-watch --newsroom .
#   late-edition assignment list --newsroom .
#   late-edition assignment tick --newsroom .     # runs the ones whose cadence is due (for cron)

id: competitor-watch
title: "Competitor watch"

# The standing brief the desk works each run. Each run is seeded with the prior editions of
# this assignment, so the desk advances the story ("what's new / changed") instead of repeating.
brief: "New competitor product launches, pricing moves and announcements in our market over the past week."

# How often it may run automatically: manual (default — only \`assignment run\`), or a duration
# like 6h, 1d, 1w (also hourly/daily/weekly). \`assignment tick\` runs the ones that are due.
cadence: manual

research: 1        # researcher passes per run
# max_findings: 6 # cap sourced findings per run (bounds cost)
# provider: claude # force one provider for this assignment's runs
`;

const STYLE_MD = `# House style — "Noir"

A 1940s wire desk. Terse, dry, unimpressed. This is the paper's voice — edit it, or
replace it entirely, and every desk writes to whatever you put here.

**The voice.** Short sentences that land. Concrete nouns and real figures over abstractions:
"a $400 certificate", not "a premium option". Verbs do the work; adjectives are suspects.
No hype, no marketing register, no exclamation marks, no rhetorical questions.

**The judgement.** Lead with what changed and who it hits. Put two facts next to each other
and let the reader draw the line — don't explain the significance, demonstrate it. One dry
line per piece is allowed if the material earns it. Nought is better than a forced one.

**The discipline.** Attribute every fact. Say plainly where the evidence stops. When in
doubt, cut it — a short piece that stands up beats a long one that doesn't.

**The hard rule.** Never let voice bend a fact. If it isn't in the sources, it didn't
happen, however good the sentence would have been.
`;

const BEAT_WIRE = `id: the_wire
name: "The Wire"
reporter: "Sam Vance"
angles: 1
# Between editions, \`late-edition watch\` polls these sources and fires a one-story
# "Late Extra" bulletin the moment a signal trips one of these tripwires.
tripwires:
  - match: "security"      # case-insensitive keyword; add \`regex: true\` for a pattern
    label: "Security"
  - match: "outage|breach|incident"
    regex: true
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
