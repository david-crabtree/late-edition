import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app, ipcMain } from 'electron';
// The engine — the same library the CLI uses, called in-process.
import { loadNewsroom } from '../main/config/newsroom.js';
import { scaffoldNewsroom } from '../main/config/scaffold.js';
import { runEdition } from '../main/pipeline/run.js';
import { detectAll } from '../main/providers/registry.js';
import type { LogEvent } from '../main/store/log.js';
import { paths } from '../main/store/paths.js';

const here = dirname(fileURLToPath(import.meta.url));
// The newsroom UI is the code-drawn prototype; the preload turns on "real mode".
const RENDERER = join(here, '../../docs/prototype/newsroom-screen-test.html');

/** The app keeps one newsroom under userData, scaffolded on first launch. */
function newsroomRoot(): string {
  const root = join(app.getPath('userData'), 'newsroom');
  if (!existsSync(join(root, 'newsroom', 'config.yaml'))) {
    mkdirSync(root, { recursive: true });
    scaffoldNewsroom(root);
  }
  return root;
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
      preload: join(here, 'preload.js'),
      contextIsolation: true,
      sandbox: false, // required so the ESM preload can run
      nodeIntegration: false,
    },
  });
  win.loadFile(RENDERER);
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
  async (e, brief: string, opts: { provider?: string; research?: number }) => {
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
        clarify: false,
        onEvent: send,
      });
      return {
        ok: true as const,
        editionId: res.editionId,
        edition: res.edition,
        warnings: res.warnings,
      };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  },
);

/** Read a finished edition's rendered HTML (for the front-page view). */
ipcMain.handle('le:editionHtml', async (_e, editionId: string) => {
  const root = newsroomRoot();
  try {
    return readFileSync(join(paths(root).editionDir(editionId), 'edition.html'), 'utf8');
  } catch {
    return '';
  }
});
