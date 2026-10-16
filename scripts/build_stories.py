#!/usr/bin/env python3
"""
整理睡前故事库：从维基文库、古登堡计划抓取公有领域作品，清洗后写到 data/stories/：
目录 index.js（页面直接加载）和每部作品一个 <部>.json（看的时候再下载）。

  python3 scripts/build_stories.py            第一次会下载，之后用本机缓存
  python3 scripts/build_stories.py --fresh    重新下载
  python3 scripts/build_stories.py --review   只打印每篇的开头结尾和可能不合适的词，不写文件

只用标准库。下载的原文缓存在 ~/.cache/baby-stories（可用 STORY_CACHE 指定）。
维基文库每次请求之间停几秒，被限流时按它说的时间等。
"""
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'stories'
CACHE = Path(os.environ.get('STORY_CACHE', Path.home() / '.cache' / 'baby-stories'))
FRESH = '--fresh' in sys.argv
REVIEW = '--review' in sys.argv
UA = 'PregnancyDeskStories/1.0 (personal project; https://github.com/AsherDust/Baby)'
WS_API = 'https://zh.wikisource.org/w/api.php?'
WS_PAGE = 'https://zh.wikisource.org/wiki/'
PG_TEXT = 'https://www.gutenberg.org/cache/epub/{0}/pg{0}.txt'
PG_PAGE = 'https://www.gutenberg.org/ebooks/{0}'

# 朗读的大致速度：中文每分钟字数、英文每分钟词数
ZH_PER_MIN = 260
EN_PER_MIN = 140

# ---------- 下载 ----------

_last_ws = 0.0


def fetch(url, polite=0):
    """带缓存的下载；polite 秒内不重复请求同一个站"""
    global _last_ws
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / hashlib.sha1(url.encode()).hexdigest()
    if path.exists() and not FRESH:
        return path.read_text(encoding='utf-8')
    for _ in range(6):
        wait = _last_ws + polite - time.time()
        if wait > 0:
            time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            text = urllib.request.urlopen(req, timeout=60).read().decode('utf-8')
            _last_ws = time.time()
            path.write_text(text, encoding='utf-8')
            return text
        except urllib.error.HTTPError as e:
            _last_ws = time.time()
            if e.code != 429:
                raise
            pause = int(e.headers.get('Retry-After') or 30)
            print(f'  被限流，等 {pause} 秒', file=sys.stderr)
            time.sleep(pause)
    raise SystemExit(f'一直被限流：{url}')


def wiki_html(title):
    """维基文库页面的 HTML，服务器直接转成简体"""
    params = {'action': 'parse', 'page': title, 'prop': 'text', 'variant': 'zh-hans', 'redirects': 1, 'format': 'json'}
    data = json.loads(fetch(WS_API + urllib.parse.urlencode(params), polite=3))
    if 'error' in data:
        raise SystemExit(f'维基文库没有这一页：{title}')
    return data['parse']['text']['*']


def gutenberg(book):
    text = fetch(PG_TEXT.format(book))
    start = re.search(r'\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG.*?\*\*\*', text)
    end = re.search(r'\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG', text)
    return text[start.end() if start else 0:end.start() if end else len(text)].replace('\r', '')

# ---------- 维基文库 HTML → 段落 ----------


SKIP_TAGS = {'table', 'style', 'script', 'sup', 'ul', 'ol', 'figure'}
SKIP_CLASSES = ('mw-editsection', 'noprint', 'reference', 'mw-references', 'ws-noexport', 'navbox', 'metadata')
SKIP_IDS = ('headerContainer', 'plainSister', 'toc')
VOID = {'br', 'img', 'hr', 'meta', 'link', 'input', 'wbr'}


