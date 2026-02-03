import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const projectRoot = path.resolve(import.meta.dirname, '..');
const extensionRoot = path.join(projectRoot, 'extension');
const outDir = path.join(projectRoot, 'dist', 'extension');

const isWatch = process.argv.includes('--watch');
const isRelease = process.argv.includes('--release');

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function copyDir(srcDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function buildOnce() {
  await rmrf(outDir);
  await fs.mkdir(outDir, { recursive: true });

  // Copy static extension files (everything except src/)
  const entries = await fs.readdir(extensionRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'src') continue;
    const srcPath = path.join(extensionRoot, entry.name);
    const destPath = path.join(outDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }

  await build({
    entryPoints: {
      background: path.join(extensionRoot, 'src', 'background.ts'),
      content: path.join(extensionRoot, 'src', 'content.ts'),
      popup: path.join(extensionRoot, 'src', 'popup.ts'),
      options: path.join(extensionRoot, 'src', 'options.ts')
    },
    outdir: outDir,
    bundle: true,
    entryNames: '[name]',
    format: 'iife',
    sourcemap: isRelease ? false : true,
    minify: isRelease,
    target: ['chrome120'],
    logLevel: 'info'
  });
}

if (isWatch) {
  // Watch mode: esbuild watch + static file copy on each rebuild.
  // For simplicity, rebuild everything on changes.
  let timer;
  const rebuild = async () => {
    try {
      await buildOnce();
    } catch (err) {
      console.error(err);
    }
  };
  await rebuild();
  await fs.watch(extensionRoot, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 100);
  });
  console.log('Watching…');
} else {
  await buildOnce();
}
