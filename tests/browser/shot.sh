#!/bin/sh
# 截一张图看样子，图存到 /tmp/baby-shots/名字.png：
#   sh tests/browser/shot.sh 名字 宽x高 'preview.html 的参数' [缩放]
#   例：sh tests/browser/shot.sh us 390x844 's=main&w=390&r=checkups/ultrasound' 2
#   前面加 DARK=1 看深色模式
cd "$(dirname "$0")/../.." || exit 1
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-18766}"
[ $# -ge 3 ] || { sed -n '2,4p' "$0"; exit 1; }

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
work=$(mktemp -d)
trap 'kill $server 2>/dev/null; rm -rf "$work"' EXIT INT TERM
for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/index.html" && break
  sleep 0.3
done

mkdir -p /tmp/baby-shots
png="/tmp/baby-shots/$1.png"
rm -f "$png"
"$CHROME" --headless=new --use-mock-keychain --hide-scrollbars --no-first-run --user-data-dir="$work/profile" \
  --virtual-time-budget=3000 --window-size="$2" --force-device-scale-factor="${4:-1}" ${DARK:+--force-dark-mode} \
  --screenshot="$png" "http://127.0.0.1:$PORT/tests/browser/preview.html?$3" >/dev/null 2>&1 &
chrome=$!
for _ in $(seq 1 30); do
  sleep 1
  [ -s "$png" ] && break
done
sleep 0.3
kill $chrome 2>/dev/null
pkill -f "$work/profile" 2>/dev/null
[ -s "$png" ] && echo "$png" || { echo "截图失败：$1"; exit 1; }
