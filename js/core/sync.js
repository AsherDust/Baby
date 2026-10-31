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

  /**
   * 判断要不要重新传用的指纹，只看内容：
   * - 字段的顺序、空着的字段不算（刚记下的和读出来整理过的，字不一样内容一样）
   * - main.json 里每台设备自己的东西不算：设置（餐后几小时测血糖除外）、弹过的提醒、
   *   睡前故事读到哪、语速声音（收藏和不想听的除外）。合并时这些都留本机的
   * 不然拉完云端以后总觉得「变了」，又传一次
   */
  function fingerprint(name, text) {
    const raw = JSON.parse(text);
    if (name === MAIN) {
      const prefs = raw.prefs || {};
      const stories = raw.stories || {};
      raw.prefs = { glucoseAfter: prefs.glucoseAfter };
      raw.stories = { favorites: stories.favorites, blocked: stories.blocked };
      delete raw.notified;
    }
    return hash(JSON.stringify(Baby.merge.canon(raw)));
  }

  /** 拆成 { 文件名: 明文 } */
  function split(state) {
    const logs = state.baby ? state.baby.logs : [];
    const main = state.baby ? { ...state, baby: { ...state.baby, logs: [] } } : state;
    const parts = { [MAIN]: JSON.stringify({ app: Baby.storage.APP, ...main }) };
    const months = {};
    for (const l of logs) (months[monthOf(l.start)] = months[monthOf(l.start)] || []).push(l);
    // 同一时刻的两条按编号排，同样的记录在每台手机上拆出来的字一模一样
    const order = (a, b) => a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    for (const m of Object.keys(months).sort()) parts[`logs-${m}.json`] = JSON.stringify(months[m].sort(order));
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
    const upload = Object.keys(parts).filter((n) => !files[n] || files[n].hash !== fingerprint(n, parts[n]));
    const remove = Object.keys(files).filter((n) => isPart(n) && !parts[n]);
    return { upload, remove };
  }

  Baby.sync = { MAIN, isPart, hash, fingerprint, split, join, changes };
})();
