import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { BrowserWindow } from 'electron';
import { shell } from 'electron';
import electronUpdater from 'electron-updater';

/**
 * Telling you a new version exists.
 *
 * The only server this app ever talks to on its own behalf is GitHub's releases endpoint for
 * this repository, and only to ask what the latest tag is. No account, no identifier, no
 * payload, nothing that says who asked. That is the whole promise in the privacy statement
 * and it is the reason this file is small.
 *
 * **macOS gets told, never updated.** The builds are ad-hoc signed and not notarised, and an
 * unsigned auto-install fails partway and leaves a broken app behind. Far better to say a
 * version is out and open the release page. Windows and Linux download in the background and
 * ask; nothing ever restarts itself.
 *
 * `updates.enabled: false` in the app config turns the whole thing off, including the check.
 */

const { autoUpdater } = electronUpdater;

/** How often to look after the first check. The plan's figure, and nobody needs more. */
const EVERY = 24 * 60 * 60 * 1000;

export interface UpdateState {
  /** Is there a newer version than the one running? */
  available: boolean;
  version?: string;
  /** Downloaded and ready to install on restart. Never true on macOS. */
  ready: boolean;
  /** Where a person can go and get it themselves. */
  url?: string;
  /** Set when a check failed, so the interface can be honest rather than silent. */
  error?: string;
}

export interface UpdateOptions {
  /** Where the app's own config lives, so `updates.enabled` can be read and written. */
  configPath: string;
  /** The release page, for the platforms that cannot install for themselves. */
  releasesUrl: string;
  /** Told whenever the state changes, so the interface can mention it. */
  onState: (state: UpdateState) => void;
}

function readEnabled(configPath: string): boolean {
  try {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as { updates?: { enabled?: boolean } };
    return cfg.updates?.enabled !== false;
  } catch {
    return true; // no config yet, or unreadable: checking is the default
  }
}

let state: UpdateState = { available: false, ready: false };
let timer: NodeJS.Timeout | null = null;

/** The last thing we learned, for a renderer that asks after the fact. */
export function updateState(): UpdateState {
  return { ...state };
}

/** Is the check switched on? */
export function updatesEnabled(configPath: string): boolean {
  return readEnabled(configPath);
}

/** Turn it off, or on. Off stops the timer immediately rather than at the next tick. */
export function setUpdatesEnabled(configPath: string, on: boolean): boolean {
  let cfg: Record<string, unknown> = {};
  try {
    if (existsSync(configPath)) cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    /* start from nothing rather than refuse the setting */
  }
  cfg.updates = { enabled: on };
  writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
  if (!on && timer) {
    clearInterval(timer);
    timer = null;
  }
  return on;
}

/** Install what has been downloaded, and restart into it. Never called on macOS. */
export function installNow(): void {
  if (process.platform === 'darwin' || !state.ready) return;
  autoUpdater.quitAndInstall(false, true);
}

/**
 * Start checking. Safe to call in development, where there is no published release to
 * compare against — the check simply fails and is swallowed.
 */
export function startUpdateChecks(win: BrowserWindow | null, opts: UpdateOptions): void {
  const publish = (next: UpdateState) => {
    state = next;
    opts.onState(state);
    if (win && !win.isDestroyed()) win.webContents.send('le:update', state);
  };

  if (!readEnabled(opts.configPath)) return;

  // Nothing happens without being asked for, on any platform. Downloading in the background
  // is fine; installing behind somebody's back is not.
  autoUpdater.autoDownload = process.platform !== 'darwin';
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('update-available', (info: { version?: string }) => {
    publish({
      available: true,
      version: info?.version,
      ready: false,
      url: opts.releasesUrl,
    });
  });

  autoUpdater.on('update-downloaded', (info: { version?: string }) => {
    publish({ available: true, version: info?.version, ready: true, url: opts.releasesUrl });
  });

  autoUpdater.on('error', (err: Error) => {
    // Running unpackaged, offline, or behind something that blocks GitHub. None of those is
    // worth a dialog, but the interface should be able to say so if asked.
    publish({ ...state, error: err?.message ?? String(err) });
  });

  const check = () => {
    if (!readEnabled(opts.configPath)) return;
    autoUpdater.checkForUpdates().catch(() => {
      /* handled by the error listener above */
    });
  };

  check();
  timer = setInterval(check, EVERY);
}

/** Open the releases page, for a platform that cannot install for itself. */
export function openReleases(url: string): void {
  shell.openExternal(url);
}
