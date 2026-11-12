#!/usr/bin/env bash
# Syntax-checks the app's inline JS and every Apps Script file. Run from the repo root.
set -e
tmp=$(mktemp -d)
python3 - "$tmp" <<'PY'
import re,sys
html=open('index.html',encoding='utf-8').read()
blocks=re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>',html,re.S)
for i,b in enumerate(blocks):
    open(f'{sys.argv[1]}/inline{i}.js','w').write(b)
print(len(blocks),'inline script blocks')
PY
for f in "$tmp"/*.js; do node --check "$f"; done
for f in apps-script/*.gs; do cp "$f" "$tmp/$(basename "$f").js"; node --check "$tmp/$(basename "$f").js"; done
[ -f sw.js ] && node --check sw.js
node .overnight/test-backend.js > /dev/null && echo "backend tests OK"
echo "check.sh: all OK"
