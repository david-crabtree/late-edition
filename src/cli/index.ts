#!/usr/bin/env node
import { resolve } from 'node:path';
import { loadNewsroom } from '../main/config/newsroom.js';
import { scaffoldNewsroom } from '../main/config/scaffold.js';
import type { DistributionConfig } from '../main/config/types.js';
import { distributeEdition } from '../main/distribute/run.js';
import { runAssignment, runDueAssignments } from '../main/pipeline/assignment.js';
import { ClarificationNeededError } from '../main/pipeline/clarify.js';
import { runEdition } from '../main/pipeline/run.js';
import { detectAll, getProvider } from '../main/providers/registry.js';
import type { BillingMode } from '../main/providers/types.js';
import { assignmentStatus, readAssignmentState } from '../main/store/assignments.js';
import { PipelineHaltError, clearHalt, isHalted, setHalt } from '../main/store/halt.js';
import { searchMorgue } from '../main/store/morgue.js';
import { runWatchOnce } from '../main/watch/run.js';

const VERSION = '0.0.1';

const HELP = `Late Edition — a noir newsroom for your own AI agents.

Usage:
  late-edition <command> [options]

Commands:
  detect                 Probe which agent providers are installed & authenticated.
  init <dir>             Scaffold a new newsroom folder with sample config.
  run                    Run one edition through the pipeline (WIRE → PRESS).
  distribute <editionId> Send an already-printed edition to configured channels.
  watch                  Poll sources for tripwires; fire Late Extra bulletins.
  assignment <sub>       Standing assignments on a cadence: list | run <id> | tick.
  halt                   Stop all agent calls: idle the newsroom (--clear to resume).
  search <query>         Search the morgue (archive of past editions).
  help                   Show this help.
  version                Print the version.

Options:
  --newsroom <dir>       Newsroom root (dir containing newsroom/). Default: current dir.
  --provider <id>        Force a provider for every role (e.g. fake).
  --resume <editionId>   Resume an in-flight edition from its last completed stage.
  --brief "<topic>"      Brief the Chief: put this topic on the front page (seeds one
                         story and runs ASSIGN → PRESS; no sources needed).
  --cap <tokens>         Hard token budget for the edition; work is curtailed once hit.
  --research <n>         Researcher passes per story before reporters write (0 disables).
                         Default: 0 for source-backed beats, 1 for a --brief topic.
  --answer "<text>"      Answer a Chief's clarification question when resuming a brief.
  --no-clarify           Skip the clarity check; run a --brief topic even if it's vague.
  --distribute           After printing, send to configured channels (opt-in).
  --dry-run              With --distribute/distribute: preview sends without sending.
  --once                 With watch: poll a single time and exit.
  --interval <seconds>   With watch: poll every N seconds (default 300).
  -h, --help             Show help.

Examples:
  late-edition detect
  late-edition init ./my-newsroom
  late-edition run --newsroom ./my-newsroom --provider fake
  late-edition run --newsroom ./my-newsroom --provider fake --distribute --dry-run
  late-edition distribute 2026-09-09-001 --newsroom ./my-newsroom
  late-edition watch --once --newsroom ./my-newsroom --provider fake
`;

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'help', ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg === '-h') {
      flags.help = true;
    } else {
      positionals.push(arg);
    }
  }
  return { command, positionals, flags };
}

async function cmdDetect(): Promise<number> {
  const results = await detectAll();
  console.log('Staff available:\n');
  for (const [id, d] of results) {
    const status = d.installed
      ? d.authenticated
        ? 'ready'
        : 'installed (not authenticated)'
      : 'not installed';
    const version = d.version ? ` v${d.version}` : '';
    const bill =
      d.billing === 'subscription'
        ? ' · plan usage'
        : d.billing === 'api'
          ? ' · ⚠️ metered API spend'
          : d.billing === 'free'
            ? ' · free/local'
            : '';
    console.log(`  ${id.padEnd(12)} ${status}${version}${bill}`);
    if (d.detail) console.log(`  ${' '.repeat(12)} ${d.detail}`);
  }
  console.log('');
  return 0;
}

function cmdInit(positionals: string[]): number {
  const dir = resolve(positionals[0] ?? '.');
  scaffoldNewsroom(dir);
  console.log(`Scaffolded a newsroom at ${dir}\n`);
  console.log('Next:');
  console.log(`  late-edition run --newsroom ${positionals[0] ?? '.'} --provider fake`);
  console.log('\nThen edit newsroom/beats/*.yaml and newsroom/staff.yaml to make it yours.');
  return 0;
}

