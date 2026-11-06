# Video Tutorial SuaraKami (Motion Graphic)

Video panduan penggunaan SuaraKami langkah demi langkah (±100 detik, 1920×1080, 30 fps, dengan musik latar & efek suara).

## Isi video

| Waktu | Bagian |
|---|---|
| 0:00 | Intro |
| 0:06 | Cara kerja: Dashboard Dosen ↔ Kode Sesi ↔ Layar Subtitle & HP Mahasiswa |
| 0:14 | Langkah 1 — Buka Dashboard Dosen (catat kode sesi) |
| 0:23 | Langkah 2 — Jalankan aplikasi subtitle, masukkan kode, geser posisi |
| 0:34 | Langkah 3 — Tampilkan layar subtitle & mulai mikrofon |
| 0:47 | Langkah 4 — Atur tampilan (latar kaca, ukuran, warna, highlight kata kunci) |
| 0:57 | Langkah 5 — Mahasiswa mengirim pertanyaan lewat Mode TTS, dosen memutarnya |
| 1:11 | Langkah 6 — Kuis A/B/C/D, timer, attention flash, soundboard |
| 1:24 | Langkah 7 — Unduh notulensi PDF |
| 1:32 | Penutup & ringkasan |

## Cara membuat ulang

Membutuhkan Node.js, Playwright (Chromium) dan `ffmpeg`.

```bash
cd tutorial-video
node render.mjs out 4      # out = folder hasil, 4 = jumlah worker paralel
```

Hasil: `out/SuaraKami-Tutorial.mp4`.

- `index.html` — seluruh animasi. Buka `index.html?t=20` di browser untuk melihat frame pada detik ke-20.
  Teks tiap langkah ada di pemanggilan `txt(...)` per scene; waktu tiap scene ada di variabel `a`/`b`.
- `audio.mjs` — membuat musik latar & efek suara (klik, ketik, whoosh, ding) secara sintetis, tanpa file audio eksternal.
- `render.mjs` — merender frame demi frame lalu menggabungkannya dengan audio menjadi MP4.
