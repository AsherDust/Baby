#!/usr/bin/env python3
"""
整理 WHO 儿童生长标准（0–2 岁）：从 WHO 的 anthro 仓库下载体重、身长、头围按天的 LMS 参数，
每周取一个点写到 data/growth.js。页面用它画百分位曲线、算宝宝大约在第几百分位。

  python3 scripts/build_growth.py            第一次会下载，之后用本机缓存
  python3 scripts/build_growth.py --fresh    重新下载

只用标准库。下载的原文缓存在 ~/.cache/baby-growth（可用 GROWTH_CACHE 指定）。
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'growth.js'
CACHE = Path(os.environ.get('GROWTH_CACHE', Path.home() / '.cache' / 'baby-growth'))
FRESH = '--fresh' in sys.argv
BASE = 'https://raw.githubusercontent.com/WorldHealthOrganization/anthro/master/data-raw/growthstandards/'
FILES = {'weight': 'weianthro.txt', 'length': 'lenanthro.txt', 'head': 'hcanthro.txt'}
SEXES = {'1': 'boy', '2': 'girl'}
MAX_DAY = 730
STEP = 7


def fetch(name):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if FRESH or not path.exists():
        with urllib.request.urlopen(BASE + name, timeout=60) as res:
            path.write_bytes(res.read())
    return path.read_text()


def table(text):
    """{ 'boy': { 天: (L, M, S) }, 'girl': {...} }"""
    rows = [line.split('\t') for line in text.strip().splitlines()]
    head = rows[0]
    out = {'boy': {}, 'girl': {}}
    for r in rows[1:]:
        rec = dict(zip(head, r))
        sex = SEXES.get(rec['sex'])
        day = int(float(rec['age']))
        if sex and day <= MAX_DAY:
            out[sex][day] = (float(rec['l']), float(rec['m']), float(rec['s']))
    return out


def main():
    days = list(range(0, MAX_DAY + 1, STEP))
    if days[-1] != MAX_DAY:
        days.append(MAX_DAY)
    data = {
        'source': 'WHO Child Growth Standards（anthro 包，按天的 LMS 参数，每周取一个点）',
        'url': 'https://www.who.int/tools/child-growth-standards',
        'days': days,
    }
    for key, name in FILES.items():
        t = table(fetch(name))
        data[key] = {sex: [list(t[sex][d]) for d in days] for sex in ('boy', 'girl')}
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    OUT.write_text(f'// 由 scripts/build_growth.py 生成，不要手改\n(globalThis.Baby || (globalThis.Baby = {{}})).growthStandard = {text};\n')
    print(f'写好了 {OUT.relative_to(ROOT)}：{len(days)} 个点，{OUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
