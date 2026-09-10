import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';
// The engine — the same library the CLI uses, called in-process.
import { loadNewsroom } from '../main/config/newsroom.js';
import { scaffoldNewsroom } from '../main/config/scaffold.js';
import {
  API_BILLING_NOTICE,
  FIRST_RUN_NOTICE,
  OUTPUT_DISCLAIMER_SHORT,
  PLAN_BILLING_NOTICE,
} from '../main/core/disclaimer.js';
import type { Edition } from '../main/core/edition.js';
import { type CopyShape, FORMATS, LENGTHS, TONES } from '../main/core/formats.js';
import { ClarificationNeededError } from '../main/pipeline/clarify.js';
import { sumUsage } from '../main/pipeline/draft.js';
import { rewriteStory } from '../main/pipeline/rewrite.js';
import { runEdition } from '../main/pipeline/run.js';
import { VerificationNeededError } from '../main/pipeline/verify.js';
import { detectAll, listProviders } from '../main/providers/registry.js';
import { type EditionSummary, listEditions } from '../main/store/edition-store.js';
import { clearHalt, isHalted, setHalt } from '../main/store/halt.js';
import type { LogEvent } from '../main/store/log.js';
import { paths } from '../main/store/paths.js';

const here = dirname(fileURLToPath(import.meta.url));
/**
 * The newsroom UI is the code-drawn prototype page; the preload turns on "real mode".
 *
 * Running from source that page sits two levels up in `docs/`. In a packaged build the app
 * is inside `app.asar`, so the same relative path only resolves because `docs/prototype/**`
 * is in the builder's `files` list. Both candidates are checked and a missing page fails
 * loudly here rather than opening an empty window with no error.
 */
const RENDERER_CANDIDATES = [
  join(here, '../../docs/prototype/newsroom-screen-test.html'),
  join(process.resourcesPath ?? '', 'app.asar/docs/prototype/newsroom-screen-test.html'),
];
const RENDERER = RENDERER_CANDIDATES.find((p) => existsSync(p)) ?? RENDERER_CANDIDATES[0] ?? '';
// Prefer the built copy (dist/electron/preload.cjs), fall back to source — so a missed
// postbuild copy can never silently drop the bridge and boot into sim mode.
const PRELOAD = existsSync(join(here, 'preload.cjs'))
  ? join(here, 'preload.cjs')
  : join(here, '../../src/electron/preload.cjs');

// ---- Where the newsroom lives (config, staff, editions + history) ----------
// The user can point this at any folder from the Setup panel; the choice is persisted.
function appConfigPath(): string {
  return join(app.getPath('userData'), 'le-config.json');
}
interface AppConfig {
  root?: string;
  /** Version of the first-run notice the user has read. Bump NOTICE_VERSION to re-show it. */
  noticeAccepted?: number;
}
const NOTICE_VERSION = 1;
function readAppConfig(): AppConfig {
  try {
    return JSON.parse(readFileSync(appConfigPath(), 'utf8')) as AppConfig;
  } catch {
    return {};
  }
}
function writeAppConfig(c: AppConfig): void {
  writeFileSync(appConfigPath(), JSON.stringify(c, null, 2), 'utf8');
}
/** Ensure a newsroom exists at `root` (scaffold on first use) and return it. */
function ensureNewsroom(root: string): string {
  if (!existsSync(join(root, 'newsroom', 'config.yaml'))) {
    mkdirSync(root, { recursive: true });
    scaffoldNewsroom(root);
  }
  return root;
}
/** The active newsroom folder — the user's chosen one, or a default under userData. */
function newsroomRoot(): string {
  // A diagnostic run files real editions, so by default it gets its own throwaway newsroom
  // and the offline stand-in: it must never write into — or bill against — the user's own.
  // `LE_DEBUG_RUN=real` is the deliberate opt-out, for checking a real setup end to end.
  if (process.env.LE_DEBUG_RUN && process.env.LE_DEBUG_RUN !== 'real') {
    return ensureNewsroom(join(tmpdir(), 'late-edition-debug-newsroom'));
  }
  const chosen = readAppConfig().root;
  return ensureNewsroom(chosen || join(app.getPath('userData'), 'newsroom'));
}

