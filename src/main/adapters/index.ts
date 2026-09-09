import { folderAdapter } from './folder.js';
import { gitLocalAdapter } from './git_local.js';
import { githubAdapter } from './github.js';
import { registerAdapter } from './registry.js';
import { rssAdapter } from './rss.js';
import { webDiffAdapter } from './web_diff.js';

// Register the built-in source adapters. Import this module once at startup.
registerAdapter(rssAdapter);
registerAdapter(gitLocalAdapter);
registerAdapter(githubAdapter);
registerAdapter(webDiffAdapter);
registerAdapter(folderAdapter);

export { rssAdapter, gitLocalAdapter, githubAdapter, webDiffAdapter, folderAdapter };
export { getAdapter, listAdapters, registerAdapter } from './registry.js';
