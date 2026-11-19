import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function waitForUrl(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for ${url}`));
        } else {
          setTimeout(tick, 300);
        }
      });
    };
    tick();
  });
}

function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: true });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function main() {
  // 1. Ensure runtime is unpacked if archives exist
  await runCommand('node', ['scripts/prepare-runtime.mjs', '--ensure'], rootDir);

  // 2. Build electron main & preload
  await runCommand('node', ['scripts/build-electron.mjs'], rootDir);

  // 3. Start Vite dev server
  const viteProc = spawn('npx', ['vite', '--port', '5173', '--strictPort'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  // 4. Watch electron main/preload
  const esbuildProc = spawn('node', ['scripts/build-electron.mjs', '--watch'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  await waitForUrl('http://localhost:5173');

  // 5. Launch Electron
  const electronProc = spawn('npx', ['electron', '.'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
    },
  });

  const cleanup = () => {
    try { viteProc.kill(); } catch {}
    try { esbuildProc.kill(); } catch {}
    try { electronProc.kill(); } catch {}
  };

  electronProc.on('exit', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[dev] Error:', err);
  process.exit(1);
});