let win: BrowserWindow | null = null;
function createWindow(): void {
  win = new BrowserWindow({
    // Sized to the content, not the frame, so the newsroom stage lands at the proportions
    // David tuned the art to. The window chrome is added on top by the OS.
    useContentSize: true,
    width: 1010,
    height: 775,
    minWidth: 820,
    minHeight: 600,
    backgroundColor: '#0a0d12',
    title: 'Late Edition',
    webPreferences: {
      preload: PRELOAD, // CommonJS preload — Electron loads it reliably
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });
  if (!existsSync(RENDERER)) {
    // Nothing useful can happen without the page, and a blank window tells the user nothing.
    dialog.showErrorBox(
      'Late Edition could not start',
      `The newsroom page is missing from this build.\n\nLooked in:\n${RENDERER_CANDIDATES.join('\n')}`,
    );
    app.quit();
    return;
  }
  win.loadFile(RENDERER);
  // Diagnostic: `LE_DEBUG=1 npm run electron` checks the preload bridge + a real IPC round-trip,
  // then quits — a headless way to confirm "real mode" is wired without a visible window.
  win.webContents.once('did-finish-load', async () => {
    if (!process.env.LE_DEBUG || !win) return;
    const wc = win.webContents;
    const js = (src: string) => wc.executeJavaScript(src);
    try {
      console.log(
        'LE_DEBUG bridge:',
        await js(
          "typeof window.lateEdition + ' | realMode=' + document.body.classList.contains('real') + ' | setupPanel=' + !!document.querySelector('.setup')",
        ),
      );
      console.log(
        'LE_DEBUG detect:',
        await js(
          "window.lateEdition.detect().then(d=>d.map(x=>x.id+':'+(x.installed&&x.authenticated?('ready/'+(x.billing||'?')):'no')).join(', '))",
        ),
      );
      // Watch the animated floor for a few seconds. This is how the staff's real pace, the
      // resting camera and the banter get checked without a person sitting in front of it.
      // `LE_DEBUG_SECONDS=14` is long enough to catch a quip (they run every ~14–27s).
      interface Snap {
        tick: number;
        cam: number;
        banter: boolean;
        follow: boolean;
        quipping: string[];
        people: { id: string; x: number; st: string }[];
      }
      const snap = async (): Promise<Snap> =>
        JSON.parse((await js('JSON.stringify(window.__leFloor())')) as string);
      const seconds = Math.max(1, Number(process.env.LE_DEBUG_SECONDS) || 3);
      const first = await snap();
      let prev = first;
      let fastest = 0;
      const spoke = new Set<string>();
      for (let i = 0; i < seconds; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const now = await snap();
        for (const [j, p] of now.people.entries()) {
          const was = prev.people[j];
          if (was) fastest = Math.max(fastest, Math.abs(p.x - was.x));
        }
        for (const who of now.quipping) spoke.add(who);
        prev = now;
      }
      const rate = (prev.tick - first.tick) / seconds;
      console.log(`LE_DEBUG floor: ${rate.toFixed(1)} ticks/sec (expect ~12)`);
      console.log(
        `LE_DEBUG pace: fastest ${fastest.toFixed(1)} px/sec (roam ~24, work ~48 at 12/sec)`,
      );
      console.log(`LE_DEBUG camera: ${first.cam} at rest (the Chief's office centres at 288)`);
      console.log(
        `LE_DEBUG banter: on=${first.banter}, spoke in ${seconds}s: ${[...spoke].join(', ') || 'nobody'}`,
      );
      console.log(`LE_DEBUG staff: ${prev.people.map((p) => `${p.id}:${p.st}`).join(' ')}`);
      // The coffee beat, sampled frame by frame. The old one drew a mug at the mouth while
      // both arms hung at the sides, so the check is that the arm actually moves with it.
      console.log(
        'LE_DEBUG coffee:',
        await js(`(async () => {
          const cv = document.getElementById('screen');
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          const x = window.__leProbe.forceBeat(1, 'coffee');
          const frames = [];
          // Sample across one full sip cycle: lift, hold, tip, lower, rest.
          for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 420));
            const sx = Math.max(0, Math.round(x - window.__leProbe.camera()) - 16);
            const d = ctx.getImageData(sx, 100, 32, 40).data;
            // Count mug-coloured pixels (#c9c2b0) and how high the topmost one sits.
            let n = 0, top = 99;
            for (let px = 0; px < d.length; px += 4) {
              if (Math.abs(d[px] - 0xc9) < 8 && Math.abs(d[px + 1] - 0xc2) < 8 && Math.abs(d[px + 2] - 0xb0) < 8) {
                n++; top = Math.min(top, Math.floor(px / 4 / 32));
              }
            }
            frames.push({ mugPixels: n, mugTop: top });
          }
          const tops = frames.map(f => f.mugTop).filter(v => v < 99);
          return JSON.stringify({
            mugDrawn: frames.some(f => f.mugPixels > 0),
            mugMoves: new Set(tops).size > 1,
            heights: frames.map(f => (f.mugTop === 99 ? '-' : f.mugTop)).join(','),
            poseAtLift: window.__leProbe.sipPose(5),
            poseAtSip: window.__leProbe.sipPose(40),
            poseAtRest: window.__leProbe.sipPose(85),
          });
        })()`),
      );
      // Clicking a staff card should take the camera to that person and keep it there.
      console.log(
        'LE_DEBUG follow:',
        await js(`(async () => {
          const before = window.__leProbe.camera();
          const cards = [...document.querySelectorAll('#staff .sc')];
          const card = cards[cards.length - 1];
          card.click();
          await new Promise(r => setTimeout(r, 900));
          const after = window.__leProbe.camera();
          const who = window.__leProbe.watching();
          card.click();
          return JSON.stringify({ cards: cards.length, before, after, moved: after !== before, who });
        })()`),
      );
      // Chrome and layout: the tuning strip out of the cast grid, card-click follow, the
      // quips toggle, and nothing in Setup touching anything else.
      console.log(
        'LE_DEBUG layout:',
        await js(`(() => {
          const q = (s) => document.querySelector(s);
          // Setup is hidden until you open it, and a hidden element measures as zero.
          const setup = q('.setup'); const wasHidden = setup.hidden; setup.hidden = false;
          const tune = q('.budgetcard'), staff = q('#staff');
          const gap = (a, b) => Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom);
          const recheck = q('#setupRecheck'), agents = q('#setupAgents');
          const save = q('#setupSave'), help = q('.setup .foot-help');
          // Every desk row should be the same height — the "suggested:" line used to
          // make some rows taller and shunt their label and dropdown upward.
          const rowTops = [...document.querySelectorAll('.setup select[data-role]')]
            .map(s => Math.round(s.getBoundingClientRect().top));
          const gaps = rowTops.slice(1).map((v, i) => v - rowTops[i]);
          const out = {
            tuningOutsideCast: !!(tune && staff && !staff.contains(tune)),
            tuningBelowCast: !!(tune && staff && tune.getBoundingClientRect().top >= staff.getBoundingClientRect().bottom - 1),
            tuningSpansFullWidth: !!(tune && staff && Math.abs(tune.offsetWidth - staff.offsetWidth) < 4),
            recheckGap: recheck && agents ? gap(recheck, agents) : null,
            saveGap: save && help ? gap(save, help) : null,
            deskRowGaps: gaps,
            hasCloseSettings: !!q('#setupClose'),
            suggestFills: (() => {
              // The recommendation is only worth having if it can actually be applied.
              const before = [...document.querySelectorAll('.setup input.mdl')].map(i => i.value);
              q('#setupSuggest').click();
              const after = [...document.querySelectorAll('.setup input.mdl')].map(i => i.value);
              return after.filter((v, i) => v && v !== before[i]).join(',');
            })(),
            hasQuipToggle: !!q('#appQuips'),
            contentWidth: window.innerWidth,
            contentHeight: window.innerHeight,
          };
          setup.hidden = wasHidden;
          return JSON.stringify(out);
        })()`),
      );
      // Setup panel: agent rows, whether the stand-in is hidden, and whether the model
      // recommendation actually follows the provider dropdown (it used to not).
      console.log(
        'LE_DEBUG setup:',
        await js(`(() => {
          const q = (s) => document.querySelector(s);
          const agents = [...document.querySelectorAll('.setup .ag .ag-nm')].map(e => e.textContent);
          const desks = [...document.querySelectorAll('.setup select[data-role]')]
            .map(s => s.dataset.role + '=' + s.value);
          const sel = q('.setup select[data-role="reporter"]');
          // The row is [label, select, wrap] inside one grid, so the hint for THIS desk is
          // in the select's next sibling — not the first .rec in the whole grid.
          const rec = () => sel.nextElementSibling.querySelector('.rec').textContent;
          const opts = [...sel.options].map(o => o.value);
          const before = rec();
          const other = opts.find(v => v !== sel.value && v !== 'unset');
          if (other) { sel.value = other; sel.dispatchEvent(new Event('change')); }
          const after = rec();
          if (other) { sel.value = 'unset'; sel.dispatchEvent(new Event('change')); }
          return JSON.stringify({
            agents, desks, deskOptions: opts,
            standInOffered: opts.includes('fake'),
            recFollowsProvider: before !== after,
            recBefore: before, recAfter: after,
          });
        })()`),
      );
      // LE_DEBUG_RUN=1 files a whole edition on the offline stand-in and checks that the
      // live readout climbed and the desks filled their consoles. It forces `fake`, so it
      // never spends anyone's plan allowance.
      if (process.env.LE_DEBUG_RUN) {
        console.log(
          'LE_DEBUG run:',
          await js(`(async () => {
            const seen = [];
            const off = window.lateEdition.onEvent(ev => {
              seen.push(ev.stage + '/' + ev.event);
              window.__leProbe.applyEvent(ev);
            });
            window.__leProbe.resetUsage();
            // Sample the readout on every spend event, not on a timer — an offline run
            // finishes in well under a second, so a timer only ever catches one state.
            const readouts = [];
            const off2 = window.lateEdition.onEvent(ev => {
              if (ev.stage === 'usage') readouts.push(window.__leProbe.usageText());
            });
            // Offline by default. LE_DEBUG_RUN=real uses the configured staff and spends
            // real allowance, so it only happens when someone asks for it by name.
            const real = ${JSON.stringify(process.env.LE_DEBUG_RUN === 'real')};
            const brief = ${JSON.stringify(process.env.LE_DEBUG_BRIEF || 'the price of tea')};
            const runOpts = real ? { research: 1 } : { provider: 'fake', research: 0 };
            let r = await window.lateEdition.run(brief, runOpts);
            // An offline story is always thinly sourced, so the desk stops to ask. Answer
            // "run it as it stands" and carry on to the press.
            let stoppedToAsk = false;
            if (r.needsDecision) {
              stoppedToAsk = true;
              r = await window.lateEdition.answerVerify(r.editionId, false, runOpts);
            }
            off(); off2();
            const seenTokens = readouts.filter(t => /\\d/.test(t));
            const climbed = new Set(seenTokens).size;
            const desks = window.__leProbe.desks().filter(d => d.lines > 0);
            return JSON.stringify({
              ok: r.ok, stoppedToAsk,
              spendEvents: seen.filter(s => s === 'usage/spent').length,
              chatterEvents: seen.filter(s => s.endsWith('/chatter')).length,
              readoutStates: climbed, midRunReadout: seenTokens[0] || '(never showed a figure)',
              finalReadout: window.__leProbe.usageText(),
              desksWithConsole: desks.map(d => d.role + ':' + d.lines + '[' + d.kinds.join(',') + ']'),
              editionId: r.editionId,
              headline: ((((r.edition || {}).stories || [])[0]) || {}).headline,
              bodyChars: (((((r.edition || {}).stories || [])[0]) || {}).body || '').length,
              sources: (((((r.edition || {}).stories || [])[0]) || {}).sources || []).length,
            });
          })()`),
        );
      }
      // The Chief's mid-run call: a thin story must actually stop the run and wait, and
      // answering "no" must reach the press with the paper saying it ran unchecked.
      if (process.env.LE_DEBUG_RUN) {
        console.log(
          'LE_DEBUG decision:',
          await js(`(async () => {
            const r = await window.lateEdition.run('a deliberately thin topic',
              { provider: 'fake', research: 0 });
            if (!r.needsDecision) return JSON.stringify({ stopped: false, ok: r.ok });
            window.__leProbe.applyResult(r);
            const box = document.getElementById('decisionBox');
            const shown = box && !box.hidden ? box.querySelector('.dc-q').textContent : null;
            const after = await window.lateEdition.answerVerify(r.editionId, false,
              { provider: 'fake', research: 0 });
            return JSON.stringify({
              stopped: true, question: r.question, askedInApp: shown,
              resumed: after.ok,
              saidSo: (((after.edition || {}).editorsLog) || []).some(l => /unverified/.test(l)),
            });
          })()`),
        );
      }
      // Formats and the rewrite path: pick a format, ask the writer for it again, and
      // check what comes back is paste-ready (numbered citations, sources, notice).
      if (process.env.LE_DEBUG_RUN) {
        console.log(
          'LE_DEBUG rewrite:',
          await js(`(async () => {
            const eds = await window.lateEdition.editions();
            const target = (eds.find(e => e.finished) || {}).id;
            if (!target) return JSON.stringify({ skipped: 'nothing filed' });
            const opts = await window.lateEdition.formats();
            // Open that edition on the front page first — the rewrite panel is built when a
            // paper is shown, which is the only place you can ask for another format.
            document.getElementById('appBack').click();
            await new Promise(r2 => setTimeout(r2, 250));
            const read = document.querySelector('.backissues [data-read]');
            if (read) read.click();
            await new Promise(r2 => setTimeout(r2, 400));
            const r = await window.lateEdition.rewrite(target,
              { format: 'linkedin', tone: 'conversational', length: 'standard' });
            const panel = document.getElementById('fpRewrite');
            const buttons = [...panel.querySelectorAll('[data-fmt]')].map(b => b.dataset.fmt);
            return JSON.stringify({
              formats: opts.formats.map(f => f.id),
              ok: r.ok, label: r.formatLabel, chars: (r.text || '').length,
              rawIdsLeft: /\\[[a-z0-9_]+:[0-9a-f]{6,}\\]/i.test(r.text || ''),
              sources: (r.sources || []).length,
              panelBuilt: !!(panel && panel.dataset.built), panelOffers: buttons,
              frontPageOpen: !document.getElementById('frontpage').hidden,
            });
          })()`),
        );
      }
      // Back issues: the list handler, and the drawer that opens onto it.
      console.log(
        'LE_DEBUG editions:',
        await js(`(async () => {
          const eds = await window.lateEdition.editions();
          document.getElementById('appBack').click();
          await new Promise(r => setTimeout(r, 300));
          const rows = document.querySelectorAll('.backissues .bi').length;
          const empty = document.querySelector('.backissues .bi-empty');
          document.getElementById('biClose').click();
          return JSON.stringify({
            filed: eds.length,
            newestFirst: eds.every((e, i) => i === 0 || eds[i - 1].id >= e.id),
            drawerRows: rows,
            emptyState: empty ? empty.textContent.slice(0, 60) : null,
            newest: eds[0] ? eds[0].id + ' — ' + eds[0].headline.slice(0, 40) : '(none)',
          });
        })()`),
      );
    } catch (e) {
      console.log('LE_DEBUG error:', e instanceof Error ? e.message : e);
    }
    app.quit();
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC: the renderer talks to the engine through these -------------------

/** The folder the newsroom lives in (where context/history is stored). */
ipcMain.handle('le:getRoot', () => newsroomRoot());

/** Open a folder picker; on choose, move the newsroom there and remember it. */
ipcMain.handle('le:pickRoot', async () => {
  const res = await dialog.showOpenDialog(win ?? undefined!, {
    title: 'Choose a folder to store this newsroom (config, staff, editions & history)',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: newsroomRoot(),
  });
  if (res.canceled || !res.filePaths[0]) return newsroomRoot();
  const root = res.filePaths[0];
  writeAppConfig({ ...readAppConfig(), root }); // merge — don't drop the accepted notice
  return ensureNewsroom(root);
});

/**
 * The disclaimers, and whether this user has already read the first-run one. The words
 * live in one module so the paper, the app and the README can never say different things.
 */
ipcMain.handle('le:notices', () => ({
  firstRun: FIRST_RUN_NOTICE,
  outputShort: OUTPUT_DISCLAIMER_SHORT,
  apiBilling: API_BILLING_NOTICE,
  planBilling: PLAN_BILLING_NOTICE,
  accepted: readAppConfig().noticeAccepted === NOTICE_VERSION,
}));

/** Record that the first-run notice has been read, so it isn't shown again. */
ipcMain.handle('le:acceptNotice', () => {
  writeAppConfig({ ...readAppConfig(), noticeAccepted: NOTICE_VERSION });
  return true;
});

/**
 * Everything Setup needs about each agent in one call: whether it's ready, how it bills,
 * how far the integration has actually been proven, the exact commands to make it work,
 * and which of its models suits each desk. The panel used to hardcode Claude's aliases as
 * the recommendation for every provider; now the provider answers for itself.
 */
ipcMain.handle('le:detect', async () => {
  const m = await detectAll();
  return listProviders().map((p) => ({
    id: p.id,
    displayName: p.displayName,
    maturity: p.maturity ?? 'untested',
    setupSteps: p.setupSteps ?? [],
    models: p.capabilities.models ?? [],
    recommend: p.capabilities.recommend ?? {},
    webSearch: p.capabilities.webSearch,
    ...(m.get(p.id) ?? { installed: false, authenticated: false }),
  }));
});

/** The current per-role staff assignment (for the Setup panel). */
ipcMain.handle('le:staff', async () => {
  const root = newsroomRoot();
  const nr = await loadNewsroom(root);
  const pick = (r: { provider: string; model?: string }) => ({
    provider: r.provider,
    model: r.model ?? '',
  });
  return {
    managing_editor: pick(nr.staff.managingEditor),
    researchers: pick(nr.staff.researchers.default),
    reporters: pick(nr.staff.reporters.default),
    writers: pick(nr.staff.writers.default),
    copy_desk: pick(nr.staff.copyDesk),
  };
});

interface RolePick {
  provider: string;
  model?: string;
}
/** Write staff.yaml from the Setup panel — this is how a user wires roles to their agents. */
ipcMain.handle('le:setStaff', async (_e, a: Record<string, RolePick>) => {
  const root = newsroomRoot();
  const line = (r?: RolePick) => {
    const p = r?.provider || 'fake';
    return r?.model ? `{ provider: ${p}, model: ${r.model} }` : `{ provider: ${p} }`;
  };
  const yaml = [
    '# Written by the Late Edition setup panel. Auth lives in each agent CLI (we never store it).',
    `managing_editor: ${line(a.managing_editor)}`,
    'researchers:',
    `  default: ${line(a.researchers)}`,
    'reporters:',
    `  default: ${line(a.reporters)}`,
    'writers:',
    `  default: ${line(a.writers)}`,
    `copy_desk: ${line(a.copy_desk)}`,
    '',
  ].join('\n');
  writeFileSync(paths(root).staffFile, yaml, 'utf8');
  return true;
});

/** Brief the Chief → run the real pipeline, streaming every event to the renderer. */
ipcMain.handle(
  'le:run',
  async (
    e,
    brief: string,
    opts: {
      provider?: string;
      research?: number;
      maxFindings?: number;
      shape?: CopyShape;
      photoDesk?: boolean;
    },
  ) => {
    const root = newsroomRoot();
    const send = (ev: LogEvent) => {
      if (!e.sender.isDestroyed()) e.sender.send('le:event', ev);
    };
    try {
      const res = await runEdition({
        root,
        brief,
        forceProvider: opts?.provider || undefined,
        research: opts?.research,
        maxFindings: opts?.maxFindings,
        shape: opts?.shape,
        clarify: true, // let the Chief pause a vague brief and ask the user
        askToVerify: true, // and let a doubtful desk stop and put it to you
        photoDesk: opts?.photoDesk === true,
        onEvent: send,
      });
      return {
        ok: true as const,
        editionId: res.editionId,
        edition: res.edition,
        warnings: res.warnings,
        usage: await summarizeUsage(res.edition),
      };
    } catch (err) {
      if (err instanceof ClarificationNeededError) {
        return {
          ok: false as const,
          needsClarification: true as const,
          editionId: err.editionId,
          questions: err.questions,
        };
      }
      if (err instanceof VerificationNeededError) {
        return {
          ok: false as const,
          needsDecision: true as const,
          editionId: err.editionId,
          slug: err.slug,
          question: err.question,
          reason: err.reason,
        };
      }
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  },
);

/** The user's answer to the Chief's clarification → resume the paused edition and finish it. */
ipcMain.handle(
  'le:answerClarification',
  async (
    e,
    editionId: string,
    answer: string,
    opts: {
      provider?: string;
      research?: number;
      maxFindings?: number;
      shape?: CopyShape;
      photoDesk?: boolean;
    } = {},
  ) => {
    const root = newsroomRoot();
    const send = (ev: LogEvent) => {
      if (!e.sender.isDestroyed()) e.sender.send('le:event', ev);
    };
    try {
      const res = await runEdition({
        root,
        resumeId: editionId,
        forceProvider: opts?.provider || undefined,
        clarificationAnswer: answer,
        research: opts?.research,
        maxFindings: opts?.maxFindings,
        shape: opts?.shape,
        clarify: true,
        askToVerify: true,
        photoDesk: opts?.photoDesk === true,
        onEvent: send,
      });
      return {
        ok: true as const,
        editionId: res.editionId,
        edition: res.edition,
        warnings: res.warnings,
        usage: await summarizeUsage(res.edition),
      };
    } catch (err) {
      if (err instanceof ClarificationNeededError) {
        return {
          ok: false as const,
          needsClarification: true as const,
          editionId: err.editionId,
          questions: err.questions,
        };
      }
      if (err instanceof VerificationNeededError) {
        return {
          ok: false as const,
          needsDecision: true as const,
          editionId: err.editionId,
          slug: err.slug,
          question: err.question,
          reason: err.reason,
        };
      }
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  },
);

/** Per-role token totals + how it's paid for — the app's honest usage readout. */
async function summarizeUsage(edition: Edition) {
  const byRole: Record<string, number> = {};
  const kinds = sumUsage(edition);
  let total = 0;
  for (const u of edition.tokenUsage) {
    const t =
      (u.inputTokens ?? 0) +
      (u.outputTokens ?? 0) +
      (u.cacheReadTokens ?? 0) +
      (u.cacheWriteTokens ?? 0);
    byRole[u.role] = (byRole[u.role] ?? 0) + t;
    total += t;
  }
  const usedCost = edition.tokenUsage.reduce((n, u) => n + (u.costUsd ?? 0), 0);
  const used = [...new Set(edition.tokenUsage.map((u) => u.provider))];
  const det = await detectAll();
  const modes = used.map((id) => det.get(id)?.billing ?? 'unknown');
  const billing = modes.includes('api')
    ? 'api'
    : modes.includes('subscription')
      ? 'subscription'
      : 'free';
  return { total, byRole, billing, costUsd: usedCost, kinds };
}

/** The stop switch: halt every agent call (idles the newsroom) / lift it. */
ipcMain.handle('le:halt', () => {
  setHalt(newsroomRoot(), 'stopped from the app');
  return true;
});
ipcMain.handle('le:resume', () => {
  clearHalt(newsroomRoot());
  return true;
});
ipcMain.handle('le:isHalted', () => isHalted(newsroomRoot()));

/**
 * Your answer to the Chief's mid-run question. `true` sends the researcher back over that
 * story; `false` runs it as it stands, and the Editor's Log says so.
 */
ipcMain.handle(
  'le:answerVerify',
  async (
    e,
    editionId: string,
    verify: boolean,
    opts: {
      provider?: string;
      research?: number;
      maxFindings?: number;
      shape?: CopyShape;
      photoDesk?: boolean;
    } = {},
  ) => {
    const send = (ev: LogEvent) => {
      if (!e.sender.isDestroyed()) e.sender.send('le:event', ev);
    };
    try {
      const res = await runEdition({
        root: newsroomRoot(),
        resumeId: editionId,
        forceProvider: opts?.provider || undefined,
        verifyAnswer: verify,
        research: opts?.research,
        maxFindings: opts?.maxFindings,
        shape: opts?.shape,
        clarify: true,
        askToVerify: true,
        photoDesk: opts?.photoDesk === true,
        onEvent: send,
      });
      return {
        ok: true as const,
        editionId: res.editionId,
        edition: res.edition,
        warnings: res.warnings,
        usage: await summarizeUsage(res.edition),
      };
    } catch (err) {
      if (err instanceof VerificationNeededError) {
        return {
          ok: false as const,
          needsDecision: true as const,
          editionId: err.editionId,
          slug: err.slug,
          question: err.question,
          reason: err.reason,
        };
      }
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  },
);

/** The formats, tones and lengths the copy desk can write in — the picker's options. */
ipcMain.handle('le:formats', () => ({
  formats: FORMATS.map((f) => ({ id: f.id, label: f.label, hint: f.hint })),
  tones: Object.entries(TONES).map(([id, t]) => ({ id, label: t.label })),
  lengths: Object.entries(LENGTHS).map(([id, l]) => ({ id, label: l.label })),
}));

/**
 * Write a finished story again in another shape. One writer call against reporting that is
 * already done and already checked — not a new edition, and it cannot add a source.
 */
ipcMain.handle('le:rewrite', async (e, editionId: string, shape: CopyShape, slug?: string) => {
  const send = (ev: LogEvent) => {
    if (!e.sender.isDestroyed()) e.sender.send('le:event', ev);
  };
  try {
    return {
      ok: true as const,
      ...(await rewriteStory({ root: newsroomRoot(), editionId, slug, shape, onEvent: send })),
    };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
});

/** Every edition this newsroom has filed, newest first — the back-issues drawer. */
ipcMain.handle('le:editions', (): EditionSummary[] => listEditions(newsroomRoot()));

/** One past edition in full, so the front page can show it again without a rerun. */
ipcMain.handle('le:edition', (_e, editionId: string) => {
  try {
    const file = join(paths(newsroomRoot()).editionDir(editionId), 'edition.json');
    return JSON.parse(readFileSync(file, 'utf8')) as Edition;
  } catch {
    return null;
  }
});

/** Open the finished paper in the user's real browser (a full-size, shareable view). */
ipcMain.handle('le:openPaper', (_e, editionId: string) => {
  const file = join(paths(newsroomRoot()).editionDir(editionId), 'edition.html');
  if (existsSync(file)) shell.openPath(file);
  return existsSync(file);
});

/** Read a finished edition's rendered HTML (for the in-window front-page view). */
ipcMain.handle('le:editionHtml', async (_e, editionId: string) => {
  const root = newsroomRoot();
  try {
    return readFileSync(join(paths(root).editionDir(editionId), 'edition.html'), 'utf8');
  } catch {
    return '';
  }
});
