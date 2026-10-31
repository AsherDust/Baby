(function () {
  'use strict';
  // 云同步里不碰网络的部分：一份记录拆成几个文件、从文件拼回来、哪些文件要重新传。
  // 宝宝的日常记录最多，按月（UTC）单独放，平常一次只改当月那个小文件；其它都在 main.json
  const Baby = globalThis.Baby || (globalThis.Baby = {});

  const MAIN = 'main.json';
  const LOGS = /^logs-\d{4}-\d{2}\.json$/;
  const isPart = (name) => name === MAIN || LOGS.test(name);
  const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7);

  /** 明文的指纹（cyrb53），用来判断这个文件要不要重新传 */
  function hash(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  /** 拆成 { 文件名: 明文 } */
  function split(state) {
    const logs = state.baby ? state.baby.logs : [];
    const main = state.baby ? { ...state, baby: { ...state.baby, logs: [] } } : state;
    const parts = { [MAIN]: JSON.stringify({ app: Baby.storage.APP, ...main }) };
    const months = {};
    for (const l of logs) (months[monthOf(l.start)] = months[monthOf(l.start)] || []).push(l);
    for (const m of Object.keys(months).sort()) parts[`logs-${m}.json`] = JSON.stringify(months[m]);
    return parts;
  }

  /** 拼回一份记录（校验过的）；没有 main.json 就是 null */
  function join(parts) {
    if (!parts[MAIN]) return null;
    const raw = JSON.parse(parts[MAIN]);
    if (raw && raw.baby) {
      const logs = Array.isArray(raw.baby.logs) ? raw.baby.logs : [];
      for (const [name, text] of Object.entries(parts)) if (LOGS.test(name)) logs.push(...JSON.parse(text));
      raw.baby.logs = logs;
    }
    return Baby.model.normalize(raw);
  }

  /**
   * 和上次同步时的比（files：{ 文件名: { sha, hash } }）：
   * upload 新的、变了的；remove 云端还有、这边已经没有的（比如某个月的记录全删了）
   */
  function changes(parts, files) {
    const upload = Object.keys(parts).filter((n) => !files[n] || files[n].hash !== hash(parts[n]));
    const remove = Object.keys(files).filter((n) => isPart(n) && !parts[n]);
    return { upload, remove };
  }

  Baby.sync = { MAIN, isPart, hash, split, join, changes };
})();
