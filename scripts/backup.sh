#!/usr/bin/env bash
# Backup ledger SQLite Hyluxtic — dipanggil dari cron tiap jam.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB="$DIR/hyluxtic.sqlite"
OUT="$DIR/backups"
mkdir -p "$OUT"

[ -f "$DB" ] || exit 0

# .backup aman dilakukan saat DB sedang dipakai (WAL-aware)
sqlite3 "$DB" ".backup '$OUT/hyluxtic-$(date +%Y%m%d-%H%M).sqlite'" 2>/dev/null \
  || cp "$DB" "$OUT/hyluxtic-$(date +%Y%m%d-%H%M).sqlite"

# simpan 48 backup terakhir (2 hari)
ls -1t "$OUT"/hyluxtic-*.sqlite 2>/dev/null | tail -n +49 | xargs -r rm -f
