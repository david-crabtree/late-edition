import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';
// The engine — the same library the CLI uses, called in-process.
import { loadNewsroom } from '../main/config/newsroom.js';
import { scaffoldNewsroom } from '../main/config/scaffold.js';
import type { Edition } from '../main/core/edition.js';
import { ClarificationNeededError } from '../main/pipeline/clarify.js';
import { runEdition } from '../main/pipeline/run.js';
import { detectAll } from '../main/providers/registry.js';
import { clearHalt, isHalted, setHalt } from '../main/store/halt.js';
import type { LogEvent } from '../main/store/log.js';
import { paths } from '../main/store/paths.js';

const here = dirname(fileURLToPath(import.meta.url));
// The newsroom UI is the code-drawn prototype; the preload turns on "real mode".
const RENDERER = join(here, '../../docs/prototype/newsroom-screen-test.html');
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
function readAppConfig(): { root?: string } {
  try {
    return JSON.parse(readFileSync(appConfigPath(), 'utf8')) as { root?: string };
  } catch {
    return {};
  }
}
function writeAppConfig(c: { root?: string }): void {
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
  const chosen = readAppConfig().root;
  return ensureNewsroom(chosen || join(app.getPath('userData'), 'newsroom'));
}

let win: BrowserWindow | null = null;
function createWindow(): void {
  win = new BrowserWindow({
    width: 1240,
    height: 940,
    minWidth: 760,
    backgroundColor: '#0a0d12',
    title: 'Late Edition',
    webPreferences: {
      preload: PRELOAD, // CommonJS preload — Electron loads it reliably
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });
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
        `LE_DEBUG pace: fastest ${fastest.toFixed(1)} px/sec (roam ~10, work ~26 at 12/sec)`,
      );
      console.log(`LE_DEBUG camera: ${first.cam} at rest (the Chief's office centres at 288)`);
      console.log(
        `LE_DEBUG banter: on=${first.banter}, spoke in ${seconds}s: ${[...spoke].join(', ') || 'nobody'}`,
      );
      console.log(`LE_DEBUG staff: ${prev.people.map((p) => `${p.id}:${p.st}`).join(' ')}`);
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
  writeAppConfig({ root });
  return ensureNewsroom(root);
});

/** Which providers are installed/authenticated, and how they bill (plan vs API). */
ipcMain.handle('le:detect', async () => {
  const m = await detectAll();
  return [...m].map(([id, d]) => ({ id, ...d }));
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
    opts: { provider?: string; research?: number; maxFindings?: number },
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
        clarify: true, // let the Chief pause a vague brief and ask the user
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
    opts: { research?: number; maxFindings?: number } = {},
  ) => {
    const root = newsroomRoot();
    const send = (ev: LogEvent) => {
      if (!e.sender.isDestroyed()) e.sender.send('le:event', ev);
    };
    try {
      const res = await runEdition({
        root,
        resumeId: editionId,
        clarificationAnswer: answer,
        research: opts?.research,
        maxFindings: opts?.maxFindings,
        clarify: true,
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
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  },
);

/** Per-role token totals + how it's paid for — the app's honest usage readout. */
async function summarizeUsage(edition: Edition) {
  const byRole: Record<string, number> = {};
  let total = 0;
  for (const u of edition.tokenUsage) {
    const t = (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
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
  return { total, byRole, billing, costUsd: usedCost };
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