class Blocks(HTMLParser):
    """得到 [('h', 小标题), ('p', 段落)]；诗按换行拆，每行一段"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.buf, self.stack, self.skip, self.kind = [], [], [], 0, None

    def flush(self):
        text = re.sub(r'[ \t\u3000\xa0]+', ' ', ''.join(self.buf))
        if self.kind:
            self.out += [(self.kind, line.strip()) for line in text.split('\n') if line.strip()]
        self.buf = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get('class') or ''
        if tag in VOID:
            if tag == 'br' and not self.skip:
                self.buf.append('\n')
            return
        skipping = (tag in SKIP_TAGS or any(c in cls for c in SKIP_CLASSES) or a.get('id') in SKIP_IDS
                    or 'display:none' in (a.get('style') or '').replace(' ', ''))
        self.stack.append((tag, skipping))
        if skipping:
            self.skip += 1
        elif not self.skip:
            if tag in ('p', 'dd', 'blockquote') or (tag == 'div' and 'poem' in cls):
                self.flush()
                self.kind = 'p'
            elif re.fullmatch(r'h[2-6]', tag):
                self.flush()
                self.kind = 'h'

    def handle_endtag(self, tag):
        # HTML 里常有不成对的结束标签，栈里没有就不管，免得把外层的「跳过」也弹掉
        if not any(t == tag for t, _ in self.stack):
            return
        while self.stack:
            t, skipping = self.stack.pop()
            self.skip -= skipping
            if t == tag:
                break
        if not self.skip and (tag in ('p', 'dd', 'blockquote', 'div') or re.fullmatch(r'h[2-6]', tag)):
            self.flush()
            if tag != 'div':
                self.kind = None

    def handle_data(self, data):
        # 原文里的换行只是排版时断的行，诗行之间用的是 <br>
        if not self.skip and self.kind:
            self.buf.append(data.replace('\n', ' ' if self.kind == 'h' else ''))


def blocks(html):
    cut = html.find('PD-icon')  # 页尾的版权说明从这个图标开始
    if cut > 0:
        html = html[:html.rfind('<p', 0, cut)]
    parser = Blocks()
    parser.feed(html)
    parser.flush()
    return parser.out


NUM = '一二三四五六七八九十〇○零0-9'
# 文末的出处、写作日期之类，不读
NOTE = re.compile(rf'^[（(].*[）)]$|^[{NUM} ，,.。]+$|^[{NUM}]+年|^[{NUM}]+月[{NUM}]+日')
JUNK = re.compile(r'Public domain|falsefalse|属于公有领域')


# 底本里的错字和生僻写法
TYPO = {'𬬻': '炉', '㧎': '杈', '妺妺': '妹妹', '束家粮': '东家粮', '嬴了': '赢了', '绉着眉': '皱着眉', '往下间': '往下问',
        '（风思）': '飔'}


def zh(line):
    """民国白话里作助词的「著」转成「着」，句末的「罢」转成「吧」（朗读才不会念成 bà）"""
    line = re.sub(r'(?<![显土昭卓])著(?![名作者述称书录重])', '着', line)
    line = re.sub(r'(?<!作)罢(?=[，。！？；：’”」』…—．\s]|$)', '吧', line)
    for a, b in TYPO.items():
        line = line.replace(a, b)
    return line.replace('\u3000', '').strip()


def de_di(line):
    """许地山早年把「的」写作「底」，朗读会念成 dǐ"""
    return re.sub(r'(?<![到海心井水池谷眼根彻箱脚鞋天])底(?![下细子层])', '的', line)


def old_style(line):
    """《空山灵雨》的老写法：「．」作句号、单引号在外层"""
    line = de_di(line).replace('．', '。').replace('沈', '沉')
    return line.translate(str.maketrans('‘’“”', '“”‘’'))


def wiki_paras(title):
    paras = [zh(t) for k, t in blocks(wiki_html(title)) if k == 'p' and not JUNK.search(t)]
    while paras and NOTE.match(paras[-1]):
        paras.pop()
    return [p for p in paras if p]


def wiki_links(title, prefix):
    """目录页里的子页面，按页面上的顺序：[(简体显示名, 真实页面名)]"""
    html = wiki_html(title)
    seen = {}
    for href, shown in re.findall(r'<a href="/wiki/([^"#?]+)"[^>]*?title="([^"]+)"', html):
        real = urllib.parse.unquote(href).replace('_', ' ')
        shown = shown.replace('&#039;', "'").replace('&quot;', '"')
        if shown.startswith(prefix) and shown not in seen:
            seen[shown] = real
    return list(seen.items())

# ---------- 古登堡纯文本 → 段落 ----------


ELIDED = r"(?!(?:cos|tis|twas|em|ticing|ticed)\b)"


def curly(line):
    """直引号换成弯引号：词前的是左引号，破折号后面紧跟字母的也是；'cos 这类省略的撇号不算"""
    line = re.sub(r'(^|[\s(\[‘])"', r'\1“', line)
    line = re.sub(r'(?<=—)"(?=[\w\'‘])', '“', line).replace('"', '”')
    line = re.sub(rf"(^|[\s(\[“—])'{ELIDED}(?=\w)", r'\1‘', line, flags=re.I)
    return line.replace("'", '’')


