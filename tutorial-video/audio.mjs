// Synthesizes background music + sound effects into a WAV file.
// Usage: node audio.mjs <sfx.json> <out.wav>
import fs from 'node:fs';

const [, , sfxPath, outPath] = process.argv;
const { SFX, DUR } = JSON.parse(fs.readFileSync(sfxPath, 'utf8'));
const SR = 44100, N = Math.ceil(DUR * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const add = (i, l, r = l) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

// ---------------------------------------------------------------- music
const BPM = 96, beat = 60 / BPM, bar = beat * 4;
// Fmaj7 – G6 – Em7 – Am7 (2 bars each)
const chords = [[53, 57, 60, 64], [55, 59, 62, 64], [52, 55, 59, 62], [57, 60, 64, 67]];
const chordLen = bar * 2;
const musicEnd = DUR;

// pad
for (let c = 0; c * chordLen < musicEnd; c++) {
  const ch = chords[c % 4], t0 = c * chordLen, t1 = t0 + chordLen;
  for (const m of ch) {
    const f = mtof(m), f2 = f * 1.003;
    const s0 = Math.floor(t0 * SR), s1 = Math.min(N, Math.floor((t1 + 1.2) * SR));
    for (let i = s0; i < s1; i++) {
      const t = i / SR - t0;
      const env = Math.min(1, t / 0.9) * (t > chordLen ? Math.max(0, 1 - (t - chordLen) / 1.2) : 1);
      const v = (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f2 * t) * .8 + Math.sin(2 * Math.PI * f * 2 * t) * .15) * env * .016;
      add(i, v * 1.05, v * .95);
    }
  }
  // bass
  const bf = mtof(ch[0] - 12);
  for (let k = 0; k < 2; k++) {
    const bs = Math.floor((t0 + k * bar) * SR);
    for (let i = 0; i < SR * 1.6; i++) {
      const t = i / SR, env = Math.exp(-t * 1.8) * Math.min(1, t / .01);
      add(bs + i, Math.sin(2 * Math.PI * bf * t) * env * .11);
    }
  }
}
// arpeggio (eighth notes), starts after intro
const arpStart = 2.4;
for (let n = 0; ; n++) {
  const t0 = arpStart + n * beat / 2; if (t0 > musicEnd - 1) break;
  const c = Math.floor(t0 / chordLen), ch = chords[c % 4];
  const pat = [0, 2, 1, 3, 2, 1, 3, 2];
  const m = ch[pat[n % 8]] + 12;
  const f = mtof(m), s0 = Math.floor(t0 * SR), pan = n % 2 ? .7 : 1.3;
  for (let i = 0; i < SR * .7; i++) {
    const t = i / SR, env = Math.exp(-t * 6) * Math.min(1, t / .004);
    const v = (Math.sin(2 * Math.PI * f * t) + .25 * Math.sin(2 * Math.PI * f * 3 * t) * Math.exp(-t * 12)) * env * .045;
    add(s0 + i, v * pan, v * (2 - pan));
  }
}
// soft kick + hat from overview to outro
for (let k = 0; ; k++) {
  const t0 = 6 + k * beat; if (t0 > 92) break;
  const s0 = Math.floor(t0 * SR);
  let ph = 0;
  for (let i = 0; i < SR * .3; i++) {
    const t = i / SR, f = 45 + 75 * Math.exp(-t * 30); ph += 2 * Math.PI * f / SR;
    add(s0 + i, Math.sin(ph) * Math.exp(-t * 14) * .2);
  }
  const h0 = Math.floor((t0 + beat / 2) * SR); let prev = 0;
  for (let i = 0; i < SR * .05; i++) {
    const x = rnd(), hp = x - prev; prev = x;
    add(h0 + i, hp * Math.exp(-i / SR * 90) * .018, hp * Math.exp(-i / SR * 90) * .022);
  }
}
// master fades for music
for (let i = 0; i < N; i++) {
  const t = i / SR, g = Math.min(1, t / 1.5) * Math.min(1, (DUR - t) / 2.5);
  L[i] *= g; R[i] *= g;
}

// ---------------------------------------------------------------- sfx
function tone(t0, f0, f1, dur, decay, amp, type = 'sine') {
  const s0 = Math.floor(t0 * SR); let ph = 0;
  for (let i = 0; i < dur * SR; i++) {
    const t = i / SR, f = f0 + (f1 - f0) * Math.min(1, t / Math.max(dur * .3, .001));
    ph += 2 * Math.PI * f / SR;
    const w = type === 'sine' ? Math.sin(ph) : (Math.sin(ph) + Math.sin(ph * 2) * .3);
    add(s0 + i, w * Math.exp(-t * decay) * Math.min(1, t / .003) * amp);
  }
}
for (const e of SFX) {
  const s0 = Math.floor(e.t * SR);
  switch (e.type) {
    case 'click':
      tone(e.t, 1800, 1200, .06, 70, .22);
      for (let i = 0; i < SR * .015; i++) add(s0 + i, rnd() * Math.exp(-i / SR * 300) * .08);
      break;
    case 'key':
      tone(e.t, 2600 + (s0 % 400), 2200, .03, 160, .05);
      for (let i = 0; i < SR * .01; i++) add(s0 + i, rnd() * Math.exp(-i / SR * 500) * .03);
      break;
    case 'pop':
      tone(e.t, 520, 940, .18, 22, .2);
      break;
    case 'whoosh': {
      let y = 0; const d = .55, st = Math.floor((e.t - .2) * SR);
      for (let i = 0; i < d * SR; i++) {
        const t = i / SR, env = Math.sin(Math.PI * t / d) ** 2, a = .02 + .25 * (t / d);
        y += a * (rnd() - y);
        add(st + i, y * env * .5 * (1 - t / d * .4), y * env * .5 * (.6 + t / d * .4));
      }
      break;
    }
    case 'ding':
      tone(e.t, 800, 1200, .6, 6, .28);
      tone(e.t, 1600, 2400, .4, 10, .06);
      break;
    case 'chime':
      [440, 554.37, 659.25].forEach((f, k) => tone(e.t + k * .16, f, f, .9, 4, .16));
      break;
    case 'tts':
      [659.25, 880].forEach((f, k) => tone(e.t + k * .1, f, f, .5, 7, .12));
      break;
  }
}

// ---------------------------------------------------------------- write wav (with soft limiter)
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
const lim = x => Math.tanh(x * 1.1) * .95;
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(lim(L[i]) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(lim(R[i]) * 32767), 46 + i * 4);
}
fs.writeFileSync(outPath, buf);
console.log(`audio: ${DUR}s, ${SFX.length} sfx -> ${outPath}`);
