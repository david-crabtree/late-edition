import { readFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { SourceConfig } from '../adapters/types.js';
import { paths } from '../store/paths.js';
import type {
  BeatConfig,
  DistChannelConfig,
  DistributionConfig,
  Newsroom,
  PaperConfig,
  RoleAssignment,
  StaffConfig,
  TripwireConfig,
} from './types.js';

/** Thrown when a newsroom on disk is missing or malformed, with a user-facing message. */
export class NewsroomConfigError extends Error {}

/** Load and validate a newsroom rooted at `root` (the dir containing `newsroom/`). */
export async function loadNewsroom(root: string): Promise<Newsroom> {
  const abs = resolve(root);
  const p = paths(abs);

  const config = readYamlFile<PaperConfig>(p.configFile, normalizePaper);
  const staff = readYamlFile<StaffConfig>(p.staffFile, normalizeStaff);
  const style = await readTextOr(p.styleFile, '');
  const beats = await loadBeats(p.beatsDir);
  const personas = await loadPersonas(p.personasDir);

  return { root: abs, config, staff, beats, style, personas };
}

function readYamlFile<T>(file: string, normalize: (raw: unknown, file: string) => T): T {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new NewsroomConfigError(
      `Missing config file: ${file}\nRun \`late-edition init <dir>\` to scaffold a newsroom.`,
    );
  }
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    throw new NewsroomConfigError(
      `Could not parse YAML in ${file}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return normalize(raw, file);
}

function asRecord(raw: unknown, file: string): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new NewsroomConfigError(`Expected a mapping at the top of ${file}.`);
  }
  return raw as Record<string, unknown>;
}

function normalizePaper(raw: unknown, file: string): PaperConfig {
  const r = asRecord(raw, file);
  const paper = asRecord(r.paper, file);
  if (typeof paper.name !== 'string' || paper.name.trim() === '') {
    throw new NewsroomConfigError(`\`paper.name\` is required in ${file}.`);
  }
  const schedule = r.schedule ? asRecord(r.schedule, file) : undefined;
  const edition = r.edition ? asRecord(r.edition, file) : undefined;
  return {
    paper: {
      name: paper.name,
      tagline: str(paper.tagline),
      timezone: str(paper.timezone) ?? 'local',
    },
    schedule: schedule ? { dailyAt: str(schedule.daily_at ?? schedule.dailyAt) } : undefined,
    edition: edition
      ? {
          maxPageOne: num(edition.max_page_one ?? edition.maxPageOne) ?? 3,
          urgencyThreshold: num(edition.urgency_threshold ?? edition.urgencyThreshold),
        }
      : { maxPageOne: 3 },
    distribution: normalizeDistribution(r.distribution, file),
  };
}

function normalizeDistribution(raw: unknown, file: string): DistributionConfig | undefined {
  if (raw === undefined || raw === null) return undefined;
  const r = asRecord(raw, file);
  const channelsRaw = Array.isArray(r.channels) ? r.channels : [];
  const channels: DistChannelConfig[] = channelsRaw.map((c, i) => {
    const cr = asRecord(c, file);
    if (typeof cr.type !== 'string') {
      throw new NewsroomConfigError(`distribution.channels[${i}] needs a \`type\` in ${file}.`);
    }
    return { ...cr, type: cr.type } as DistChannelConfig;
  });
  return { autoSend: Boolean(r.auto_send ?? r.autoSend ?? false), channels };
}

function role(raw: unknown, file: string, label: string): RoleAssignment {
  const r = asRecord(raw, file);
  if (typeof r.provider !== 'string') {
    throw new NewsroomConfigError(`\`${label}.provider\` must be a string in ${file}.`);
  }
  return { provider: r.provider, model: str(r.model) };
}

