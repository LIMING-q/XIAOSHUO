/* ============================================================
   墨泉 · 持久化层（localStorage + 内存降级）
   ============================================================ */
(function (MQ) {
  'use strict';

  const K_SETTINGS = 'mq.settings.v1';
  const K_NOVELS = 'mq.novels.v1';

  const mem = {};

  function lsGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return mem[key] || null; }
  }
  function lsSet(key, val) {
    try { window.localStorage.setItem(key, val); } catch (e) { mem[key] = val; }
  }
  function lsRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { delete mem[key]; }
  }

  /* ---------- 设置 ---------- */
  function getSettings() {
    try {
      const raw = lsGet(K_SETTINGS);
      return raw ? JSON.parse(raw) : { ai: {} };
    } catch (e) {
      return { ai: {} };
    }
  }

  function saveSettings(settings) {
    lsSet(K_SETTINGS, JSON.stringify(settings));
  }

  /* ---------- 书架 ---------- */
  function getNovels() {
    try {
      const raw = lsGet(K_NOVELS);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveNovels(list) {
    lsSet(K_NOVELS, JSON.stringify(list));
  }

  function getNovel(id) {
    return getNovels().find(n => n.id === id) || null;
  }

  function upsertNovel(novel) {
    const list = getNovels();
    const i = list.findIndex(n => n.id === novel.id);
    if (i >= 0) list[i] = novel;
    else list.unshift(novel);
    saveNovels(list);
  }

  function deleteNovel(id) {
    saveNovels(getNovels().filter(n => n.id !== id));
  }

  // 防抖自动保存
  const autoSave = MQ.debounce((novel) => {
    upsertNovel(novel);
  }, 600);

  MQ.Store = {
    getSettings,
    saveSettings,
    getNovels,
    saveNovels,
    getNovel,
    upsertNovel,
    deleteNovel,
    autoSave,
  };

})(window.MQ);
