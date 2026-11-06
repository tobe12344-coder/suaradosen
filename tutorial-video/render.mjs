// Renders index.html frame-by-frame with Playwright and encodes an MP4 with ffmpeg.
// Usage: node render.mjs [outDir] [workers]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] || path.join(here, 'out'));
const WORKERS = Number(process.argv[3] || 4);
fs.mkdirSync(outDir, { recursive: true });
const pageURL = 'file://' + path.join(here, 'index.html');

const run = (cmd, args, opts = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'inherit'], ...opts });
  p.on('close', c => c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`)));
  return p;
});

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(pageURL);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
  return page;
}

const browser = await chromium.launch();
const meta = await (await openPage(browser)).evaluate(() => ({ SFX: window.SFX, DUR: window.DUR, FPS: window.FPS }));
fs.writeFileSync(path.join(outDir, 'sfx.json'), JSON.stringify(meta));
const total = Math.round(meta.DUR * meta.FPS);
console.log(`rendering ${total} frames @${meta.FPS}fps with ${WORKERS} workers`);

const per = Math.ceil(total / WORKERS);
let done = 0;
const started = Date.now();
await Promise.all([...Array(WORKERS)].map(async (_, w) => {
  const from = w * per, to = Math.min(total, from + per);
  const page = await openPage(browser);
  const seg = path.join(outDir, `seg${w}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(meta.FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(meta.FPS), seg], { stdio: ['pipe', 'ignore', 'inherit'] });
  const closed = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg ' + c))));
  for (let f = from; f < to; f++) {
    await page.evaluate(t => window.render(t), f / meta.FPS);
    const img = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(img)) await new Promise(r => ff.stdin.once('drain', r));
    if (++done % 150 === 0) console.log(`  ${done}/${total} frames (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await closed;
  await page.close();
}));
await browser.close();

// audio
await run('node', [path.join(here, 'audio.mjs'), path.join(outDir, 'sfx.json'), path.join(outDir, 'audio.wav')], { stdio: 'inherit' });

// concat + mux
const list = path.join(outDir, 'segments.txt');
fs.writeFileSync(list, [...Array(WORKERS)].map((_, w) => `file 'seg${w}.mp4'`).join('\n'));
const final = path.join(outDir, 'SuaraKami-Tutorial.mp4');
await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', path.join(outDir, 'audio.wav'),
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
for (let w = 0; w < WORKERS; w++) fs.unlinkSync(path.join(outDir, `seg${w}.mp4`));
fs.unlinkSync(list);
console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${final}`);
