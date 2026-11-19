import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const isWatch = process.argv.includes('--watch');

const mainOptions = {
  entryPoints: [path.join(rootDir, 'src/main/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: path.join(rootDir, 'dist-electron/main/index.js'),
  external: ['electron', 'sherpa-onnx-node'],
  sourcemap: true,
};

const preloadOptions = {
  entryPoints: [path.join(rootDir, 'src/preload/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: path.join(rootDir, 'dist-electron/preload/index.js'),
  external: ['electron'],
  sourcemap: true,
};

async function run() {
  if (isWatch) {
    const mainCtx = await esbuild.context(mainOptions);
    const preloadCtx = await esbuild.context(preloadOptions);
    await Promise.all([mainCtx.watch(), preloadCtx.watch()]);
    console.log('[build-electron] Watching main & preload...');
  } else {
    await Promise.all([esbuild.build(mainOptions), esbuild.build(preloadOptions)]);
    console.log('[build-electron] Built main & preload successfully.');
  }
}

run().catch((err) => {
  console.error('[build-electron] Failed:', err);
  process.exit(1);
});
