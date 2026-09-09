#!/usr/bin/env node
import { detectAll } from '../main/providers/registry.js';

const VERSION = '0.0.1';

const HELP = `Late Edition — a noir newsroom for your own AI agents.

Usage:
  late-edition <command> [options]

Commands:
  detect                 Probe which agent providers are installed & authenticated.
  init <dir>             Scaffold a new newsroom folder with sample config. [M1]
  run [--newsroom DIR]   Run one edition through the pipeline. [M1]
  help                   Show this help.
  version                Print the version.

Options:
  --newsroom <dir>       Path to a newsroom folder (default: ./newsroom).
  --provider <id>        Force a provider for every role (e.g. fake).
  -h, --help             Show help.

Examples:
  late-edition detect
  late-edition init ./my-newsroom
  late-edition run --newsroom ./my-newsroom --provider fake
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

function notYet(command: string): number {
  console.error(
    `\`${command}\` is not implemented in this build (arrives in Milestone 1).
Run \`late-edition detect\` to see available providers.`,
  );
  return 2;
}

async function main(): Promise<number> {
  const { command, flags } = parseArgs(process.argv.slice(2));

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
      return notYet('init');
    case 'run':
      return notYet('run');
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });
