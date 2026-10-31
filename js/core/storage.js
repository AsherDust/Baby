(function () {
  'use strict';
  const Baby = globalThis.Baby || (globalThis.Baby = {});

  const APP = 'honey-pot';
  const KEY = `${APP}:v1`;

  function load() {
    let raw;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    try {
      const state = Baby.model.normalize(JSON.parse(raw));
      if (state) {
        Baby.merge.track(state);
        return state;
      }
    } catch (e) {
      // 读不出来的数据在下面另存一份，避免被新数据覆盖后彻底丢失
    }
    try {
      localStorage.setItem(`${KEY}:unreadable:${Date.now()}`, raw);
    } catch (e) {
      // 存储已满时只能放弃这份副本
    }
    return null;
  }

  function save(state) {
    Baby.merge.track(state);
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      // 存储被禁用时没什么可清的
    }
  }

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

  Baby.storage = { APP, KEY, load, save, clear, backupText, parseBackup };
})();
