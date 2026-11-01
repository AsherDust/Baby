#!/bin/sh
# 用无头 Chrome 跑页面测试，需要 Chrome 和 python3：
#   sh tests/browser/run.sh            全部跑
#   sh tests/browser/run.sh records    只跑 records.html
#   名字后面加 :dark 按深色模式跑，例如 contrast:dark
#   KEEP=目录：没通过的、第一次一项都没跑的，把 Chrome 吐出来的页面和日志留在这个目录里
# 页面里没接住的报错（包括刚打开时的）Chrome 会记进日志，有的话这一组也算没通过
cd "$(dirname "$0")/../.." || exit 1
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-18765}"
# 每组最多用这么多虚拟时间（毫秒），到了就交卷；用过一半时提醒一下
BUDGET=60000
[ -z "$KEEP" ] || mkdir -p "$KEEP" || exit 1
[ -x "$CHROME" ] || { echo "找不到 Chrome：$CHROME（可以用 CHROME=路径 指定）"; exit 1; }
[ $# -eq 0 ] && set -- core bag meds tools records safety story journal recipes baby sync storage contrast contrast:dark perf
for name in "$@"; do
  [ -f "tests/browser/${name%:dark}.html" ] || { echo "没有这组测试：$name"; exit 1; }
done
# 端口上已经有别的服务时，测的就不是这份代码了
if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo "端口 $PORT 已经被占用了，换一个：PORT=18766 sh tests/browser/run.sh"
  exit 1
fi

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
work=$(mktemp -d)
trap 'kill $server 2>/dev/null; pkill -f "$work/profile-" 2>/dev/null; rm -rf "$work"' EXIT
trap 'echo; echo "中途停下了"; exit 130' INT TERM
for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/index.html" && break
  sleep 0.3
done
kill -0 $server 2>/dev/null || { echo "本地服务器没起来（端口 $PORT）"; exit 1; }

status=0
for name in "$@"; do
  page=${name%:dark}
  dark=''
  query=''
  [ "$page" = "$name" ] || { dark=--force-dark-mode; query='?dark'; }
  slot=$(echo "$name" | tr ':' '-')
  out="$work/$slot.html"
  log="$work/$slot.log"
  # 偶尔一项都没跑就结束了（Chrome 没吐出结果，或者页面停在开头），换个资料目录再跑一次；跑了但没通过的不重跑
  again=''
  for try in 1 2; do
    # 每次用全新的浏览器资料目录，本地存储和 Service Worker 都从空白开始。
    # 动态效果一律按打开算：GitHub 的 macOS 机器开着「减弱动态效果」，不然那边不冒爱心、动画也不一样
    "$CHROME" --headless=new --use-mock-keychain --no-first-run --user-data-dir="$work/profile-$slot-$try" $dark \
      --force-prefers-no-reduced-motion --enable-logging=stderr --v=0 --virtual-time-budget=$BUDGET \
      --dump-dom "http://127.0.0.1:$PORT/tests/browser/$page.html$query" >"$out" 2>"$log" &
    chrome=$!
    for _ in $(seq 1 40); do
      sleep 1
      grep -q '</html>' "$out" 2>/dev/null && break
    done
    kill $chrome 2>/dev/null
    pkill -f "$work/profile-$slot-$try" 2>/dev/null
    grep -qE '>DONE|^(<[^>]*>)?(PASS|FAIL) ' "$out" && break
    again='（第一次一项都没跑，又跑了一次）'
    [ -z "$KEEP" ] || { cp "$out" "$KEEP/$slot-$try.html"; cp "$log" "$KEEP/$slot-$try.log"; }
  done
  pass=$(grep -cE '^(<[^>]*>)?PASS ' "$out")
  fail=$(grep -cE '^(<[^>]*>)?FAIL ' "$out")
  crash=$(grep -E ':CONSOLE[^]]*\] "Uncaught' "$log" | sed -E 's/^[^"]*"(.*)", source: (.*)$/\1（\2）/' | awk '!seen[$0]++')
  if grep -q '>DONE' "$out" && [ "$fail" -eq 0 ] && [ -z "$crash" ]; then
    echo "✓ ${name}：$pass 项通过$again"
  else
    status=1
    echo "✗ ${name}：$pass 项通过，$fail 项失败$(grep -q '>DONE' "$out" || echo '，没跑完')$([ -z "$crash" ] || echo '，页面有没接住的报错')$again"
    grep -E '^(<[^>]*>)?(FAIL |HLOG)' "$out" | sed 's/^<[^>]*>//; s/^/    /'
    [ -z "$crash" ] || echo "$crash" | sed 's/^/    报错：/'
    [ -z "$KEEP" ] || { cp "$out" "$KEEP/$slot.html"; cp "$log" "$KEEP/$slot.log"; }
  fi
  grep -E '^(<[^>]*>)?NOTE ' "$out" | sed 's/^<[^>]*>//; s/^NOTE /    /'
  vt=$(grep -oE '^(<[^>]*>)?VT [0-9]+' "$out" | grep -oE '[0-9]+$')
  [ -n "$vt" ] && [ "$vt" -gt $((BUDGET / 2)) ] && echo "    虚拟时间用了 $((vt / 1000)) 秒，上限 $((BUDGET / 1000)) 秒：少等一点，或者拆成两组"
done
exit $status
