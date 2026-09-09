#!/usr/bin/env node
import { resolve } from 'node:path';
import { loadNewsroom } from '../main/config/newsroom.js';
import { scaffoldNewsroom } from '../main/config/scaffold.js';
import type { DistributionConfig } from '../main/config/types.js';
import { distributeEdition } from '../main/distribute/run.js';
import { runEdition } from '../main/pipeline/run.js';
import { detectAll } from '../main/providers/registry.js';
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
  help                   Show this help.
  version                Print the version.

Options:
  --newsroom <dir>       Newsroom root (dir containing newsroom/). Default: current dir.
  --provider <id>        Force a provider for every role (e.g. fake).
  --resume <editionId>   Resume an in-flight edition from its last completed stage.
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
    console.log(`  ${id.padEnd(12)} ${status}${version}`);
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

  console.log(
    `Running an edition from ${root}${forceProvider ? ` (provider: ${forceProvider})` : ''}…\n`,
  );
  const result = await runEdition({ root, forceProvider, resumeId });

  console.log(`Edition ${result.editionId} printed → ${result.editionDir}`);
  console.log(
    `  ${result.edition.stories.length} stories, ${result.edition.briefs.length} briefs.`,
  );
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
