#!/bin/sh
# 用无头 Chrome 跑页面测试，需要 Chrome 和 python3：
#   sh tests/browser/run.sh            全部跑
#   sh tests/browser/run.sh records    只跑 records.html
#   名字后面加 :dark 按深色模式跑，例如 contrast:dark
cd "$(dirname "$0")/../.." || exit 1
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-18765}"
[ -x "$CHROME" ] || { echo "找不到 Chrome：$CHROME（可以用 CHROME=路径 指定）"; exit 1; }

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
work=$(mktemp -d)
trap 'kill $server 2>/dev/null; rm -rf "$work"' EXIT INT TERM
for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/index.html" && break
  sleep 0.3
done

[ $# -eq 0 ] && set -- core bag meds tools records safety story contrast contrast:dark
status=0
for name in "$@"; do
  page=${name%:dark}
  dark=''
  [ "$page" = "$name" ] || dark=--force-dark-mode
  slot=$(echo "$name" | tr ':' '-')
  out="$work/$slot.html"
  # 每次用全新的浏览器资料目录，本地存储和 Service Worker 都从空白开始
  "$CHROME" --headless=new --use-mock-keychain --no-first-run --user-data-dir="$work/profile-$slot" $dark \
    --virtual-time-budget=15000 --dump-dom "http://127.0.0.1:$PORT/tests/browser/$page.html" >"$out" 2>/dev/null &
  chrome=$!
  for _ in $(seq 1 40); do
    sleep 1
    grep -q '</html>' "$out" 2>/dev/null && break
  done
  kill $chrome 2>/dev/null
  pkill -f "$work/profile-$slot" 2>/dev/null
  pass=$(grep -cE '^(<[^>]*>)?PASS ' "$out")
  fail=$(grep -cE '^(<[^>]*>)?FAIL ' "$out")
  if grep -q '>DONE' "$out" && [ "$fail" -eq 0 ]; then
    echo "✓ ${name}：$pass 项通过"
  else
    status=1
    echo "✗ ${name}：$pass 项通过，$fail 项失败$(grep -q '>DONE' "$out" || echo '，没跑完')"
    grep -E '^(<[^>]*>)?(FAIL |HLOG)' "$out" | sed 's/^<[^>]*>//; s/^/    /'
  fi
done
exit $status
