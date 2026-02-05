#!/usr/bin/env bash
set -euo pipefail

extract_ids() {
  local file="$1"
  python - "$file" <<'PY'
import re
import sys
from pathlib import Path

file = Path(sys.argv[1])
text = file.read_text(encoding='utf-8')
match = re.search(r'<div class="cp-adds"[\s\S]*?</div>\s*\n\s*<div class="cp-aiming-accuracy"', text)
if not match:
    raise SystemExit(f'Не удалось найти блок .cp-adds в {file}')
block = match.group(0)
ids = re.findall(r'\bid="([^"]+)"', block)
for i in ids:
    print(i)
PY
}

index_ids="$(extract_ids index.html)"
settings_ids="$(extract_ids settings.html)"

if [[ "$index_ids" != "$settings_ids" ]]; then
  echo "Ошибка: id внутри .cp-adds не совпадают между index.html и settings.html"
  echo "--- index.html"
  echo "$index_ids"
  echo "--- settings.html"
  echo "$settings_ids"
  exit 1
fi

echo "OK: id внутри .cp-adds совпадают в index.html и settings.html"