def en_paras(text):
    paras = []
    for chunk in re.split(r'\n\s*\n', text):
        line = ' '.join(s.strip() for s in chunk.strip().split('\n'))
        line = re.sub(r'\[Illustration[^\]]*\]', '', line)
        line = re.sub(r'_([^_]+)_', r'\1', line).replace('_', '').replace('--', '—')
        # 脚注：正文里的「[*]」「word.*」标记，和以「*」开头的注释段
        line = re.sub(r'\s?\[\*\]|(?<=[\w.,”])\*(?=[\s”]|$)', '', line)
        line = curly(re.sub(r'—{2,}', '—', re.sub(r'\s+', ' ', line).strip()))
        if line and not re.fullmatch(r'[*\s.]+', line) and not re.match(r'\*\s?[A-Z“]', line):
            paras.append(line)
    return paras


def between(text, start, end=None, after=0):
    """取 start 那一行之后到 end 之前的正文"""
    i = text.index(start, after)
    i = text.index('\n', i)
    j = text.index(end, i) if end else len(text)
    return text[i:j]

# ---------- 各部作品 ----------


def minutes(paras, lang):
    if lang == 'zh':
        n = sum(len(re.sub(r'\s', '', p)) for p in paras) / ZH_PER_MIN
    else:
        n = sum(len(p.split()) for p in paras) / EN_PER_MIN
    return max(1, round(n))


COLLECTIONS = []


def collection(**meta):
    def wrap(fn):
        COLLECTIONS.append((meta, fn))
        return fn
    return wrap


@collection(id='xiaopo', title='小坡的生日', author='老舍', lang='zh', kind='serial', year=1931,
            source='维基文库', url=WS_PAGE + '小坡的生日')
def xiaopo():
    for shown, real in wiki_links('小坡的生日', '小坡的生日/'):
        name = shown.split('/', 1)[1]
        # 这一章反复用旧时对西洋人的蔑称，跳过它不影响后面的情节
        if name != '种族问题':
            yield name, wiki_paras(real)


@collection(id='hulan', title='呼兰河传 · 祖父的园子', author='萧红', lang='zh', kind='serial', year=1940,
            source='维基文库', url=WS_PAGE + '呼蘭河傳/第三章')
def hulan():
    parts, cur = [], None
    for k, t in blocks(wiki_html('呼蘭河傳/第三章')):
        if k == 'h':
            cur = []
            parts.append(cur)
        elif cur is not None:
            cur.append(zh(t))
    # 太短的小节并到前一节里，一晚读一节
    merged = []
    for p in parts:
        if merged and sum(map(len, p)) < 900:
            merged[-1] += p
        else:
            merged.append(p)
    # 只要前三段：园子、祖父和冬天；往后是祖母去世和丧事
    yield from zip(['后花园', '笑盈盈的祖父', '第一个冬天'], merged[:3])


