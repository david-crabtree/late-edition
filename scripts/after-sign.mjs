// Ad-hoc sign the macOS app after electron-builder has packaged it.
//
// Late Edition is not notarised and will not be: Apple charges for a developer account and
// this is a free project. But an Apple Silicon Mac does something worse than warn about an
// app with no signature at all — it reports it as **damaged** and refuses to open it, which
// reads as a broken download rather than a security prompt.
//
// An ad-hoc signature (`codesign --sign -`) has no certificate and proves nothing about who
// built it. What it does is satisfy the arm64 loader, so the app opens and the user gets the
// ordinary Gatekeeper prompt they can actually get past: right click, Open, Open.
//
// This runs only on macOS. On any other platform `codesign` does not exist, and a packaging
// run for Windows or Linux has no .app to sign, so it exits quietly.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = join(context.appOutDir, `${appName}.app`);
  if (!existsSync(appPath)) {
    console.warn(`afterSign: no app at ${appPath}; nothing to sign.`);
    return;
  }

  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
    console.log(`afterSign: ad-hoc signed ${appName}.app`);
  } catch (err) {
    // Not fatal. An unsigned build still installs on Intel and the release notes say what
    // to expect; failing the whole release over a signature that proves nothing would be
    // the wrong trade.
    console.warn(`afterSign: could not ad-hoc sign — ${err instanceof Error ? err.message : err}`);
  }
}
