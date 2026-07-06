# HYLUXTIC — Living Digital Spaces

Halaman showcase 3D interaktif untuk Hyluxtic ($HLUX): robot AI worker **UNIT-01**
dirender real-time di browser dengan React Three Fiber, terinspirasi holoo.dev
tapi dengan bloom post-processing, ekspresi wajah (morph targets), material
iridescent, 4 tema warna, autopilot demo, dan shortcut keyboard.

## Menjalankan

```bash
bun install
bun run dev        # dev server + HMR di http://localhost:3000
```

Produksi: `bun run start`.

## Struktur

- `index.ts` — server `Bun.serve()` (route `/` + `/robot.glb`)
- `index.html` — shell + font (Michroma, Space Mono)
- `src/App.tsx` — halaman: nav, hero, dek kontrol, capabilities, engines
- `src/scene/Stage.tsx` — Canvas R3F: lampu neon, Environment/Lightformer,
  ring proyektor + beam, Grid, Sparkles, ContactShadows, OrbitControls,
  EffectComposer (Bloom + Vignette)
- `src/scene/Robot.tsx` — model GLB, material dua-tone iridescent per tema,
  animasi skeletal (crossfade, one-shot vs loop), morph ekspresi wajah,
  lean mengikuti kursor
- `src/config.ts` — daftar gerakan, ekspresi, tema, playlist demo
- `aset/robot.glb` — RobotExpressive (three.js examples) — model contoh resmi three.js

## Kontrol

- Drag = orbit · scroll = zoom · klik robot = wave (plus dia menyapa)
- Keyboard `1`–`0` = gerakan, `Z X C V` = ekspresi wajah
- Panel kanan: **transmit** (ketik perintah EN/ID — "dance", "joget", "who are you",
  "help") / motion / expression / spectrum (tema) / autopilot
- UNIT-01 bersuara via Web Speech API (tombol 🔊 untuk mute) + SFX WebAudio prosedural
- Tombol **⛶ capture** di kanvas mengunduh PNG frame saat ini

## File tambahan

- `src/commands.ts` — interpreter perintah rule-based (EN + ID), gratis & lokal
- `src/voice.ts` — speechSynthesis robotik + blip/chirp WebAudio (tanpa file audio)
- `src/wallet.ts` — connect Phantom + bayar SOL (non-custodial)
- `src/shared/economy.ts` — paket kredit (satu sumber kebenaran server+frontend)
- `src/server/brain.ts` — otak AI **gratis**: Groq free tier / Gemini free tier / Ollama lokal
- `src/server/solana.ts` — verifikasi pembayaran on-chain via RPC publik gratis
- `src/server/db.ts` — ledger kredit `bun:sqlite` (akun, pembayaran, kuota gratis)

## Otak AI gratis (pilih satu, lihat `.env.example`)

1. **Groq** (rekomendasi) — daftar gratis tanpa kartu di console.groq.com → `GROQ_API_KEY`
2. **Gemini** — aistudio.google.com/apikey → `GEMINI_API_KEY`
3. **Ollama** — full lokal tanpa key: `OLLAMA_URL=http://localhost:11434`

Tanpa key, UNIT-01 tetap jalan mode rule-based. Perintah gestur (dance, punch, tema)
selalu diproses lokal & gratis; hanya percakapan bebas yang lewat AI dan dimeter.

## Pay-per-use

5 pesan AI gratis (per wallet / per IP), lalu bayar SOL via Phantom langsung ke
`TREASURY_WALLET` — diverifikasi on-chain, kredit dicatat di SQLite. Paket:
0.01 SOL = 30 pesan · 0.05 = 180 · 0.2 = 900.

Server jalan di **port 3012**. Mode produksi (`bun run start`) mematikan HMR.
Sebelum launching pump.fun: isi `TOKEN_CA` + `PUMP_URL` di `.env`, ganti link
sosial di `src/App.tsx` (konstanta `SOCIALS`), dan deploy ke domain publik.