PROSE = [
    ('匆匆', '朱自清', '匆匆', {}),
    ('春', '朱自清', '春 (朱自清)', {}),
    ('荷塘月色', '朱自清', '荷塘月色', {}),
    ('落花生', '许地山', '落花生', {}),
    ('从百草园到三味书屋', '鲁迅', '從百草園到三味書屋', {}),
    ('再别康桥', '徐志摩', '再別康橋', {'form': 'poem'}),
]
# 《空山灵雨》里挑语气平和的短篇，几篇合成一晚
KONGSHAN = [['山响', '梨花', '蜜蜂和农人'], ['笑', '香', '愿'], ['春底林野', '桥边'], ['疲倦的母亲', '暾将出兮东方']]


@collection(id='prose', title='散文与诗', author='', lang='zh', kind='set', year=None,
            source='维基文库', url=WS_PAGE)
def prose():
    for title, author, page, extra in PROSE:
        paras = wiki_paras(page)
        if author == '许地山':
            paras = [de_di(p) for p in paras]
        if paras and paras[0] == title:
            paras.pop(0)
        yield title, paras, {'author': author, 'url': WS_PAGE + urllib.parse.quote(page), **extra}
    pieces = {shown.split('/', 1)[1]: real for shown, real in wiki_links('空山霝雨 (1925)', '空山霝雨 (1925)/')}
    for group in KONGSHAN:
        paras = []
        for name in group:
            body = [old_style(p) for p in wiki_paras(pieces[name])]
            if body and body[0] == old_style(name):
                body.pop(0)
            paras += [f'【{old_style(name)}】'] + body
        title = '、'.join(old_style(n) for n in group)
        yield f'空山灵雨：{title}', paras, {'author': '许地山', 'url': WS_PAGE + urllib.parse.quote('空山霝雨 (1925)')}


def pooh_book(book):
    text = gutenberg(book)
    # 书末的印刷厂、书目、录入说明（书前也有录入说明，所以从最后一章往后找）
    last = text.rfind('CHAPTER ')
    ends = [i for i in (text.find(s, last) for s in ('Printed in Canada', 'BOOKS FOR BOYS AND GIRLS', "[Transcriber's Note")) if i > 0]
    text = text[:min(ends)] if ends else text
    # 「CHAPTER I」下面空一行，是缩进的「IN WHICH …」副标题，可能折成几行
    heads = list(re.finditer(r'^[ \t]*CHAPTER ([IVX]+)[ \t]*\n\s*\n((?:[ \t]+\S.*\n)+)', text, re.M))
    for n, m in enumerate(heads):
        body = text[m.end():heads[n + 1].start() if n + 1 < len(heads) else len(text)]
        name = re.sub(r'\s+', ' ', m.group(2)).replace('_', '').strip()
        name = re.sub(r'^IN WHICH ', '', name).rstrip('.')
        if name.isupper():
            name = name.capitalize()
            for proper in POOH_NAMES:
                name = re.sub(r'(?i)\b' + re.escape(proper) + r'\b', proper, name)
        yield name[0].upper() + name[1:], en_paras(body)


POOH_NAMES = ['Winnie-the-Pooh', 'Pooh', 'Piglet', 'Eeyore', 'Kanga', 'Baby Roo', 'Roo', 'Christopher Robin',
              'Heffalump', 'Woozle', 'North Pole', 'Owl', 'Rabbit', 'Tigger']


@collection(id='pooh', title='Winnie-the-Pooh', author='A. A. Milne', lang='en', kind='serial', year=1926,
            source='Project Gutenberg', url=PG_PAGE.format(67098))
def pooh():
    yield from pooh_book(67098)


@collection(id='pooh2', title='The House at Pooh Corner', author='A. A. Milne', lang='en', kind='serial', year=1928,
            source='Project Gutenberg', url=PG_PAGE.format(73011), after='pooh')
def pooh_corner():
    yield from pooh_book(73011)


POTTER = ['THE TALE OF PETER RABBIT', 'THE TALE OF BENJAMIN BUNNY', 'THE TALE OF THE FLOPSY BUNNIES',
          'THE TALE OF MRS. TIGGY-WINKLE', 'THE TALE OF GINGER & PICKLES', 'THE STORY OF MISS MOPPET',
          'THE TALE OF MR. JEREMY FISHER', 'THE TALE OF TIMMY TIPTOES', 'THE PIE AND THE PATTY-PAN',
          'THE TALE OF JEMIMA PUDDLE-DUCK', 'THE TALE OF TWO BAD MICE']


