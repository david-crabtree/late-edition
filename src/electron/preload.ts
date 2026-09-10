import { contextBridge, ipcRenderer } from 'electron';

/**
 * The bridge the renderer sees as `window.lateEdition`. Its presence is how the newsroom
 * prototype knows it's running in the app ("real mode") vs. as a standalone sim. No Node
 * or engine internals are exposed — only these narrow, safe calls.
 */
contextBridge.exposeInMainWorld('lateEdition', {
  /** Which agent providers are ready, and how they bill (plan usage vs metered API). */
  detect: () => ipcRenderer.invoke('le:detect'),
  /** The current per-role staff assignment. */
  staff: () => ipcRenderer.invoke('le:staff'),
  /** Save a per-role staff assignment (writes staff.yaml). */
  setStaff: (a: unknown) => ipcRenderer.invoke('le:setStaff', a),
  /** Brief the Chief → run the real pipeline. Resolves with the finished edition. */
  run: (brief: string, opts?: { provider?: string; research?: number }) =>
    ipcRenderer.invoke('le:run', brief, opts ?? {}),
  /** The rendered HTML of a finished edition (for the front-page view). */
  editionHtml: (editionId: string) => ipcRenderer.invoke('le:editionHtml', editionId),
  /** Subscribe to live pipeline events. Returns an unsubscribe function. */
  onEvent: (cb: (ev: unknown) => void) => {
    const h = (_e: unknown, ev: unknown) => cb(ev);
    ipcRenderer.on('le:event', h);
    return () => ipcRenderer.removeListener('le:event', h);
  },
});
