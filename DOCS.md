# HYLUXTIC — Dokumentasi Teknis

> Living digital infrastructure on Solana. Dokumen ini menjelaskan seluruh
> sistem: arsitektur, scene 3D, otak AI, ekonomi pay-per-use, API, widget
> embed, konfigurasi, dan prosedur launch.

---

## Daftar Isi

1. [Ringkasan](#1-ringkasan)
2. [Arsitektur](#2-arsitektur)
3. [Struktur Proyek](#3-struktur-proyek)
4. [Scene 3D](#4-scene-3d)
5. [Otak AI (Gratis)](#5-otak-ai-gratis)
6. [Ekonomi Pay-Per-Use](#6-ekonomi-pay-per-use)
7. [Referensi API](#7-referensi-api)
8. [Widget Embed](#8-widget-embed)
9. [Konfigurasi Environment](#9-konfigurasi-environment)
10. [Menjalankan & Deploy](#10-menjalankan--deploy)
11. [Checklist Launch pump.fun](#11-checklist-launch-pumpfun)
12. [Troubleshooting](#12-troubleshooting)
13. [Kredit & Lisensi](#13-kredit--lisensi)

---

## 1. Ringkasan

HYLUXTIC adalah platform "Living Digital Spaces": mengubah website statis
menjadi ruang 3D hidup yang dihuni AI worker. Produk saat ini:

- **UNIT-01** — AI worker holografik 3D yang dirender real-time di browser:
  animasi skeletal, ekspresi wajah, suara, dan percakapan AI dengan ingatan.
- **Pay-per-use** — pengunjung mendapat 5 pesan AI gratis, lalu membayar SOL
  (atau $HLUX setelah launch) langsung ke treasury — non-custodial,
  diverifikasi on-chain.
- **Widget embed** — satu tag `<script>` menempatkan UNIT-01 di website mana
  pun; pemakaian menagih kredit wallet pemilik situs.

Prinsip teknis: **semua backend gratis** (Bun + SQLite + LLM free-tier + RPC
publik Solana), tanpa layanan berbayar satu pun.

---

## 2. Arsitektur

```
                        Browser (React 19)
   ┌──────────────────────────────────────────────────────┐
   │  index.html  ── App.tsx (landing + dek kontrol)      │
   │  embed.html  ── EmbedApp.tsx (widget kompak)         │
   │       │                                              │
   │  React Three Fiber ── Stage.tsx (panggung UNIT-01)   │
   │                    ── HeroOrnament.tsx (Holo-Core)   │
   │                    ── Robot.tsx (GLB + animasi)      │
   │  wallet.ts ── Phantom (connect, bayar SOL/SPL)       │
   └──────────────┬───────────────────────────────────────┘
                  │ fetch /api/*
   ┌──────────────▼───────────────────────────────────────┐
   │  Bun.serve (index.ts, port 3012)                     │
   │  ├── brain.ts   → Groq / Gemini / Ollama (gratis)    │
   │  ├── solana.ts  → verifikasi tx via RPC publik       │
   │  └── db.ts      → bun:sqlite (hyluxtic.sqlite)       │
   │       tabel: accounts · payments · messages · ip_free│
   └──────────────────────────────────────────────────────┘
                  │
        Cloudflare Tunnel (HTTPS publik, gratis)
```

**Alur chat**: input pengguna → `commands.ts` mencoba rule lokal (gestur,
tema — gratis & instan) → kalau bukan perintah, `POST /api/chat` → server cek
kuota/kredit → ambil riwayat dari SQLite → panggil LLM → jawaban { reply,
move, expression } → robot bergerak & bicara → riwayat disimpan.

**Alur bayar**: klik paket → Phantom kirim SOL/SPL ke `TREASURY_WALLET` →
frontend kirim signature ke `POST /api/verify-payment` → server ambil
transaksi dari RPC, validasi (tujuan, pengirim, jumlah, umur < 2 jam, belum
pernah ditebus) → kredit ditambahkan ke SQLite.

---

## 3. Struktur Proyek

```
tridi/
├── index.ts                  # server Bun: rute halaman + API
├── index.html                # entri landing page
├── embed.html                # entri widget embed
├── src/
│   ├── App.tsx               # halaman utama: hero, stage, token, roadmap…
│   ├── config.ts             # gerakan, ekspresi, tema, playlist demo
│   ├── commands.ts           # interpreter rule-based EN+ID (matched flag)
│   ├── voice.ts              # speechSynthesis + SFX WebAudio prosedural
│   ├── wallet.ts             # Phantom: connect, paySol, payToken (SPL)
│   ├── index.css             # design system lengkap
│   ├── scene/
│   │   ├── Stage.tsx         # Canvas utama: lampu, ring proyektor, bloom
│   │   ├── Robot.tsx         # GLB, material, animasi, morph, lean kursor
│   │   └── HeroOrnament.tsx  # Holo-Core: gyroscope iridescent di hero
│   ├── embed/
│   │   ├── EmbedApp.tsx      # UI widget kompak
│   │   ├── embed.css         # gaya widget
│   │   ├── embed.js          # loader vanilla (injeksi iframe)
│   │   └── embed-main.tsx    # mount widget
│   ├── server/
│   │   ├── brain.ts          # LLM gratis: Groq > Gemini > Ollama + persona
│   │   ├── solana.ts         # verifikasi SOL & SPL via JSON-RPC
│   │   └── db.ts             # SQLite: akun, pembayaran, riwayat, stats
│   └── shared/
│       └── economy.ts        # paket kredit (dipakai server & frontend)
├── aset/
│   ├── robot.glb             # RobotExpressive (three.js examples)
│   └── og.png                # gambar share 1200×630
├── scripts/backup.sh         # backup SQLite (cron tiap jam)
├── .env.example              # template konfigurasi
└── DOCS.md                   # dokumen ini
```

---

## 4. Scene 3D

### Panggung UNIT-01 (`Stage.tsx`)

| Elemen | Detail |
|---|---|
| Kamera | posisi `[0, 2.0, 7.8]`, fov 38, OrbitControls (auto-rotate 0.55, polar dikunci) |
| Model | `robot.glb` dinormalisasi ke tinggi 3.1 unit, kaki di y=0 |
| Material | dua-tone: shell `MeshPhysicalMaterial` iridescent (metalness .85, clearcoat 1, iridescence .85) + rangka gunmetal + wajah/sendi emissive (menyala kena bloom) |
| Cahaya | ambient .45, directional, 2 point light warna tema, `Environment` 3 `Lightformer` |
| Proyektor | ring torus berdenyut + beam silinder additive berputar |
| Lantai | `Grid` drei infinite dengan fade + `ContactShadows` |
| Post-processing | `Bloom` (mipmapBlur, threshold .72) + `Vignette` |
| Animasi | 14 clip GLB; one-shot pakai `LoopOnce`+`clampWhenFinished`, crossfade .3s; event `finished` → kembali Idle |
| Ekspresi | morph target `Angry/Surprised/Sad` di-lerp per frame (eksponensial, k=8) |
| Interaksi | klik = Wave; badan lean mengikuti kursor (grup luar, tidak bentrok mixer) |

### UNIT-02 — drone hologram prosedural (`Drone.tsx`)

Worker kedua yang **dibangun 100% dari kode** — tanpa file model, tanpa aset
eksternal (identitas visual milik sendiri, ukuran nyaris nol):

- **Chassis**: kepala kotak + torso silinder 8-sisi yang meruncing ke bawah
  (gaya hologram, tanpa kaki), lengan artikulasi 2 sendi, antena berdenyut,
  ring pinggang emissive, beam thruster additive di bawah ujung.
- **Layar wajah hidup**: `CanvasTexture` 256×128 digambar ulang real-time —
  mata & mulut animasi per ekspresi (Neutral/Angry/Surprised/Sad), kedip
  otomatis tiap ~3.7 detik, pupil mengikuti kursor, senyum "bernafas".
  Saat Death: layar mati menyisakan satu garis statik redup.
- **Gestur prosedural** (dipetakan ke nama clip yang sama dengan UNIT-01,
  jadi tombol, keyboard, autopilot, dan otak AI bekerja tanpa perubahan):
  Wave, Yes (angguk), No (geleng), ThumbsUp, Punch (jab + lunge), Jump
  (squash-stretch pop), Dance (loop), Walking/Running (patroli orbit),
  Death (power-down: tenggelam ke ring, lampu padam, reboot saat move baru).
  Semua sendi di-damping eksponensial → transisi selalu halus.
- Ganti worker: tombol **WORKER** di dek (persist di `localStorage`), atau
  `data-worker="unit02"` di widget embed. Persona AI ikut berubah
  (UNIT-02 lebih "cocky", didefinisikan di `brain.ts`).

### Holo-Core hero (`HeroOrnament.tsx`)

Canvas kedua yang ringan (tanpa post-processing, dpr max 1.5, alpha):
icosahedron iridescent berdenyut di dalam 3 ring gyroscope additive dengan
kecepatan/kemiringan berbeda, 3 satelit mengorbit, wireframe shell, Sparkles,
parallax pointer. Warna mengikuti tema aktif. Disembunyikan < 1020px.

### Tema

4 preset (`spectra/violet/aurum/verdant`) mengubah sekaligus: CSS variable
halaman, lampu scene, material robot, ring proyektor, grid, dan Holo-Core.

---

## 5. Otak AI (Gratis)

Prioritas provider (di `brain.ts`, dipilih otomatis dari env):

| # | Provider | Env | Gratis | Catatan |
|---|---|---|---|---|
| 1 | Groq | `GROQ_API_KEY` | ~14.400 req/hari | Llama 3.3 70B, sangat cepat — **rekomendasi** |
| 2 | Gemini | `GEMINI_API_KEY` | kuota harian | `gemini-2.0-flash` default |
| 3 | Ollama | `OLLAMA_URL` | tak terbatas | lokal, tanpa key; model 3B cukup di 8GB RAM |
| — | Rule-based | (tanpa env) | selamanya | perintah gestur tetap jalan |

- **Persona** UNIT-01 di system prompt: witty, bilingual (balas sesuai bahasa
  user), tahu fakta Hyluxtic/$HLUX, tolak nasihat finansial.
- **Output terstruktur**: LLM wajib membalas JSON
  `{reply, move, expression}`; `sanitize()` memvalidasi terhadap daftar clip
  & morph yang sah, fallback aman kalau JSON rusak.
- **Ingatan**: 12 giliran terakhir per `session_key` (wallet, atau `ip:<ip>`)
  dikirim sebagai riwayat; disimpan maksimal 60 giliran per sesi (dipangkas
  otomatis). Wallet = ingatan lintas kunjungan ("Welcome back").
- **Degradasi**: provider error → jawab mode rule, tidak pernah crash.

---

## 6. Ekonomi Pay-Per-Use

### Kuota & paket (di `src/shared/economy.ts` — satu sumber kebenaran)

- Gratis: **5 pesan AI** per wallet (atau per IP tanpa wallet).
- Paket: **Spark** 0.01 SOL = 30 pesan · **Surge** 0.05 = 180 ·
  **Overdrive** 0.2 = 900. Jumlah tak cocok paket → tarif 350.000
  lamports/kredit.
- Perintah gestur/tema tidak pernah dimeter (diproses lokal).

### Verifikasi SOL (`verifyTransfer`)

1. `getTransaction` (jsonParsed, confirmed) via RPC publik.
2. Validasi: tidak error on-chain, umur < 2 jam, instruksi `system transfer`
   dengan `source == wallet pembeli` dan `destination == TREASURY_WALLET`.
3. Signature disimpan sebagai primary key → **anti-replay**.

### Verifikasi $HLUX (`verifyTokenTransfer`)

Membandingkan `preTokenBalances`/`postTokenBalances` untuk
`mint == HLUX_MINT` dan `owner == TREASURY_WALLET` — tahan terhadap
`transfer` vs `transferChecked`, cocok untuk token pump.fun (6 desimal).
Kredit = `floor(jumlah / HLUX_PER_CREDIT)`. Set `HLUX_PER_CREDIT` lebih murah
dari tarif SOL untuk memberi diskon (utilitas token).

### Skema database (`hyluxtic.sqlite`)

```sql
accounts (wallet PK, credits, free_used, created_at)
payments (signature PK, wallet, lamports, credits, created_at, token)  -- token: SOL|HLUX
messages (id PK, session_key, role, content, created_at)               -- ingatan
ip_free  (ip PK, used)                                                 -- kuota gratis tanpa wallet
```

---

## 7. Referensi API

Base: `http://localhost:3012` (dev). Semua respons JSON.

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/` | Landing page |
| GET | `/embed` | Halaman widget (query: `owner`, `theme`) |
| GET | `/embed.js` | Loader widget (CORS `*`) |
| GET | `/robot.glb` · `/og.png` | Aset statis |
| GET | `/api/config` | Konfigurasi publik: treasury, rpc, packages, freeMessages, tokenCa, pumpUrl, aiProvider, hluxMint/PerCredit/Decimals |
| GET | `/api/account?wallet=` | `{credits, freeLeft, msgCount}` — auto-create akun |
| GET | `/api/stats` | `{aiMessages, operators, solIn, payments}` — transparansi live |
| GET | `/health` | `{ok, uptime, aiProvider, treasury, db}` — untuk monitoring |
| GET | `/api/history?wallet=` | Dashboard operator: kredit, pemakaian, daftar pembayaran |
| POST | `/api/chat` | Body `{message, wallet?, worker?}` → `{source:"ai", reply, move, expression, remaining}` · `{source:"rules"}` · **402** `{error:"connect_wallet"\|"no_credits"}` · **429** rate limit (20/menit/IP) |
| POST | `/api/chat/stream` | Sama seperti `/api/chat` tapi **SSE**: event `meta {move, expression}` → `token {text}`* → `done {reply, remaining}` / `error`. Streaming token asli di Groq; Gemini/Ollama buffered lewat protokol yang sama |
| POST | `/api/verify-payment` | Body `{signature, wallet, token?:"SOL"\|"HLUX"}` → `{ok, creditsAdded, credits}` · 409 `already_redeemed` · 400 alasan gagal |

Contoh:

```bash
curl -X POST https://DOMAIN/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"halo unit-01!","wallet":"<pubkey>"}'
```

---

## 8. Widget Embed

Pasang di website mana pun:

```html
<script src="https://DOMAIN/embed.js"
        data-owner="WALLET_PEMILIK_SITUS" data-theme="spectra"></script>
```

| Atribut | Default | Fungsi |
|---|---|---|
| `data-owner` | — | Wallet yang ditagih untuk pemakaian AI (pemilik situs top-up di situs utama) |
| `data-theme` | `spectra` | `spectra` · `violet` · `aurum` · `verdant` |
| `data-worker` | `unit01` | `unit01` (robot klasik) · `unit02` (drone hologram) |
| `data-width` / `data-height` | 380px / 540px | Ukuran iframe |

Tanpa `data-owner`, pengunjung memakai kuota gratis per-IP. Kredit habis →
UNIT-01 menampilkan pesan agar pemilik situs top-up. Badge "◈ HYLUXTIC" di
widget menaut balik ke situs utama (loop pemasaran).

---

## 9. Konfigurasi Environment

Salin `.env.example` → `.env` (Bun memuatnya otomatis; tidak ikut git).

| Variabel | Wajib | Deskripsi |
|---|---|---|
| `GROQ_API_KEY` | salah satu | Otak AI via Groq (rekomendasi) |
| `GEMINI_API_KEY` | dari tiga | Otak AI via Google |
| `OLLAMA_URL` (+`OLLAMA_MODEL`) | ini | Otak AI lokal |
| `TREASURY_WALLET` | untuk bayar | Alamat Solana penerima; kosong = top-up nonaktif |
| `SOLANA_RPC` | tidak | Default RPC publik mainnet |
| `TOKEN_CA` / `PUMP_URL` | saat launch | Ditampilkan di seksi token |
| `HLUX_MINT` / `HLUX_PER_CREDIT` / `HLUX_DECIMALS` | pasca-launch | Mengaktifkan bayar $HLUX |
| `NODE_ENV=production` | prod | Mematikan HMR |

---

### Fitur klien lanjutan

- **Streaming + wajah bicara**: jawaban AI mengalir kata-per-kata ke subtitle;
  selama streaming/bicara, mulut UNIT-02 beranimasi (state `talking`).
- **Input suara**: tombol 🎙 (Web Speech Recognition, `id-ID`/`en-US`
  otomatis) — hasil ucapan langsung dikirim ke worker.
- **Share**: tombol ⤴ membagikan PNG frame via Web Share API (mobile) atau
  tweet intent (desktop). ⛶ mengunduh PNG.
- **Mobile Phantom**: tanpa provider ter-inject di HP, tombol connect
  membuka situs di in-app browser Phantom via deeplink `phantom.app/ul/browse`.
- **Governor performa**: bila FPS bertahan < 36, scene turun ke mode eco
  (dpr 1, tanpa antialias/bloom, partikel dikurangi) — HUD menampilkan "eco".
- **Dashboard operator**: klik chip wallet di nav — kredit, pemakaian,
  tabel pembayaran dengan link Solscan per transaksi.

### Testing & CI

`bun test` — 22 test untuk logika ekonomi (pencocokan paket/toleransi/tarif),
interpreter perintah (EN+ID), dan pengerasan output LLM (`sanitize`,
validator header streaming). GitHub Actions (`.github/workflows/ci.yml`)
menjalankan typecheck + test + build di setiap push/PR.

## 10. Menjalankan & Deploy

```bash
bun install
bun run dev      # dev + HMR      → http://localhost:3012
bun run start    # mode produksi
bun run build    # bundle statis ke dist/ (index + embed)
```

**Publik (gratis)** — Cloudflare quick tunnel:

```bash
~/.local/bin/cloudflared tunnel --url http://localhost:3012
```

URL `*.trycloudflare.com` bersifat sementara (berubah tiap restart). Untuk
**produksi** dengan domain sendiri: `cloudflared tunnel login` (sekali,
butuh akun Cloudflare gratis) → `cloudflared tunnel create hyluxtic` →
route DNS → jalankan sebagai service. Alternatif: nginx + certbot di VPS.

**Backup**: `scripts/backup.sh` berjalan tiap jam via cron, menyimpan 48
salinan `hyluxtic.sqlite` terakhir di `backups/`.

---

## 11. Checklist Launch pump.fun

- [ ] `TREASURY_WALLET` diisi (uji top-up kecil end-to-end)
- [ ] `GROQ_API_KEY` aktif (cek log server: `AI brain: groq`)
- [ ] Deploy publik + domain permanen (bukan trycloudflare)
- [ ] Buat token di pump.fun → salin CA
- [ ] Isi `TOKEN_CA`, `PUMP_URL`, lalu `HLUX_MINT` + `HLUX_PER_CREDIT`
- [ ] Ganti placeholder `SOCIALS` di `src/App.tsx` (X, Telegram)
- [ ] Update `og:image` absolute URL bila pakai domain (crawler X butuh URL penuh)
- [ ] Pin tweet berisi link situs + video capture UNIT-01 (pakai tombol ⛶)
- [ ] Pantau `/api/stats` + Solscan treasury

## 12. Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| `AI brain: none` di log | Env belum terisi / server belum restart setelah edit `.env` |
| Balasan selalu `source:"rules"` | Sama seperti di atas, atau provider down (cek `brain error:` di log) |
| 402 terus padahal baru | Kuota IP habis (VPN/NAT berbagi IP) — connect wallet |
| Verifikasi bayar gagal "not found" | RPC publik lambat mengindeks — tunggu beberapa detik, klik ulang (signature aman ditebus sekali) |
| Robot tidak muncul | WebGL nonaktif di browser; cek konsol; `/robot.glb` harus 200 |
| Suara tidak bunyi | Browser butuh gesture pertama; cek tombol 🔊; speechSynthesis tidak tersedia di semua browser |
| Port 3012 bentrok | `pkill -f 'bun ./index.ts'` lalu start ulang |

## 13. Kredit & Lisensi

- Model 3D: **RobotExpressive** dari contoh resmi three.js.
- Stack: Bun · React 19 · three.js · @react-three/fiber · drei ·
  postprocessing · @solana/web3.js · @solana/spl-token.
- Font: Michroma & Space Mono (Google Fonts, OFL).
- $HLUX adalah token utilitas; bukan nasihat finansial.
