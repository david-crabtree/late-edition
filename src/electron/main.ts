import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
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
  sourceLine,
} from '../main/core/disclaimer.js';
import type { Edition } from '../main/core/edition.js';
import { type CopyShape, LENGTHS, OUTLETS } from '../main/core/formats.js';
import { ClarificationNeededError } from '../main/pipeline/clarify.js';
import { sumUsage } from '../main/pipeline/draft.js';
import { rewriteStory } from '../main/pipeline/rewrite.js';
import { runEdition } from '../main/pipeline/run.js';
import { StaffNotConfiguredError } from '../main/pipeline/staffing.js';
import { VerificationNeededError } from '../main/pipeline/verify.js';
import { detectAll, getProvider, listProviders } from '../main/providers/registry.js';
import { type EditionSummary, listEditions } from '../main/store/edition-store.js';
import { PipelineHaltError, clearHalt, isHalted, setHalt } from '../main/store/halt.js';
import type { LogEvent } from '../main/store/log.js';
import { paths } from '../main/store/paths.js';
import {
  MAX_PER_RUN,
  checkWatched,
  clearSpike,
  dropSource,
  listWatched,
  unwatch,
  watchEdition,
} from '../main/watch/field.js';

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
  /** Is the field desk on? Default on — checking costs nothing. */
  fieldDesk?: boolean;
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
    width: 995,
    height: 914,
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
      console.log(
        'LE_DEBUG cast:',
        await js(
          "[...document.querySelectorAll('#staff .sc b')].map(e=>e.textContent).join(' | ')",
        ),
      );
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
      // The interface/engine handshake. Asking for a channel this build hasn't got is
      // exactly what a stale `npm run electron` looks like from the interface's side.
      console.log(
        'LE_DEBUG handshake:',
        await js(`(async () => {
          const real = await window.lateEdition.api();
          const quietWhenMatched = !document.querySelector('.stalebar');
          const ok = await window.__leProbe.shakeHands(['le:api', 'le:watches']);
          const stillQuiet = !document.querySelector('.stalebar');
          // Now ask for something no build has.
          const bad = await window.__leProbe.shakeHands(['le:api', 'le:doesNotExist']);
          const warned = !!document.querySelector('.stalebar');
          const bar = document.querySelector('.stalebar');
          if (bar) bar.remove();
          await window.__leProbe.shakeHands(['le:api']);
          return JSON.stringify({
            channels: real.channels.length,
            hasFieldDesk: real.channels.includes('le:checkWatches'),
            matchedOk: ok,
            quietWhenMatched: quietWhenMatched && stillQuiet,
            mismatchReported: bad === false,
            warnsVisibly: warned,
            recovered: !document.querySelector('.stalebar'),
          });
        })()`),
      );
      // Chrome and layout: the tuning strip out of the cast grid, card-click follow, the
      // quips toggle, and nothing in Setup touching anything else.
      console.log(
        'LE_DEBUG layout:',
        await js(`(async () => {
          // Setup fills itself from two async calls; give them a beat before measuring.
          await new Promise(r => setTimeout(r, 400));
          const q = (s) => document.querySelector(s);
          // Setup is hidden until you open it, and a hidden element measures as zero.
          const setup = q('.setup'); const wasHidden = setup.hidden;
          const restingOrder = ['#briefInput', '.cabinet', '#clog', '#staff']
            .map(s => Math.round((q(s) || {getBoundingClientRect:()=>({top:0})}).getBoundingClientRect().top + window.scrollY));
          setup.hidden = false;
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
              const boxes = [...document.querySelectorAll('.setup input.mdl')];
              for (const b of boxes) b.value = '';
              q('#setupSuggest').click();
              return boxes.map(b => b.value || '-').join(',') + ' | msg=' + q('#setupMsg').textContent;
            })(),
            hasQuipToggle: !!q('#appQuips'),
            // Reading order down the page: brief, then the floor, then the log and cast.
            restingOrder: restingOrder.join(' < '),
            restingOrderCorrect: restingOrder.every((v, i) => i === 0 || v > restingOrder[i - 1]),
            setupAboveBrief: q('.setup').getBoundingClientRect().top < q('#briefInput').getBoundingClientRect().top,
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
      // A vague brief must put its questions where you answer them, not only in the log.
      if (process.env.LE_DEBUG_RUN) {
        console.log(
          'LE_DEBUG clarify:',
          await js(`(async () => {
            // The offline stand-in treats a brief ending in "?" as too vague to run.
            const r = await window.lateEdition.run('what about the thing?', { provider: 'fake', research: 0 });
            if (!r.needsClarification) return JSON.stringify({ asked: false, ok: r.ok });
            window.__leProbe.applyResult(r);
            const box = document.getElementById('clarifyBox');
            const brief = document.getElementById('briefInput');
            const out = {
              asked: true,
              questions: r.questions.length,
              shownAboveBrief: !!(box && !box.hidden && brief &&
                box.getBoundingClientRect().top < brief.getBoundingClientRect().top),
              questionsVisible: box ? box.querySelectorAll('.cl-qs li').length : 0,
              buttonRelabelled: (document.getElementById('briefBtn') || {}).textContent,
              canSkip: !!(box && box.querySelector('#clSkip')),
            };
            // Answer it the way a person would — type in the box and press the button —
            // rather than calling the channel behind the interface's back.
            brief.value = 'the price of tea';
            document.getElementById('briefBtn').click();
            for (let i = 0; i < 40 && !box.hidden; i++) await new Promise(r2 => setTimeout(r2, 100));
            out.clearedAfterAnswer = box.hidden;
            return JSON.stringify(out);
          })()`),
        );
      }
      // The first-run path nobody has walked: a brand-new newsroom with no agent on any
      // desk. This is what a stranger who downloads the app sees before they open Setup.
      if (process.env.LE_DEBUG_RUN) {
        console.log(
          'LE_DEBUG firstrun:',
          await js(`(async () => {
            const r = await window.lateEdition.run('anything at all', {});
            window.__leProbe.applyResult(r);
            const chief = window.__leProbe.desks().find(d => d.role === 'chief');
            const box = document.getElementById('staffingBox');
            return JSON.stringify({
              ok: r.ok,
              needsStaffing: !!r.needsStaffing,
              desk: r.desk || null,
              chiefSays: box && !box.hidden ? box.querySelector('.dc-q').textContent : null,
              offersSetupButton: !!(box && !box.hidden && box.querySelector('#stOpen')),
              chiefLines: chief ? chief.lines : 0,
              banner: document.getElementById('mScene').textContent,
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
              { outlet: 'linkedin', length: 'standard' },
              undefined, { provider: 'fake' });
            const panel = document.getElementById('fpRewrite');
            const sel = panel.querySelector('#rwOutlet');
            return JSON.stringify({
              outlets: opts.outlets.map(o => o.id),
              grouped: [...sel.querySelectorAll('optgroup')].map(g => g.label),
              ok: r.ok, error: r.error || null, label: r.formatLabel, chars: (r.text || '').length,
              rawIdsLeft: /\\[[a-z0-9_]+:[0-9a-f]{6,}\\]/i.test(r.text || ''),
              sources: (r.sources || []).length,
              panelBuilt: !!(panel && panel.dataset.built),
              panelOffers: [...sel.options].length,
              // Whatever is in the copy box is about to be pasted somewhere with none of
              // this app around it, so the notice and the credit have to be IN the box.
              boxCarriesNotice: /Not journalism/i.test(window.__leProbe.copyBoxText(r.text, r.sources)),
              boxCarriesCredit: /open-source AI newsroom/i.test(window.__leProbe.copyBoxText(r.text, r.sources)),
              noBylineOnPage: !(document.getElementById('fpByline')||{}).textContent,
              noSeparateToneBox: !panel.querySelector('#rwTone'),
              frontPageOpen: !document.getElementById('frontpage').hidden,
            });
          })()`),
        );
      }
      // The paper picker: a button beside the brief that opens a modal telling you what
      // each masthead actually does. A dropdown of eleven names said nothing about any
      // of them, and it sat in a settings row under the cast where it was easy to miss.
      if (process.env.LE_DEBUG_RUN) {
        console.log(
          'LE_DEBUG papers:',
          await js(`(async () => {
            const btn = document.getElementById('paperBtn');
            const brief = document.querySelector('.brief');
            const depth = document.getElementById('researchLevel');
            const send = document.getElementById('briefBtn');
            const out = {
              // Both run options sit with the brief, not in the card under the cast — and
              // on the same line as the button that sends it, not stranded underneath.
              buttonByTheBrief: !!(btn && brief && brief.contains(btn)),
              depthByTheBrief: !!(depth && brief && brief.contains(depth)),
              inLineWithSend: !!(btn && send &&
                Math.abs(btn.getBoundingClientRect().top - send.getBoundingClientRect().top) < 20),
              oldDropdownGone: !document.getElementById('fmtSel'),
              buttonSays: btn ? btn.querySelector('b').textContent : null,
              // The browser's own white select had nothing to do with the rest of the app.
              depthStyled: depth ? (() => {
                const cs = getComputedStyle(depth);
                return cs.colorScheme === 'dark' && !/255, 255, 255/.test(cs.backgroundColor);
              })() : false,
            };
            btn.click();
            for (let i = 0; i < 40 && !document.querySelector('.papers:not([hidden])'); i++)
              await new Promise(r2 => setTimeout(r2, 50));
            const modal = document.querySelector('.papers');
            const cards = [...modal.querySelectorAll('[data-paper]')];
            out.opens = !modal.hidden;
            out.papers = cards.length;
            out.grouped = [...modal.querySelectorAll('.pp-group')].map(g => g.textContent);
            // The whole point: every one of them explains itself in a sentence or more.
            out.everyPaperDescribed = cards.every(c => {
              const p2 = c.querySelector('.pp-blurb');
              return p2 && p2.textContent.trim().length > 80;
            });
            // The hint used to print beside the masthead AND again as the blurb below it.
            out.saysItOnce = cards.every(c => {
              const line = c.querySelector('.pp-blurb').textContent.trim();
              const rest = c.textContent.trim().replace(line, '').replace(/RUNNING THIS/, '').trim();
              return !rest.includes(line.slice(0, 30));
            });
            out.marksTheCurrentOne = cards.filter(c => c.getAttribute('aria-checked') === 'true').length;
            out.offersLength = !!modal.querySelector('#ppLen');
            // Picking one closes it and the button carries the answer.
            const moon = cards.find(c => c.dataset.paper === 'moon');
            moon.click();
            await new Promise(r2 => setTimeout(r2, 400));
            out.picking = { closed: modal.hidden, buttonNowSays: btn.querySelector('b').textContent };
            return JSON.stringify(out);
          })()`),
        );
      }
      // The first person to try this who was not a developer could not open a terminal,
      // did not know one was needed, and abandoned it. The steps were printed in the
      // panel and may as well not have been.
      if (process.env.LE_DEBUG_RUN) {
        console.log(
          'LE_DEBUG wiring:',
          await js(`(async () => {
            document.querySelector('.setup').hidden = false;
            for (let i = 0; i < 40 && !document.querySelector('[data-wire]'); i++)
              await new Promise(x => setTimeout(x, 100));
            const row = document.querySelector('[data-wire="claude"]');
            const out = { everyAgentOffersAWayIn: [...document.querySelectorAll('.setup .ag')]
              .every(a => !!a.querySelector('[data-wire]')) };
            out.buttonSays = row ? row.textContent.trim() : null;
            row.click();
            for (let i = 0; i < 40 && !document.querySelector('.wiring:not([hidden])'); i++)
              await new Promise(x => setTimeout(x, 100));
            const m = document.querySelector('.wiring');
            out.opens = !m.hidden;
            out.name = m.querySelector('#wiName').textContent;
            // What it is, and what is actually missing — before any command.
            out.saysWhatItIs = (m.querySelector('.wi-blurb') || {}).textContent || '';
            out.saysWhatIsMissing = !!(m.querySelector('.wi-state') || {}).textContent;
            const steps = [...m.querySelectorAll('.wi-step')];
            out.steps = steps.length;
            // A download step opens the page; a command step opens a terminal AND can be
            // copied, with the command visible so nothing runs unseen.
            out.stepsWithAPage = m.querySelectorAll('[data-page]').length;
            out.stepsWithATerminal = m.querySelectorAll('[data-term]').length;
            out.stepsWithACopy = m.querySelectorAll('[data-copy]').length;
            out.commandsShown = [...m.querySelectorAll('code.wi-code')].map(c => c.textContent);
            out.canRecheck = !!m.querySelector('#wiCheck');
            m.querySelector('#wiClose').click();
            out.closes = m.hidden;
            document.querySelector('.setup').hidden = true;
            return JSON.stringify(out);
          })()`),
        );
      }
      // The help buttons take a provider id and a step number, never an address or a
      // command. A page that could hand either one to the operating system would be a way
      // to run anything on the machine wearing a help button's clothes.
      if (process.env.LE_DEBUG_RUN) {
        console.log(
          'LE_DEBUG wiring-safety:',
          await js(`(async () => {
            const bad = [
              await window.lateEdition.openTerminal('claude', 99),
              await window.lateEdition.openTerminal('no-such-agent', 0),
              await window.lateEdition.openSetupPage('claude', 99),
              await window.lateEdition.openSetupPage('no-such-agent', 0),
            ];
            return JSON.stringify({
              allRefused: bad.every(r => r && r.ok === false),
              reasons: bad.map(r => (r || {}).error),
            });
          })()`),
        );
      }
      // The front page in the window is what people actually read and copy — edition.md
      // is correct and nobody opens it. A post shown here had a news headline, a
      // standfirst, superscript footnotes numbered off the full source list, and six
      // sources under three citations. All of it travelled into the paste.
      if (process.env.LE_DEBUG_RUN) {
        console.log(
          'LE_DEBUG onscreen:',
          await js(`(async () => {
            const read = async (outlet) => {
              let r = await window.lateEdition.run('an onscreen topic', { provider: 'fake', research: 1, shape: { outlet } });
              if (r.needsDecision) r = await window.lateEdition.answerVerify(r.editionId, false, { provider: 'fake', research: 1, shape: { outlet } });
              window.__leProbe.applyResult(r);
              await new Promise(x => setTimeout(x, 250));
              const story = ((r.edition || {}).stories || [])[0] || {};
              const cited = new Set([...String(story.body || '')
                .matchAll(/\\[([a-z0-9_]+:[0-9a-f]{6,})\\]/gi)].map(m => m[1]));
              return {
                headlineShown: !document.getElementById('fpHead').hidden &&
                  !!document.getElementById('fpHead').textContent.trim(),
                standfirstShown: !document.getElementById('fpStand').hidden &&
                  !!document.getElementById('fpStand').textContent.trim(),
                bylineShown: !!document.getElementById('fpByline').textContent.trim(),
                markersInProse: document.getElementById('fpBody').querySelectorAll('sup').length,
                sourcesListed: document.getElementById('fpSources').querySelectorAll('li').length,
                sourcesOnStory: (story.sources || []).length,
                citedByCopy: cited.size,
              };
            };
            return JSON.stringify({ linkedin: await read('linkedin'), paper: await read('chronicle') });
          })()`),
        );
      }
      // Spiking a case throws its changes away and they never come back, because the
      // sources have already been diffed. One stray click used to do it, and left the run
      // button greyed out with nothing saying why.
      if (process.env.LE_DEBUG_RUN) {
        console.log(
          'LE_DEBUG spike:',
          await js(`(async () => {
            for (const w of await window.lateEdition.watches()) await window.lateEdition.unwatch(w.id);
            let r = await window.lateEdition.run('a spikeable topic', { provider: 'fake', research: 1 });
            if (r.needsDecision) r = await window.lateEdition.answerVerify(r.editionId, false, { provider: 'fake', research: 1 });
            await window.lateEdition.watchEdition(r.editionId);
            await window.__leProbe.refreshWatches(false);
            window.__leProbe.openCaseFile();
            for (let i = 0; i < 40 && !document.querySelector('.casefile:not([hidden])'); i++)
              await new Promise(x => setTimeout(x, 50));
            const card = document.querySelector('.casefile');
            const spike = card.querySelector('[data-clear]');
            const run = card.querySelector('[data-run]');
            const out = {
              // A dead "Run it" now says out loud why it is dead.
              runExplainsItself: !!(run && /nothing to follow up|no new research|field desk is off/i.test(run.title)),
              spikeWarnsFirst: /do not come back/i.test(spike.title || ''),
              hasCheckNow: !!card.querySelector('#cfCheck'),
              // The offline stand-in invents example.com URLs, which 404, so a probe case
              // never has a real change on its spike. The enable rule is asserted here; the
              // two-click guard below is asserted against the button directly, because the
              // guard is what changed and it does not depend on there being pending work.
              disabledWithNothingPending: spike.disabled && run.disabled,
              pending: ((await window.lateEdition.watches())[0] || {}).pending.length,
            };
            spike.disabled = false;
            const label = spike.textContent;
            spike.click();
            out.firstClickArms = /throw them away/i.test(spike.textContent);
            out.firstClickIsNotTheAction = spike.dataset.armed === '1' && !spike.disabled;
            // And it disarms itself, so a stray click cannot leave a live trigger sitting there.
            await new Promise(x => setTimeout(x, 4300));
            out.disarmsItself = spike.textContent === label && spike.dataset.armed !== '1';
            for (const w of await window.lateEdition.watches()) await window.lateEdition.unwatch(w.id);
            card.hidden = true;
            return JSON.stringify(out);
          })()`),
        );
      }
      // Ida has to ASK, where you'll see it. The offer used to be a button at the bottom
      // of the front page, under the body and the sources, and David never found it.
      if (process.env.LE_DEBUG_RUN) {
        console.log(
          'LE_DEBUG offer:',
          await js(`(async () => {
            for (const w of await window.lateEdition.watches()) await window.lateEdition.unwatch(w.id);
            await window.__leProbe.refreshWatches(false);
            let r = await window.lateEdition.run('a followable topic', { provider: 'fake', research: 1 });
            if (r.needsDecision) r = await window.lateEdition.answerVerify(r.editionId, false, { provider: 'fake', research: 1 });
            window.__leProbe.applyResult(r);
            await new Promise(x => setTimeout(x, 300));
            const box = document.getElementById('watchOffer');
            const bar = document.querySelector('.appbar');
            const out = {
              filed: !!r.ok,
              asks: !!(box && !box.hidden),
              // It has to be near the top of the flow, not buried in the paper.
              rightUnderTheControls: !!(box && bar && box.previousElementSibling === bar),
              question: box ? box.querySelector('.of-q').textContent.trim() : null,
              hasYes: !!(box && box.querySelector('#ofYes')),
              hasNo: !!(box && box.querySelector('#ofNo')),
              saysItsFree: box ? /costs nothing/i.test(box.textContent) : false,
            };
            box.querySelector('#ofYes').click();
            for (let i = 0; i < 40 && !/On it/.test(box.textContent); i++) await new Promise(x => setTimeout(x, 100));
            out.confirms = /On it/.test(box.textContent);
            out.caseOpened = (await window.lateEdition.watches()).length;
            for (const w of await window.lateEdition.watches()) await window.lateEdition.unwatch(w.id);
            return JSON.stringify(out);
          })()`),
        );
      }
      // The field desk, end to end through the app: watch a filed story's sources, poll
      // them (free), and confirm the spike surfaces without anything having run.
      if (process.env.LE_DEBUG_RUN) {
        console.log(
          'LE_DEBUG field:',
          await js(`(async () => {
            // A research-backed edition, so the story actually has sourced URLs to watch.
            // (The earlier probe run uses research:0, which leaves nothing to follow.)
            const filed = await window.lateEdition.run('a watched topic', { provider: 'fake', research: 1 });
            const target = filed.editionId
              || (filed.needsDecision ? filed.editionId : null)
              || ((await window.lateEdition.editions())[0] || {}).id;
            if (!target) return JSON.stringify({ skipped: 'nothing filed' });
            if (filed.needsDecision) await window.lateEdition.answerVerify(target, false, { provider: 'fake', research: 1 });
            const ed = await window.lateEdition.edition(target);
            const urls = (((ed.stories || [])[0] || {}).sources || []).filter(s => s.url).length;
            const put = await window.lateEdition.watchEdition(target);
            await window.lateEdition.checkWatches();   // baseline
            const check = await window.lateEdition.checkWatches();
            const list = await window.lateEdition.watches();
            // Render it the way the app does on launch, rather than poking the DOM.
            await window.__leProbe.refreshWatches(true);
            const el = document.querySelector('.spike');
            const out = {
              sourcesWithUrls: urls,
              watched: put.ok ? put.watched : put.error,
              checkCostTokens: check.tokens,
              beatsWatched: list.length,
              panelShown: !!(el && !el.hidden),
              panelRows: el ? el.querySelectorAll('.sp').length : 0,
            };
            // The case file: the switch, the sources, and pulling one page off a case.
            document.getElementById('appCases').click();
            await new Promise(r2 => setTimeout(r2, 300));
            const cf = document.querySelector('.casefile');
            out.caseFileOpens = !!(cf && !cf.hidden);
            out.caseRows = cf ? cf.querySelectorAll('.cf').length : 0;
            out.sourcesListed = cf ? cf.querySelectorAll('.cf-srcs li').length : 0;
            out.hasSwitch = !!(cf && cf.querySelector('#cfOn'));
            out.hasDropCase = !!(cf && cf.querySelector('[data-drop]'));
            const x = cf && cf.querySelector('.cf-x');
            if (x) { x.click(); await new Promise(r2 => setTimeout(r2, 400)); }
            out.sourcesAfterRemovingOne = cf ? cf.querySelectorAll('.cf-srcs li').length : 0;
            // And the switch actually stops the checking.
            const sw = cf.querySelector('#cfOn');
            sw.checked = false; sw.dispatchEvent(new Event('change'));
            await new Promise(r2 => setTimeout(r2, 300));
            out.offStops = (await window.lateEdition.checkWatches()).beats.length === 0;
            await window.lateEdition.setFieldDesk(true);
            // Which desks a follow-up actually uses, and which it skips.
            const cases = await window.lateEdition.watches();
            if (cases[0]) {
              const run = await window.lateEdition.runWatch(cases[0].id, {});
              const ed = run.ok ? run.edition : (run.editionId ? await window.lateEdition.edition(run.editionId) : null);
              out.followUpDesks = ed
                ? [...new Set((ed.tokenUsage || []).map(u => u.role))].join(',')
                : 'run did not reach the press: ' + (run.error || (run.needsDecision ? 'stopped to ask' : '?'));
            }
            for (const w of await window.lateEdition.watches()) await window.lateEdition.unwatch(w.id);
            return JSON.stringify(out);
          })()`),
        );
      }
      // The stop switch survives a restart, so a halt set in an earlier session must show
      // up on launch with a way out — not two hidden buttons and a run that fails.
      console.log(
        'LE_DEBUG halt:',
        await js(`(async () => {
          const stop = document.getElementById('appStop'), res = document.getElementById('appResume');
          const before = { stopVisible: !stop.hidden, resumeVisible: !res.hidden, bar: !!document.getElementById('haltBar') };
          await window.lateEdition.halt();
          // Pretend this is a fresh launch with the switch already on.
          await window.__leProbe.paintHalt(true, true);
          const bar = document.getElementById('haltBar');
          const on = {
            resumeVisible: !res.hidden, stopHidden: stop.hidden,
            barShown: !!(bar && !bar.hidden),
            barOffersLift: !!(bar && bar.querySelector('#haltLift')),
            engineAgrees: await window.lateEdition.isHalted(),
          };
          // A run while halted must say it was the switch.
          const r = await window.lateEdition.run('anything', { provider: 'fake', research: 0 });
          on.runReportsHalted = !!r.halted;
          bar.querySelector('#haltLift').click();
          await new Promise(r2 => setTimeout(r2, 300));
          const after = {
            stillHalted: await window.lateEdition.isHalted(),
            barGone: !document.getElementById('haltBar') || document.getElementById('haltBar').hidden,
            stopBack: !stop.hidden,
          };
          return JSON.stringify({ before, on, after });
        })()`),
      );
      // Back issues: the list handler, and the drawer that opens onto it.
      console.log(
        'LE_DEBUG editions:',
        await js(`(async () => {
          const eds = await window.lateEdition.editions();
          document.getElementById('appBack').click();
          await new Promise(r => setTimeout(r, 300));
          const rows = document.querySelectorAll('.backissues .bi').length;
          // Deleting takes two clicks and goes to the recycle bin, not rm -rf.
          let armed = 'no delete button', after = null;
          const del = document.querySelector('.backissues [data-del]');
          if (del) {
            del.click();
            armed = del.textContent;
            del.click();
            await new Promise(r => setTimeout(r, 900));
            after = (await window.lateEdition.editions()).length;
          }
          const empty = document.querySelector('.backissues .bi-empty');
          document.getElementById('biClose').click();
          return JSON.stringify({
            filed: eds.length,
            newestFirst: eds.every((e, i) => i === 0 || eds[i - 1].id >= e.id),
            drawerRows: rows,
            emptyState: empty ? empty.textContent.slice(0, 60) : null,
            newest: eds[0] ? eds[0].id + ' — ' + eds[0].headline.slice(0, 40) : '(none)',
            // Deleting takes two clicks and goes to the recycle bin.
            deleteArms: armed,
            deletedOne: after !== null && after === eds.length - 1,
            countAfter: after,
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
//
// The renderer is loaded from source while the main process runs from dist/, so
// `npm run electron` (no rebuild) can pair a new interface with an old engine. That used
// to show up as a spray of "No handler registered" errors with no explanation. Every
// channel is recorded as it registers, and `le:api` lets the interface check before it
// calls — see `apiOk()` in the interface.
const CHANNELS: string[] = [];
const handle = (channel: string, fn: Parameters<typeof ipcMain.handle>[1]) => {
  CHANNELS.push(channel);
  ipcMain.handle(channel, fn);
};

/** What this build of the engine can do. */
handle('le:api', () => ({ channels: CHANNELS.slice() }));

/** The folder the newsroom lives in (where context/history is stored). */
handle('le:getRoot', () => newsroomRoot());

/** Open a folder picker; on choose, move the newsroom there and remember it. */
handle('le:pickRoot', async () => {
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
handle('le:notices', () => ({
  firstRun: FIRST_RUN_NOTICE,
  outputShort: OUTPUT_DISCLAIMER_SHORT,
  source: sourceLine(),
  apiBilling: API_BILLING_NOTICE,
  planBilling: PLAN_BILLING_NOTICE,
  accepted: readAppConfig().noticeAccepted === NOTICE_VERSION,
}));

/** Record that the first-run notice has been read, so it isn't shown again. */
handle('le:acceptNotice', () => {
  writeAppConfig({ ...readAppConfig(), noticeAccepted: NOTICE_VERSION });
  return true;
});

/**
 * Everything Setup needs about each agent in one call: whether it's ready, how it bills,
 * how far the integration has actually been proven, the exact commands to make it work,
 * and which of its models suits each desk. The panel used to hardcode Claude's aliases as
 * the recommendation for every provider; now the provider answers for itself.
 */
handle('le:detect', async () => {
  const m = await detectAll();
  return listProviders().map((p) => ({
    id: p.id,
    displayName: p.displayName,
    maturity: p.maturity ?? 'untested',
    blurb: p.blurb ?? '',
    manualOnly: p.manualOnly ?? '',
    setup: (p.setup ?? []).map((step, i) => ({
      i,
      text: step.text,
      url: step.url,
      command: step.command,
      note: step.note,
    })),
    models: p.capabilities.models ?? [],
    recommend: p.capabilities.recommend ?? {},
    webSearch: p.capabilities.webSearch,
    ...(m.get(p.id) ?? { installed: false, authenticated: false }),
  }));
});

/**
 * Open a setup page in the real browser.
 *
 * Only ever a URL that this build ships in a provider's own setup steps. The interface
 * asks by provider id and step number and the address is looked up here, so nothing the
 * page can say becomes something the operating system opens.
 */
handle('le:openSetupPage', (_e, providerId: string, stepIndex: number) => {
  const step = getProvider(providerId)?.setup?.[stepIndex];
  if (!step?.url) return { ok: false, error: 'No page for that step.' };
  if (!/^https:\/\//.test(step.url)) return { ok: false, error: 'Refusing a non-https address.' };
  shell.openExternal(step.url);
  return { ok: true, url: step.url };
});

/**
 * Open a real terminal window sitting at the command for a setup step.
 *
 * The thing that stopped the first person who was not a developer from ever getting this
 * running was not the command. It was not knowing a terminal existed, where to find one,
 * or what "run this" meant. So the app opens one, with the command already typed, and
 * they press Enter and watch it. It stays open afterwards so they can read what happened.
 *
 * As with the page above, the command is looked up from the provider definition by id and
 * step number. **Nothing typed in the interface is ever executed** — if this took a string
 * it would be a way to run anything on the machine, dressed up as a help button.
 */
handle('le:openTerminal', (_e, providerId: string, stepIndex: number) => {
  const step = getProvider(providerId)?.setup?.[stepIndex];
  if (!step?.command) return { ok: false, error: 'No command for that step.' };
  const cwd = existsSync(newsroomRoot()) ? newsroomRoot() : homedir();
  try {
    if (process.platform === 'win32') {
      // `start` needs a window title first, or it eats the next quoted argument as one.
      // /k keeps the window open after the command finishes so the output can be read.
      spawn('cmd.exe', ['/c', 'start', 'Late Edition setup', 'cmd.exe', '/k', step.command], {
        cwd,
        detached: true,
        stdio: 'ignore',
        windowsVerbatimArguments: false,
      }).unref();
    } else if (process.platform === 'darwin') {
      const escaped = step.command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      spawn(
        'osascript',
        [
          '-e',
          `tell application "Terminal" to do script "cd ${cwd} && ${escaped}"`,
          '-e',
          'tell application "Terminal" to activate',
        ],
        { detached: true, stdio: 'ignore' },
      ).unref();
    } else {
      // No single terminal exists on Linux; try the usual suspects and report if none took.
      const tried = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm'];
      let opened = false;
      for (const term of tried) {
        try {
          spawn(term, ['-e', 'bash', '-lc', `${step.command}; exec bash`], {
            cwd,
            detached: true,
            stdio: 'ignore',
          }).unref();
          opened = true;
          break;
        } catch {
          /* try the next one */
        }
      }
      if (!opened) return { ok: false, error: `No terminal found. Tried: ${tried.join(', ')}.` };
    }
    return { ok: true, command: step.command, cwd };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

/** The current per-role staff assignment (for the Setup panel). */
handle('le:staff', async () => {
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
    photo_desk: nr.staff.photoDesk ? pick(nr.staff.photoDesk) : { provider: 'unset', model: '' },
  };
});

interface RolePick {
  provider: string;
  model?: string;
}
/** Write staff.yaml from the Setup panel — this is how a user wires roles to their agents. */
handle('le:setStaff', async (_e, a: Record<string, RolePick>) => {
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
    '# The picture desk. Only runs when you switch it on; unset means it borrows the writers.',
    `photo_desk: ${line(a.photo_desk)}`,
    '',
  ].join('\n');
  writeFileSync(paths(root).staffFile, yaml, 'utf8');
  return true;
});

/** Brief the Chief → run the real pipeline, streaming every event to the renderer. */
handle(
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
      // An empty desk is the first thing a new user hits. It is a setup problem, not a
      // crash, and the app says so in character rather than printing "RUN FAILED".
      if (err instanceof StaffNotConfiguredError) {
        return { ok: false as const, needsStaffing: true as const, desk: err.deskLabel };
      }
      // The stop switch is a file that outlives the app, so a run can hit it in a session
      // that never pressed Stop. The interface needs to know it was the switch, not a crash.
      if (err instanceof PipelineHaltError) {
        return { ok: false as const, halted: true as const, editionId: err.editionId };
      }
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  },
);

/** The user's answer to the Chief's clarification → resume the paused edition and finish it. */
handle(
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
      // An empty desk is the first thing a new user hits. It is a setup problem, not a
      // crash, and the app says so in character rather than printing "RUN FAILED".
      if (err instanceof StaffNotConfiguredError) {
        return { ok: false as const, needsStaffing: true as const, desk: err.deskLabel };
      }
      // The stop switch is a file that outlives the app, so a run can hit it in a session
      // that never pressed Stop. The interface needs to know it was the switch, not a crash.
      if (err instanceof PipelineHaltError) {
        return { ok: false as const, halted: true as const, editionId: err.editionId };
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
handle('le:halt', () => {
  setHalt(newsroomRoot(), 'stopped from the app');
  return true;
});
handle('le:resume', () => {
  clearHalt(newsroomRoot());
  return true;
});
handle('le:isHalted', () => isHalted(newsroomRoot()));

/**
 * Your answer to the Chief's mid-run question. `true` sends the researcher back over that
 * story; `false` runs it as it stands, and the Editor's Log says so.
 */
handle(
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
      // An empty desk is the first thing a new user hits. It is a setup problem, not a
      // crash, and the app says so in character rather than printing "RUN FAILED".
      if (err instanceof StaffNotConfiguredError) {
        return { ok: false as const, needsStaffing: true as const, desk: err.deskLabel };
      }
      // The stop switch is a file that outlives the app, so a run can hit it in a session
      // that never pressed Stop. The interface needs to know it was the switch, not a crash.
      if (err instanceof PipelineHaltError) {
        return { ok: false as const, halted: true as const, editionId: err.editionId };
      }
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  },
);

/**
 * The outlets the paper can be written as, and the lengths it can run at — the picker's
 * options. One outlet carries the whole editorial personality (what it leads on, how it
 * cuts a headline, how it writes), so the interface needs exactly one control for it.
 */
handle('le:formats', () => ({
  outlets: OUTLETS.map((o) => ({
    id: o.id,
    label: o.label,
    kind: o.kind,
    hint: o.hint,
    blurb: o.blurb,
    // The interface shows the finished piece too, so it needs to know how this outlet
    // wants its citations rendered — not just how it wants to be written.
    citations: o.citations,
  })),
  lengths: Object.entries(LENGTHS).map(([id, l]) => ({ id, label: l.label })),
}));

/**
 * Write a finished story again in another shape. One writer call against reporting that is
 * already done and already checked — not a new edition, and it cannot add a source.
 */
handle(
  'le:rewrite',
  async (
    e,
    editionId: string,
    shape: CopyShape,
    slug?: string,
    opts: { provider?: string } = {},
  ) => {
    const send = (ev: LogEvent) => {
      if (!e.sender.isDestroyed()) e.sender.send('le:event', ev);
    };
    try {
      return {
        ok: true as const,
        ...(await rewriteStory({
          root: newsroomRoot(),
          editionId,
          slug,
          shape,
          // Rewrite was the one path with no provider override, so in a dry-run newsroom
          // (every desk unset) it failed where everything else fell back to the stand-in.
          forceProvider: opts?.provider || undefined,
          onEvent: send,
        })),
      };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  },
);

/**
 * The field desk.
 *
 * Watching costs nothing: adapters fetch and diff with no model involved, so a daily check
 * of every watched page is free. Tokens are only spent by `le:runWatch`, and only when the
 * user asks for it.
 */

/** Keep an eye on the pages a finished story came from. */
handle('le:watchEdition', async (_e, editionId: string, slug?: string) => {
  try {
    return { ok: true as const, ...(await watchEdition(newsroomRoot(), editionId, { slug })) };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
});

/** What the field desk is watching, and what is on the spike. */
handle('le:watches', () => listWatched(newsroomRoot()));

/** Poll every watched page. Free — no model is involved at any point. */
handle('le:checkWatches', () => {
  if (readAppConfig().fieldDesk === false) {
    return { beats: [], moved: 0, checkedAt: new Date().toISOString(), tokens: 0 as const };
  }
  return checkWatched(newsroomRoot());
});

/** Is the field desk on shift? Off means no checking and no spike. */
handle('le:fieldDesk', () => readAppConfig().fieldDesk !== false);
handle('le:setFieldDesk', (_e, on: boolean) => {
  writeAppConfig({ ...readAppConfig(), fieldDesk: on !== false });
  return on !== false;
});

/** Pull one source off a case. Removing the last one drops the case. */
handle('le:dropSource', (_e, beatId: string, sourceId: string) =>
  dropSource(newsroomRoot(), beatId, sourceId),
);

/** Stop watching a beat, or clear its spike without running anything. */
handle('le:unwatch', (_e, beatId: string) => unwatch(newsroomRoot(), beatId));
handle('le:clearSpike', (_e, beatId: string) => {
  clearSpike(newsroomRoot(), beatId);
  return true;
});

/**
 * Run an edition off what the field desk found. No researcher, no re-polling: the digging
 * was done when the original story ran, so this should cost a fraction of a fresh edition.
 */
handle('le:runWatch', async (e, beatId: string, opts: { shape?: CopyShape } = {}) => {
  const root = newsroomRoot();
  const send = (ev: LogEvent) => {
    if (!e.sender.isDestroyed()) e.sender.send('le:event', ev);
  };
  const beat = (await listWatched(root)).find((b) => b.id === beatId);
  if (!beat) return { ok: false as const, error: 'That beat is no longer being watched.' };
  if (!beat.pending.length) return { ok: false as const, error: 'Nothing has changed there yet.' };
  // Only the newest changes. A case left alone for a month accumulates dozens of diffs, and
  // handing all of them to the reporter is how a cheap follow-up becomes the week's most
  // expensive run. The rest stay on the spike.
  const signals = beat.pending.slice(-MAX_PER_RUN);
  try {
    const res = await runEdition({
      root,
      watchBeat: { beatId: beat.id, beatName: beat.name, signals },
      research: 0,
      shape: opts?.shape,
      clarify: false, // the desk knows what it is following up; there is nothing to ask
      askToVerify: true,
      onEvent: send,
    });
    clearSpike(root, beatId);
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
    if (err instanceof StaffNotConfiguredError) {
      return { ok: false as const, needsStaffing: true as const, desk: err.deskLabel };
    }
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
});

/** Every edition this newsroom has filed, newest first — the back-issues drawer. */
handle('le:editions', (): EditionSummary[] => listEditions(newsroomRoot()));

/** One past edition in full, so the front page can show it again without a rerun. */
handle('le:edition', (_e, editionId: string) => {
  try {
    const file = join(paths(newsroomRoot()).editionDir(editionId), 'edition.json');
    return JSON.parse(readFileSync(file, 'utf8')) as Edition;
  } catch {
    return null;
  }
});

/**
 * Delete a past edition.
 *
 * Goes to the OS recycle bin, not `rm -rf`. This is the user's own writing and their own
 * token spend; a misclick should be recoverable from the bin rather than gone.
 */
handle('le:deleteEdition', async (_e, editionId: string) => {
  const dir = paths(newsroomRoot()).editionDir(editionId);
  if (!existsSync(dir)) return { ok: false as const, error: 'That edition is already gone.' };
  try {
    await shell.trashItem(dir);
    return { ok: true as const, editionId };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
});

/** Open the finished paper in the user's real browser (a full-size, shareable view). */
handle('le:openPaper', (_e, editionId: string) => {
  const file = join(paths(newsroomRoot()).editionDir(editionId), 'edition.html');
  if (existsSync(file)) shell.openPath(file);
  return existsSync(file);
});

/** Read a finished edition's rendered HTML (for the in-window front-page view). */
handle('le:editionHtml', async (_e, editionId: string) => {
  const root = newsroomRoot();
  try {
    return readFileSync(join(paths(root).editionDir(editionId), 'edition.html'), 'utf8');
  } catch {
    return '';
  }
});
