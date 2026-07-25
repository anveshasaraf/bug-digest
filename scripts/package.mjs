// Zips dist/ into release/bug-digest-v<version>.zip for Chrome Web Store
// submission (or a GitHub Release). Run `npm run build` first.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const releaseDir = path.join(root, 'release');

if (!existsSync(dist)) {
  console.error('dist/ not found, run `npm run build` first.');
  process.exit(1);
}

const pkg = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(path.join(root, 'package.json'), 'utf8')));
const zipName = `bug-digest-v${pkg.version}.zip`;
const zipPath = path.join(releaseDir, zipName);

mkdirSync(releaseDir, { recursive: true });
rmSync(zipPath, { force: true });

execFileSync('zip', ['-r', '-X', zipPath, '.', '-x', '.*'], { cwd: dist, stdio: 'inherit' });

console.log(`\nWrote release/${zipName}`);