@collection(id='potter', title='Beatrix Potter Stories', author='Beatrix Potter', lang='en', kind='set', year=1902,
            source='Project Gutenberg', url=PG_PAGE.format(582))
def potter():
    text = gutenberg(582)
    body_start = text.index('THE TALE OF PETER RABBIT BY BEATRIX POTTER')
    heads = [m for m in re.finditer(r'^\s*(THE (?:TALE|STORY) OF [^\n]+|THE ROLY-POLY PUDDING|THE PIE AND THE PATTY-PAN)\s*$', text, re.M)
             if m.start(1) >= body_start]
    for n, m in enumerate(heads):
        name = m.group(1).strip()
        key = next((p for p in POTTER if name.startswith(p)), None)
        if not key or (n and heads[n - 1].group(1).strip().startswith(key)):
            continue
        body = text[m.end():heads[n + 1].start() if n + 1 < len(heads) else len(text)]
        paras = [p for p in en_paras(body) if not p.isupper()]
        # 题献，如「FOR ALL LITTLE FRIENDS OF MR. McGREGOR …」
        while paras and re.match(r'(?i)for [A-Z]', paras[0]) and sum(c.isupper() for c in paras[0]) > len(paras[0]) / 2:
            paras.pop(0)
        yield key.title().replace("'S", "'s").replace('&', 'and'), paras


AESOP = [
    ['The Lion And The Mouse', 'The Hare and the Tortoise', 'The Crow and the Pitcher'],
    ['The North Wind and the Sun', 'The Ants and the Grasshopper', 'The Dog and the Shadow'],
    ['The Town Mouse and the Country Mouse', 'The Fox and the Grapes', 'The Oak and the Reeds'],
    ['The Ant and the Dove', 'The Mice in Council', 'The Milk-Woman and Her Pail'],
    ['The Fox and the Crow', 'The Bear and the Two Travelers', 'The Boy and the Filberts'],
    ['The Fox and the Crane', 'The Crab and Its Mother', 'The Two Pots'],
    ['Hercules and the Wagoner', 'The Farmer and His Sons', 'The Belly and the Members'],
    ['The Mole and His Mother', 'The Salt Merchant and His Ass', 'The Vain Jackdaw'],
    ['The Peacock and the Crane', 'The Travelers and the Plane-Tree', 'The Rose and the Amaranth'],
    ['The Lark and Her Young Ones', 'The Olive-Tree and the Fig-Tree', 'The Monkey and the Camel'],
    ['The Dog in the Manger', 'The Gnat and the Bull', 'The Two Bags'],
    ['The Lamp', 'The Rivers and the Sea', 'The Seaside Travelers'],
]


@collection(id='aesop', title="Aesop's Fables", author='Aesop · tr. G. F. Townsend', lang='en', kind='set', year=1867,
            source='Project Gutenberg', url=PG_PAGE.format(21))
def aesop():
    text = gutenberg(21)
    # 开头的目录里也有「AESOP’S FABLES」，正文在《伊索传》后面那一处
    body = text[text.index('AESOP’S FABLES\n', text.index('LIFE OF AESOP', 1000)):]
    missing = [n for g in AESOP for n in g if not re.search(r'^' + re.escape(n) + r'\n\n\n', body, re.M)]
    if missing:
        raise SystemExit(f'伊索寓言里找不到：{missing}')

    def fable(name):
        m = re.search(r'^' + re.escape(name) + r'\n\n\n(.*?)(?=\n\n\n\n|\Z)', body, re.M | re.S)
        return en_paras(m.group(1))
    def nice(name):
        return re.sub(r'(?<= )(And|The|Of|In|To|Its|Her|His)\b', lambda m: m.group(1).lower(), name)

    for group in AESOP:
        paras = []
        for name in group:
            paras.append(f'【{nice(name)}】')
            paras += fable(name)
        yield ' · '.join(map(nice, group)), paras