function normalizeStaff(raw: unknown, file: string): StaffConfig {
  const r = asRecord(raw, file);
  const researchersRaw = asRecord(r.researchers ?? {}, file);
  const reportersRaw = asRecord(r.reporters ?? {}, file);
  const writersRaw = asRecord(r.writers ?? {}, file);

  const reporters: StaffConfig['reporters'] = {
    default: role(reportersRaw.default ?? { provider: 'fake' }, file, 'reporters.default'),
  };
  for (const [k, v] of Object.entries(reportersRaw)) {
    if (k !== 'default') reporters[k] = role(v, file, `reporters.${k}`);
  }

  // Researchers fall back to the reporter assignment when a newsroom doesn't name them,
  // so an existing config keeps working and simply reports without a separate dig.
  const researchers: StaffConfig['researchers'] = {
    default: role(researchersRaw.default ?? reporters.default, file, 'researchers.default'),
  };
  for (const [k, v] of Object.entries(researchersRaw)) {
    if (k !== 'default') researchers[k] = role(v, file, `researchers.${k}`);
  }

  const writers: StaffConfig['writers'] = {
    default: role(writersRaw.default ?? { provider: 'fake' }, file, 'writers.default'),
  };
  for (const [k, v] of Object.entries(writersRaw)) {
    if (k !== 'default') writers[k] = role(v, file, `writers.${k}`);
  }

  return {
    managingEditor: role(
      r.managing_editor ?? r.managingEditor ?? { provider: 'fake' },
      file,
      'managing_editor',
    ),
    researchers,
    reporters,
    writers,
    copyDesk: role(r.copy_desk ?? r.copyDesk ?? { provider: 'fake' }, file, 'copy_desk'),
  };
}

async function loadBeats(dir: string): Promise<BeatConfig[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const beats: BeatConfig[] = [];
  for (const entry of entries.sort()) {
    if (!/\.ya?ml$/i.test(entry)) continue;
    const file = join(dir, entry);
    const raw = parseYaml(await readFile(file, 'utf8'));
    beats.push(normalizeBeat(raw, file, basename(entry).replace(/\.ya?ml$/i, '')));
  }
  return beats;
}

function normalizeBeat(raw: unknown, file: string, fallbackId: string): BeatConfig {
  const r = asRecord(raw, file);
  const id = str(r.id) ?? fallbackId;
  const name = str(r.name) ?? id;
  const sourcesRaw = r.sources;
  if (!Array.isArray(sourcesRaw)) {
    throw new NewsroomConfigError(`Beat ${file} must have a \`sources:\` list.`);
  }
  const sources: SourceConfig[] = sourcesRaw.map((s, i) => {
    const sr = asRecord(s, file);
    if (typeof sr.type !== 'string') {
      throw new NewsroomConfigError(`Source #${i + 1} in ${file} needs a \`type\`.`);
    }
    return { ...sr, id: str(sr.id) ?? `${id}-${i + 1}`, type: sr.type } as SourceConfig;
  });
  return {
    id,
    name,
    reporter: str(r.reporter),
    angles: num(r.angles) ?? 1,
    research: r.research === true ? 1 : (num(r.research) ?? 0),
    maxFindings: num(r.max_findings ?? r.maxFindings),
    mixProviders: Boolean(r.mix_providers ?? r.mixProviders ?? false),
    urgencyThreshold: num(r.urgency_threshold ?? r.urgencyThreshold),
    tripwires: normalizeTripwires(r.tripwires, file),
    sources,
  };
}

function normalizeTripwires(raw: unknown, file: string): TripwireConfig[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((t, i) => {
    const tr = asRecord(t, file);
    if (typeof tr.match !== 'string' || tr.match === '') {
      throw new NewsroomConfigError(`tripwires[${i}] in ${file} needs a \`match\` string.`);
    }
    return {
      match: tr.match,
      regex: Boolean(tr.regex),
      sources: Array.isArray(tr.sources) ? (tr.sources as string[]) : undefined,
      label: str(tr.label),
    };
  });
}

async function loadPersonas(dir: string): Promise<Map<string, string>> {
  const personas = new Map<string, string>();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return personas;
  }
  for (const entry of entries) {
    if (!/\.md$/i.test(entry)) continue;
    const text = await readFile(join(dir, entry), 'utf8');
    personas.set(basename(entry).replace(/\.md$/i, ''), text);
  }
  return personas;
}

async function readTextOr(file: string, fallback: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return fallback;
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
