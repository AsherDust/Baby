(function () {
  'use strict';
  // 本机存储。记录是一个 JSON，放在 localStorage 的 honey-pot:v1 里；宝宝的日常记录多，搬进 IndexedDB 按月存：
  //   honey-pot:v2          其余的记录（baby 里没有 logs）
  //   honey-pot:v1          只留一个记号：老版本的蜜罐读不懂，当成没有记录，不会把日常记录当成空的存回去
  //   honey-pot:v2:months   IndexedDB 里已经确认写好的月份和指纹
  //   honey-pot:v2:pending  改了、还没确认写进 IndexedDB 的月份。localStorage 是马上写下的，
  //                         写到一半关掉页面也不丢；打开时以它为准，确认写好以后才删
  // IndexedDB 用不了（或者一直写不进去）时，日常记录就留在 honey-pot:v1 里，和搬之前一样
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const { hash } = Baby.util;

  const APP = 'honey-pot';
  const KEY = `${APP}:v1`;
  const KEY2 = `${APP}:v2`;
  const MONTHS = `${KEY2}:months`;
  const PENDING = `${KEY2}:pending`;
  const MARK = JSON.stringify({ app: APP, movedTo: KEY2 });
  // 这几项变了就是记录变了（别的标签页收到 storage 事件时用）
  const KEYS = [KEY, KEY2, MONTHS, PENDING];

  // 这个标签页知道的：日常记录搬没搬、每个月存着的 JSON、上次读写时存储里的样子
  let moved = false;
  let known = {};
  let lastSig = '';
  // IndexedDB 读不出来：只存其余的记录，不碰月份
  let broken = false;
  let lost = [];
  let db;
  let writing = 0;
  // 清空、清除宝宝信息以后加一，之前发出去的写入写完了也别再动目录和暂存
  let generation = 0;
  const partial = new WeakMap();

  const read = (k) => {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  };
  const drop = (k) => {
    try {
      localStorage.removeItem(k);
    } catch (e) {
      // 存储被禁用时没什么可删的
    }
  };
  const parsed = (raw, fallback) => {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  };
  const fp = (json) => `${json.length}:${hash(json)}`;
  // 和云同步按月分文件一样按 UTC 的月份
  const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7);

  /** 按月分好的日常记录：{ '2026-10': '[…]' } */
  function monthsOf(logs) {
    const out = {};
    for (const l of logs) (out[monthOf(l.start)] = out[monthOf(l.start)] || []).push(l);
    return Object.fromEntries(Object.entries(out).map(([m, list]) => [m, JSON.stringify(list)]));
  }

  function withoutLogs(state) {
    const { logs, ...rest } = state.baby;
    return { ...state, baby: rest };
  }

  /** 存储里现在的样子：其余的记录，加上每个月实际用哪份（暂存的优先） */
  function signature() {
    const raw = read(KEY2);
    if (raw == null) return fp(read(KEY) || '');
    const index = parsed(read(MONTHS), {});
    const pending = parsed(read(PENDING), {});
    const months = { ...index };
    for (const [m, list] of Object.entries(pending)) months[m] = fp(JSON.stringify(list));
    return `${fp(raw)}|${Object.keys(months).sort().map((m) => `${m}=${months[m]}`).join(',')}`;
  }

  // 读不出来的数据另存一份，避免被新数据覆盖后彻底丢失；只留一份，每次打开都存的话会把存储占满
  function keepUnreadable(raw) {
    try {
      if (localStorage.getItem(`${KEY}:unreadable`) !== raw) localStorage.setItem(`${KEY}:unreadable`, raw);
    } catch (e) {
      // 存储已满时只能放弃这份副本
    }
  }

  function assemble(main, parts) {
    const logs = Object.keys(parts).sort().flatMap((m) => parsed(parts[m], []));
    return Baby.model.normalize(main.baby ? { ...main, baby: { ...main.baby, logs } } : main);
  }

  /**
   * 读出记录。日常记录搬过而且有的月份要去 IndexedDB 取时，先给出缺了这些月份的一份，
   * 用 isPartial 判断，complete 补齐；补齐之前别拿它保存
   */
  function load() {
    const raw2 = read(KEY2);
    const raw = raw2 || read(KEY);
    lastSig = signature();
    if (!raw) {
      moved = false;
      known = {};
      return null;
    }
    let main;
    try {
      main = JSON.parse(raw);
    } catch (e) {
      keepUnreadable(raw);
      return null;
    }
    try {
      if (!raw2) {
        const state = Baby.model.normalize(main);
        if (state) {
          moved = false;
          known = {};
          Baby.merge.track(state);
          return state;
        }
      } else {
        const index = parsed(read(MONTHS), {});
        const pending = parsed(read(PENDING), {});
        const parts = {};
        const missing = [];
        for (const m of Object.keys(index)) {
          if (m in pending) continue;
          if (known[m] !== undefined && fp(known[m]) === index[m]) parts[m] = known[m];
          else missing.push(m);
        }
        for (const [m, list] of Object.entries(pending)) if (Array.isArray(list) && list.length) parts[m] = JSON.stringify(list);
        const state = assemble(main, parts);
        if (state) {
          moved = true;
          // 缺的月份补齐之前先按原来知道的算，这时存一次也不会把它们当成改过的写下去
          known = missing.length ? { ...known, ...parts } : parts;
          Baby.merge.track(state);
          if (missing.length) partial.set(state, { main, parts, missing });
          return state;
        }
      }
    } catch (e) {
      // 下面另存一份
    }
    keepUnreadable(raw);
    return null;
  }

  const isPartial = (state) => Boolean(state && partial.has(state));

  /** 从 IndexedDB 补齐缺的月份，给出新的一份；读不出来时进「坏了」状态并报错 */
  async function complete(state) {
    const info = state && partial.get(state);
    if (!info) return state;
    let got;
    try {
      got = await store().read(info.missing);
    } catch (e) {
      broken = true;
      throw e;
    }
    broken = false;
    // IndexedDB 里没有的月份找不回来了（例如浏览器只清了它）：记下来提示一次，从目录里去掉，接着用剩下的
    lost = info.missing.filter((m) => typeof got[m] !== 'string');
    if (lost.length) {
      const index = parsed(read(MONTHS), {});
      lost.forEach((m) => delete index[m]);
      try {
        localStorage.setItem(MONTHS, JSON.stringify(index));
      } catch (e) {
        // 存不下就下次打开再提示一次
      }
      lastSig = signature();
    }
    const parts = { ...info.parts };
    for (const m of info.missing) if (typeof got[m] === 'string') parts[m] = got[m];
    const full = assemble(info.main, parts);
    known = parts;
    Baby.merge.track(full);
    return full;
  }

  /** 把改了的月份写进 IndexedDB；写好了、暂存里还是这份就删掉暂存，目录记上指纹 */
  function flush(changed) {
    const box = store();
    if (!box) return;
    writing += 1;
    const gen = generation;
    box.write(changed).then(() => {
      if (gen !== generation) return;
      const pending = parsed(read(PENDING), {});
      const index = parsed(read(MONTHS), {});
      for (const [m, v] of Object.entries(changed)) {
        if (m in pending && JSON.stringify(pending[m]) === v) delete pending[m];
        if (v === '[]') delete index[m];
        else index[m] = fp(v);
      }
      try {
        localStorage.setItem(MONTHS, JSON.stringify(index));
        if (Object.keys(pending).length) localStorage.setItem(PENDING, JSON.stringify(pending));
        else drop(PENDING);
      } catch (e) {
        // 存不下就留着暂存，下次打开以它为准
      }
      lastSig = signature();
    }, () => {
      // 写不进去：留在暂存里，下次改的时候再写
    }).then(() => { writing -= 1; });
  }

  function save(state) {
    Baby.merge.track(state);
    try {
      if (!state.baby || !moved) {
        localStorage.setItem(KEY, JSON.stringify(state));
        if (moved || read(KEY2) != null) forget();
      } else if (broken || isPartial(state)) {
        localStorage.setItem(KEY2, JSON.stringify(withoutLogs(state)));
      } else {
        const parts = monthsOf(state.baby.logs);
        const changed = {};
        for (const m of new Set([...Object.keys(parts), ...Object.keys(known)])) {
          const v = parts[m] || '[]';
          if (v !== (known[m] || '[]')) changed[m] = v;
        }
        if (Object.keys(changed).length) {
          const pending = parsed(read(PENDING), {});
          for (const [m, v] of Object.entries(changed)) pending[m] = JSON.parse(v);
          localStorage.setItem(PENDING, JSON.stringify(pending));
        }
        localStorage.setItem(KEY2, JSON.stringify(withoutLogs(state)));
        if (read(KEY) !== MARK) localStorage.setItem(KEY, MARK);
        known = parts;
        if (Object.keys(changed).length) flush(changed);
      }
      lastSig = signature();
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 上次没写完就关掉了：打开时把暂存里的月份再写一次 */
  function resume() {
    if (!moved || broken) return;
    const pending = parsed(read(PENDING), {});
    const changed = Object.fromEntries(Object.entries(pending).map(([m, list]) => [m, JSON.stringify(list)]));
    if (Object.keys(changed).length) flush(changed);
  }

  // 宝宝的信息清掉了：月份目录、暂存和 IndexedDB 都不要了，之后又有了就先按老办法存
  function forget() {
    generation += 1;
    drop(KEY2);
    drop(MONTHS);
    drop(PENDING);
    moved = false;
    known = {};
    const box = store();
    if (box) box.clear().catch(() => {});
  }

  /**
   * 还没搬的日常记录搬进 IndexedDB：先把每个月写进去，确认后写目录，再存一次把 logs 从 localStorage 拿掉
   * （搬的时候又改了的月份会进暂存）。搬不了返回 false，接着用老办法
   */
  async function migrate(getState) {
    const box = store();
    const state = getState();
    if (moved || !box || !state || !state.baby || !state.baby.logs.length) return false;
    const parts = monthsOf(state.baby.logs);
    try {
      await box.write(parts);
      localStorage.setItem(MONTHS, JSON.stringify(Object.fromEntries(Object.entries(parts).map(([m, v]) => [m, fp(v)]))));
      drop(PENDING);
    } catch (e) {
      return false;
    }
    if (moved) return false;
    const now = getState();
    if (!now || !now.baby) return false;
    moved = true;
    known = parts;
    return save(now);
  }

  function clear() {
    const used = moved || read(KEY2) != null || read(MONTHS) != null;
    drop(KEY);
    if (used) forget();
    lastSig = signature();
  }

  /** 别的标签页改过存储了吗（只是把暂存挪进 IndexedDB 不算） */
  const changedElsewhere = () => signature() !== lastSig;

  // ---------- IndexedDB ----------

  function store() {
    if (db === undefined) db = typeof indexedDB === 'undefined' ? null : idb();
    return db;
  }

  function idb() {
    let opening = null;
    const open = () => opening || (opening = new Promise((resolve, reject) => {
      const r = indexedDB.open(APP, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('months');
      r.onsuccess = () => {
        const conn = r.result;
        conn.onversionchange = () => {
          conn.close();
          opening = null;
        };
        resolve(conn);
      };
      r.onerror = () => {
        opening = null;
        reject(r.error);
      };
    }));
    const run = (mode, fn) => open().then((conn) => new Promise((resolve, reject) => {
      const tx = conn.transaction('months', mode);
      const out = fn(tx.objectStore('months'));
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
    return {
      read: (months) => run('readonly', (s) => months.map((m) => [m, s.get(m)]))
        .then((reqs) => Object.fromEntries(reqs.map(([m, q]) => [m, q.result]))),
      write: (changes) => run('readwrite', (s) => {
        for (const [m, v] of Object.entries(changes)) {
          if (v === '[]') s.delete(m);
          else s.put(v, m);
        }
      }),
      clear: () => run('readwrite', (s) => s.clear()),
    };
  }

  // ---------- 备份 ----------

  function backupText(state, now) {
    return JSON.stringify({ app: APP, exportedAt: now.toISOString(), ...state }, null, 2);
  }

  function parseBackup(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new Error('这个文件打不开，不是有效的备份');
    }
    const state = Baby.model.normalize(raw);
    if (!state) throw new Error('备份里没找到预产期，可能不是蜜罐导出的');
    return state;
  }

  Baby.storage = {
    APP, KEY, KEY2, KEYS, load, isPartial, complete, save, resume, migrate, clear, changedElsewhere, backupText, parseBackup,
    isBroken: () => broken,
    lostMonths: () => lost,
    inIndexedDB: () => moved,
    // 测试用：换成假的 IndexedDB，这个标签页记着的都忘掉，像重新打开了一次；看还有几次写入没完成
    useStore: (fake) => {
      db = fake;
      moved = false;
      known = {};
      broken = false;
      lost = [];
      lastSig = '';
    },
    writing: () => writing,
  };
})();