ANDERSEN = ["THE EMPEROR'S NEW CLOTHES", 'THE REAL PRINCESS', 'THE SWINEHERD', 'THE LEAP-FROG', 'THE ELDERBUSH',
            'THE HAPPY FAMILY', 'THE DREAM OF LITTLE TUK']


@collection(id='andersen', title="Andersen's Fairy Tales", author='Hans Christian Andersen', lang='en', kind='set',
            year=1835, source='Project Gutenberg', url=PG_PAGE.format(1597))
def andersen():
    text = gutenberg(1597)
    body = text[text.index("THE EMPEROR'S NEW CLOTHES\n", text.index('The Red Shoes')):]
    heads = list(re.finditer(r"^([A-Z][A-Z' -]{4,})\s*$", body, re.M))
    for n, m in enumerate(heads):
        name = m.group(1).strip()
        if name not in ANDERSEN:
            continue
        chunk = body[m.end():heads[n + 1].start() if n + 1 < len(heads) else len(body)]
        yield name.title().replace("'S", "'s"), en_paras(chunk)

# ---------- 飞鸟集：每晚一句 ----------


def birds():
    """每节的中文译文；英文原文这页只有前几节有，不要"""
    lines, cur = [], None
    for k, t in blocks(wiki_html('飛鳥集')):
        if k == 'h':
            cur = []
            lines.append(cur)
        elif cur is not None and re.search(r'[\u4e00-\u9fff]', t):
            cur.append(zh(t))
    return ['\n'.join(b) for b in lines if b]

# ---------- 检查和输出 ----------


# 民国作品里可能出现的不合适说法，出现了就打印出来人工看一眼
WATCH = ['黑鬼', '鬼子', '番鬼', '蛮', '死', '杀', '血', '打死', '吃人', 'nigger', 'savage', 'kill', 'dead', 'blood']


def build():
    index = {'version': 1, 'collections': [], 'stories': [], 'birds': birds()}
    for meta, fn in COLLECTIONS:
        texts = {}
        for n, item in enumerate(fn(), 1):
            title, paras, extra = (item + ({},))[:3]
            if not paras:
                raise SystemExit(f'{meta["id"]}《{title}》没取到正文')
            sid = f'{meta["id"]}-{n:02d}'
            texts[sid] = paras
            entry = {'id': sid, 'c': meta['id'], 'n': n, 'title': title, 'min': minutes(paras, meta['lang'])}
            entry.update(extra)
            index['stories'].append(entry)
            if REVIEW:
                flagged = sorted({w for w in WATCH if any(w in p for p in paras)})
                print(f'{sid} {title}（{entry["min"]} 分钟，{len(paras)} 段）{" ⚠ " + "、".join(flagged) if flagged else ""}')
                print(f'    {paras[0][:60]}')
                print(f'    …{paras[-1][-60:]}')
        index['collections'].append({**meta, 'count': len(texts)})
        if not REVIEW:
            OUT.mkdir(parents=True, exist_ok=True)
            (OUT / f'{meta["id"]}.json').write_text(json.dumps(texts, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    if REVIEW:
        print(f'飞鸟集 {len(index["birds"])} 句；第一句：{index["birds"][0]}')
        return
    # 目录做成脚本，页面一打开就有，不用等请求；正文到看的时候再下载
    data = json.dumps(index, ensure_ascii=False, separators=(',', ':'))
    (OUT / 'index.js').write_text(f'// 由 scripts/build_stories.py 生成，不要手改\n'
                                  f'(globalThis.Baby || (globalThis.Baby = {{}})).storyIndex = {data};\n', encoding='utf-8')
    total = sum(e['min'] for e in index['stories'])
    print(f'写好了 {len(index["stories"])} 篇（约 {total} 分钟）+ 飞鸟集 {len(index["birds"])} 句 → {OUT.relative_to(ROOT)}')
    for c in index['collections']:
        size = (OUT / f'{c["id"]}.json').stat().st_size
        print(f'  {c["id"]:9} {c["count"]:3} 篇  {size // 1024:4} KB  {c["title"]}')


if __name__ == '__main__':
    build()