async function cmdRun(flags: Record<string, string | boolean>): Promise<number> {
  const root = resolve(typeof flags.newsroom === 'string' ? flags.newsroom : '.');
  const forceProvider = typeof flags.provider === 'string' ? flags.provider : undefined;
  const resumeId = typeof flags.resume === 'string' ? flags.resume : undefined;
  const brief = typeof flags.brief === 'string' ? flags.brief : undefined;
  const tokenCap = typeof flags.cap === 'string' ? Number(flags.cap) : undefined;
  const research = typeof flags.research === 'string' ? Number(flags.research) : undefined;
  const clarificationAnswer = typeof flags.answer === 'string' ? flags.answer : undefined;
  const clarify = flags['no-clarify'] === true ? false : undefined;
  const nr = typeof flags.newsroom === 'string' ? flags.newsroom : '.';

  if (isHalted(root)) {
    console.log(
      `Newsroom is halted — the stop switch is set, so no agent calls will run.\nClear it to resume:\n  late-edition halt --clear --newsroom ${nr}\n`,
    );
    return 0;
  }

  console.log(
    `Running an edition from ${root}${forceProvider ? ` (provider: ${forceProvider})` : ''}${
      brief ? `\n  Brief for the Chief: "${brief}"` : ''
    }${tokenCap ? `\n  Token cap: ${tokenCap}` : ''}${
      research !== undefined ? `\n  Research passes: ${research}` : ''
    }…\n`,
  );
  let result: Awaited<ReturnType<typeof runEdition>>;
  try {
    result = await runEdition({
      root,
      forceProvider,
      resumeId,
      brief,
      tokenCap,
      research,
      clarify,
      clarificationAnswer,
    });
  } catch (err) {
    if (err instanceof PipelineHaltError) {
      console.log(
        `\n⏸  Halted — the newsroom went idle mid-run. Work in progress is saved.\nClear the stop switch and resume when ready:\n  late-edition halt --clear --newsroom ${nr}\n${err.editionId ? `  late-edition run --resume ${err.editionId} --newsroom ${nr}\n` : ''}`,
      );
      return 0;
    }
    if (err instanceof ClarificationNeededError) {
      console.log('\n❓ The Chief needs clarification before running this brief:\n');
      err.questions.forEach((q, i) => console.log(`   ${i + 1}. ${q}`));
      console.log(
        `\nAnswer and resume:\n  late-edition run --resume ${err.editionId} --answer "your answer" --newsroom ${nr}\n(or re-run with --no-clarify to skip the check.)\n`,
      );
      return 0;
    }
    throw err;
  }

  const spent = result.edition.tokenUsage.reduce(
    (n, u) => n + (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
    0,
  );
  console.log(`Edition ${result.editionId} printed → ${result.editionDir}`);
  console.log(
    `  ${result.edition.stories.length} stories, ${result.edition.briefs.length} briefs, ${spent} tokens${
      tokenCap ? ` / ${tokenCap} cap` : ''
    }.`,
  );
  if (spent > 0) {
    const tok = new Map<string, number>();
    const cost = new Map<string, number>();
    let totalCost = 0;
    for (const u of result.edition.tokenUsage) {
      tok.set(u.role, (tok.get(u.role) ?? 0) + (u.inputTokens ?? 0) + (u.outputTokens ?? 0));
      cost.set(u.role, (cost.get(u.role) ?? 0) + (u.costUsd ?? 0));
      totalCost += u.costUsd ?? 0;
    }
    // Highest-usage role first — research usually dominates, which is the tuning signal.
    const roles = [...tok.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`  By role (tokens): ${roles.map(([r, t]) => `${r} ${t}`).join(' · ')}`);

    // How was this paid for? Warn hard on metered API; reassure on a subscription plan.
    const used = [...new Set(result.edition.tokenUsage.map((u) => u.provider))];
    const modes: BillingMode[] = await Promise.all(
      used.map(async (id) => (await getProvider(id)?.detect())?.billing ?? 'unknown'),
    );
    if (modes.includes('api')) {
      console.log(
        `  ⚠️  This run used a metered API key — REAL SPEND: $${totalCost.toFixed(2)}. Every run costs money.`,
      );
    } else if (modes.includes('subscription')) {
      const notional =
        totalCost > 0 ? ` (≈$${totalCost.toFixed(2)} at API rates — NOT charged)` : '';
      console.log(
        `  Plan usage: ${spent} tokens — counts toward your subscription's usage allowance, not billed${notional}.`,
      );
    } else {
      console.log(`  ${spent} tokens — local/offline, no cost.`);
    }
  }
  console.log(`  Reel for the animation → ${result.editionDir}/reel.json`);
  if (result.edition.weatherLine) console.log(`  Weather line: ${result.edition.weatherLine}`);
  if (result.warnings.length) {
    console.log(`\n  ${result.warnings.length} warning(s):`);
    for (const w of result.warnings) console.log(`   - ${w}`);
  }
  console.log('');

  // Distribution is opt-in: only when --distribute is passed or auto_send is configured.
  const newsroom = await loadNewsroom(root);
  const dist = newsroom.config.distribution;
  const wantDistribute = flags.distribute === true || dist?.autoSend === true;
  if (wantDistribute) {
    if (!dist || dist.channels.length === 0) {
      console.log('Distribution requested, but no channels are configured in config.yaml.\n');
    } else {
      await distribute(root, result.editionId, dist, flags['dry-run'] === true);
    }
  }
  return 0;
}

async function cmdDistribute(
  positionals: string[],
  flags: Record<string, string | boolean>,
): Promise<number> {
  const editionId = positionals[0];
  if (!editionId) {
    console.error('Usage: late-edition distribute <editionId> [--newsroom DIR] [--dry-run]');
    return 2;
  }
  const root = resolve(typeof flags.newsroom === 'string' ? flags.newsroom : '.');
  const newsroom = await loadNewsroom(root);
  const dist = newsroom.config.distribution;
  if (!dist || dist.channels.length === 0) {
    console.error('No distribution channels configured in config.yaml.');
    return 1;
  }
  await distribute(root, editionId, dist, flags['dry-run'] === true);
  return 0;
}

async function distribute(
  root: string,
  editionId: string,
  config: DistributionConfig,
  dryRun: boolean,
): Promise<void> {
  console.log(`Distributing ${editionId}${dryRun ? ' (dry run)' : ''}…\n`);
  const results = await distributeEdition({ root, editionId, config, dryRun });
  for (const r of results) {
    const mark = r.skipped ? '–' : r.ok ? '✓' : '✗';
    console.log(`  ${mark} ${r.channel}: ${r.detail}`);
  }
  console.log('');
}

function cmdHalt(positionals: string[], flags: Record<string, string | boolean>): number {
  const root = resolve(typeof flags.newsroom === 'string' ? flags.newsroom : '.');
  const nr = typeof flags.newsroom === 'string' ? flags.newsroom : '.';
  if (flags.clear === true) {
    clearHalt(root);
    console.log(
      `Stop switch cleared. Runs are allowed again.\n  late-edition run --newsroom ${nr}\n`,
    );
    return 0;
  }
  const reason = positionals.join(' ').trim() || undefined;
  setHalt(root, reason);
  console.log(
    `🛑 Newsroom halted. Any run in progress goes idle at its next checkpoint, and new runs\nare blocked — no agent calls will fire. State is saved and resumable.\nClear it with:\n  late-edition halt --clear --newsroom ${nr}\n`,
  );
  return 0;
}

async function cmdWatch(flags: Record<string, string | boolean>): Promise<number> {
  const root = resolve(typeof flags.newsroom === 'string' ? flags.newsroom : '.');
  const forceProvider = typeof flags.provider === 'string' ? flags.provider : undefined;
  const once = flags.once === true;
  const intervalSec =
    typeof flags.interval === 'string' && Number(flags.interval) > 0 ? Number(flags.interval) : 300;

  const poll = async () => {
    const r = await runWatchOnce({ root, forceProvider });
    if (r.extra) {
      console.log(
        `[${new Date().toLocaleTimeString()}] Late Extra ${r.extra.id} → ${r.extra.dir} ` +
          `(${r.extra.stories} story/ies, ${r.hits} hit(s) of ${r.polled} polled).`,
      );
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] ${r.polled} polled, no tripwires hit.`);
    }
  };

  await poll();
  if (once) return 0;
  console.log(`Watching every ${intervalSec}s. Ctrl+C to stop.`);
  setInterval(() => {
    poll().catch((err) =>
      console.error(`watch error: ${err instanceof Error ? err.message : err}`),
    );
  }, intervalSec * 1000);
  await new Promise<void>(() => {}); // run until interrupted
  return 0;
}

async function cmdAssignment(
  positionals: string[],
  flags: Record<string, string | boolean>,
): Promise<number> {
  const sub = positionals[0];
  const root = resolve(typeof flags.newsroom === 'string' ? flags.newsroom : '.');
  const nr = typeof flags.newsroom === 'string' ? flags.newsroom : '.';
  const forceProvider = typeof flags.provider === 'string' ? flags.provider : undefined;

  if (sub === 'list') {
    const newsroom = await loadNewsroom(root);
    if (newsroom.assignments.length === 0) {
      console.log('No assignments. Add one at newsroom/assignments/<id>.yaml.\n');
      return 0;
    }
    const now = new Date();
    console.log('Assignments:\n');
    for (const a of newsroom.assignments) {
      const s = assignmentStatus(a, readAssignmentState(root, a.id), now);
      const flag = s.due ? 'DUE' : s.auto ? 'auto' : 'manual';
      console.log(
        `  ${a.id.padEnd(16)} ${flag.padEnd(6)} cadence ${s.cadence}, last ${s.lastRun}, ${s.runs} run(s)`,
      );
      console.log(`  ${' '.repeat(16)} ${a.title}`);
    }
    console.log('');
    return 0;
  }

  if (sub === 'run') {
    const id = positionals[1];
    if (!id) {
      console.error('Usage: late-edition assignment run <id> [--newsroom DIR] [--provider ID]');
      return 2;
    }
    if (isHalted(root)) {
      console.log(
        `Newsroom is halted. Clear it first:\n  late-edition halt --clear --newsroom ${nr}\n`,
      );
      return 0;
    }
    try {
      console.log(`Running assignment "${id}"…\n`);
      const { assignment, result } = await runAssignment(root, id, { forceProvider });
      console.log(`Edition ${result.editionId} printed → ${result.editionDir}`);
      console.log(`  Assignment "${assignment.title}": ${result.edition.stories.length} stories.`);
      for (const s of result.edition.stories) console.log(`   • ${s.headline}`);
      if (result.warnings.length) console.log(`  ${result.warnings.length} warning(s).`);
      console.log('');
      return 0;
    } catch (err) {
      if (err instanceof PipelineHaltError) {
        console.log(
          '\n⏸  Halted mid-run. State saved; clear the switch and re-run the assignment.\n',
        );
        return 0;
      }
      throw err;
    }
  }

  if (sub === 'tick') {
    if (isHalted(root)) {
      console.log('Newsroom is halted; no assignments will run. Clear with `halt --clear`.\n');
      return 0;
    }
    console.log('Running assignments whose cadence is due…\n');
    const outcomes = await runDueAssignments(root, { forceProvider });
    if (outcomes.length === 0) {
      console.log('  Nothing due right now.\n');
      return 0;
    }
    for (const o of outcomes) {
      if (o.ran) console.log(`  ✓ ${o.id}: edition ${o.editionId} (${o.stories} stories)`);
      else console.log(`  ✗ ${o.id}: ${o.error}`);
    }
    console.log('');
    return 0;
  }

  console.error(
    'Usage: late-edition assignment <list|run <id>|tick> [--newsroom DIR] [--provider ID]',
  );
  return 2;
}

function cmdSearch(positionals: string[], flags: Record<string, string | boolean>): number {
  const query = positionals.join(' ').trim();
  if (!query) {
    console.error('Usage: late-edition search <query> [--newsroom DIR]');
    return 2;
  }
  const root = resolve(typeof flags.newsroom === 'string' ? flags.newsroom : '.');
  const hits = searchMorgue(root, query);
  if (hits.length === 0) {
    console.log(`No morgue matches for "${query}".`);
    return 0;
  }
  console.log(`Morgue — ${hits.length} match(es) for "${query}":\n`);
  for (const h of hits) {
    const tag = h.lateExtra ? 'EXTRA' : `No.${h.number}`;
    console.log(`  ${h.date} ${tag.padEnd(7)} ${h.headline}  [${h.editionId}]`);
  }
  console.log('');
  return 0;
}

async function main(): Promise<number> {
  const { command, positionals, flags } = parseArgs(process.argv.slice(2));

  if (flags.help || command === 'help') {
    console.log(HELP);
    return 0;
  }

  switch (command) {
    case 'version':
      console.log(VERSION);
      return 0;
    case 'detect':
      return cmdDetect();
    case 'init':
      return cmdInit(positionals);
    case 'run':
      return cmdRun(flags);
    case 'distribute':
      return cmdDistribute(positionals, flags);
    case 'watch':
      return cmdWatch(flags);
    case 'assignment':
      return cmdAssignment(positionals, flags);
    case 'halt':
      return cmdHalt(positionals, flags);
    case 'search':
      return cmdSearch(positionals, flags);
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
