(function () {
  'use strict';
  // 几个核心模块都要用的小工具，最先加载
  const Baby = globalThis.Baby || (globalThis.Baby = {});

  const pad = (n) => String(n).padStart(2, '0');
  /** 字符串去掉首尾空白、截到 max 个字；不是字符串就是 '' */
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const isBlank = (v) => v == null || String(v).trim() === '';
  const isClock = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  /** 毫秒时间戳 */
  const isTime = (v) => Number.isFinite(v) && v > 0;
  /** 数字或者用户填的字（逗号当小数点）；认不出来是 NaN */
  const toNumber = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(/[,，]/, '.')));
  const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const byStart = (a, b) => a.start - b.start;

  /** FNV-1a（32 位）：同一个日期、编号总挑出同一个结果 */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  Baby.util = { pad, text, isBlank, isClock, isTime, toNumber, newId, byStart, hash };
})();
