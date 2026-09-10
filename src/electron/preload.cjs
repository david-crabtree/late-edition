// CommonJS preload — Electron loads this reliably (ESM preloads are flaky). It exposes a
// small, safe `window.lateEdition` bridge to the renderer; its presence turns on "real mode"
// in the newsroom UI. No Node or engine internals leak through — only these narrow calls.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lateEdition', {
  /** The disclaimers (first-run, output, billing) + whether the first-run one was read. */
  notices: () => ipcRenderer.invoke('le:notices'),
  /** Record that the first-run notice has been read. */
  acceptNotice: () => ipcRenderer.invoke('le:acceptNotice'),
  /** Which agent providers are ready, and how they bill (plan usage vs metered API). */
  detect: () => ipcRenderer.invoke('le:detect'),
  /** The current per-role staff assignment. */
  staff: () => ipcRenderer.invoke('le:staff'),
  /** Save a per-role staff assignment (writes staff.yaml). */
  setStaff: (a) => ipcRenderer.invoke('le:setStaff', a),
  /** The folder where this newsroom (config, staff, editions, history) lives. */
  getRoot: () => ipcRenderer.invoke('le:getRoot'),
  /** Open a folder picker to choose where the newsroom is stored; returns the new path. */
  pickRoot: () => ipcRenderer.invoke('le:pickRoot'),
  /** Brief the Chief -> run the real pipeline. Resolves with the finished edition + usage, or a clarification request. */
  run: (brief, opts) => ipcRenderer.invoke('le:run', brief, opts || {}),
  /** Answer the Chief's clarification -> resume the paused edition and finish it. */
  answerClarification: (editionId, answer, opts) =>
    ipcRenderer.invoke('le:answerClarification', editionId, answer, opts || {}),
  /** Answer the Chief's mid-run question: true digs again, false runs it as it stands. */
  answerVerify: (editionId, verify, opts) =>
    ipcRenderer.invoke('le:answerVerify', editionId, verify, opts || {}),
  /** Stop switch: halt all agent calls / lift the halt / query it. */
  halt: () => ipcRenderer.invoke('le:halt'),
  resume: () => ipcRenderer.invoke('le:resume'),
  isHalted: () => ipcRenderer.invoke('le:isHalted'),
  /** The formats, tones and lengths the copy desk can write in. */
  formats: () => ipcRenderer.invoke('le:formats'),
  /** Write a finished story again in another shape (one writer call, no new reporting). */
  rewrite: (editionId, shape, slug) => ipcRenderer.invoke('le:rewrite', editionId, shape, slug),
  /** The field desk: watch a story's sources, see what moved, run a follow-up. */
  watchEdition: (editionId, slug) => ipcRenderer.invoke('le:watchEdition', editionId, slug),
  watches: () => ipcRenderer.invoke('le:watches'),
  checkWatches: () => ipcRenderer.invoke('le:checkWatches'),
  unwatch: (beatId) => ipcRenderer.invoke('le:unwatch', beatId),
  clearSpike: (beatId) => ipcRenderer.invoke('le:clearSpike', beatId),
  runWatch: (beatId, opts) => ipcRenderer.invoke('le:runWatch', beatId, opts || {}),
  /** Every edition this newsroom has filed, newest first. */
  editions: () => ipcRenderer.invoke('le:editions'),
  /** One past edition in full, to show it again without rerunning it. */
  edition: (editionId) => ipcRenderer.invoke('le:edition', editionId),
  /** Open the finished paper in the user's real browser. */
  openPaper: (editionId) => ipcRenderer.invoke('le:openPaper', editionId),
  /** The rendered HTML of a finished edition (for the front-page view). */
  editionHtml: (editionId) => ipcRenderer.invoke('le:editionHtml', editionId),
  /** Subscribe to live pipeline events. Returns an unsubscribe function. */
  onEvent: (cb) => {
    const h = (_e, ev) => cb(ev);
    ipcRenderer.on('le:event', h);
    return () => ipcRenderer.removeListener('le:event', h);
  },
});
