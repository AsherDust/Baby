(function () {
  'use strict';
  // 给人看的话按键从词典里取（词典在 lang/ 下，现在只有中文）。
  // 核心逻辑不拼句子，返回 msg(键, 参数)；界面用 t() 变成这台手机的语言
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const LANG = 'zh';

  /** 一句话：键和参数，还不是文字 */
  const msg = (key, params) => (params ? { key, params } : { key });

  /**
   * 按键取话，{名字} 换成参数里的；也可以直接给 msg() 的结果。
   * 词典里没有的原样返回（本来就是一句话，或者漏了的键，页面上一眼看得出）
   */
  function t(key, params) {
    if (key && typeof key === 'object') return t(key.key, key.params);
    const text = ((Baby.lang && Baby.lang[LANG]) || {})[key];
    if (typeof text !== 'string') return key == null ? '' : String(key);
    return params ? text.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k]))) : text;
  }

  Baby.i18n = { msg, t };
})();
