/* ============================================================
   墨泉 · 持久化层（localStorage + 内存降级）
   ============================================================ */
(function (MQ) {
  'use strict';

  const K_SETTINGS = 'mq.settings.v1';
  const K_NOVELS = 'mq.novels.v1';
  const K_DRAFTS = 'mq.drafts.v1';
  const K_STYLES = 'mq.styles.v1';

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

  /* ---------- 自定义文风 ---------- */
  function getCustomStyles() {
    try {
      const raw = lsGet(K_STYLES);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustomStyles(list) {
    lsSet(K_STYLES, JSON.stringify(Array.isArray(list) ? list : []));
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
    recordWcSnapshot(novel);
    const list = getNovels();
    const i = list.findIndex(n => n.id === novel.id);
    if (i >= 0) list[i] = novel;
    else list.unshift(novel);
    saveNovels(list);
  }

  function deleteNovel(id) {
    saveNovels(getNovels().filter(n => n.id !== id));
    clearNovelDrafts(id);
  }

  /* ---------- 写作台草稿（未保存内容，刷新后可恢复） ---------- */
  // 草稿按 novelId:chapterIndex 存储，最多保留 MAX_DRAFTS 个槽位，防止无限增长
  const MAX_DRAFTS = 20;

  function getDrafts() {
    try {
      const raw = lsGet(K_DRAFTS);
      const map = raw ? JSON.parse(raw) : {};
      return (map && typeof map === 'object') ? map : {};
    } catch (e) {
      return {};
    }
  }

  function saveDraft(novelId, chapterIndex, text, title) {
    const key = novelId + ':' + chapterIndex;
    const map = getDrafts();
    // 单条草稿上限 20 万字符，防止超大内容顶爆 localStorage（5MB 配额）
    map[key] = { text: text.length > 200000 ? text.slice(0, 200000) : text, title: title || '', updatedAt: Date.now() };
    // 只保留最近写入的 MAX_DRAFTS 个草稿
    const keys = Object.keys(map).sort((a, b) => (map[b].updatedAt || 0) - (map[a].updatedAt || 0));
    while (keys.length > MAX_DRAFTS) delete map[keys.pop()];
    lsSet(K_DRAFTS, JSON.stringify(map));
  }

  function getDraft(novelId, chapterIndex) {
    return getDrafts()[novelId + ':' + chapterIndex] || null;
  }

  function clearDraft(novelId, chapterIndex) {
    const map = getDrafts();
    if (!(novelId + ':' + chapterIndex in map)) return;
    delete map[novelId + ':' + chapterIndex];
    lsSet(K_DRAFTS, JSON.stringify(map));
  }

  function clearNovelDrafts(novelId) {
    const map = getDrafts();
    let changed = false;
    Object.keys(map).forEach(k => {
      if (k.indexOf(novelId + ':') === 0) { delete map[k]; changed = true; }
    });
    if (changed) lsSet(K_DRAFTS, JSON.stringify(map));
  }

  // 防抖自动保存
  const autoSave = MQ.debounce((novel) => {
    upsertNovel(novel);
  }, 600);

  /* ---------- 写作统计：字数日志（按日去重） ---------- */
  function recordWcSnapshot(novel) {
    if (!novel || !Array.isArray(novel.chapters)) return;
    const ts = Date.now();
    const wc = novel.chapters.reduce((s, c) => s + (c.wordCount || 0), 0);
    if (!Array.isArray(novel.wcLog)) novel.wcLog = [];
    const day = Math.floor(ts / 86400000); // UTC 日期编号
    const last = novel.wcLog.length ? novel.wcLog[novel.wcLog.length - 1] : null;
    // 同一天只保留最后一条；字数未变化也不记
    if (last && Math.floor(last.ts / 86400000) === day) {
      if (last.wc !== wc) { last.ts = ts; last.wc = wc; }
    } else if (!last || last.wc !== wc) {
      novel.wcLog.push({ ts, wc });
    }
    // 单本书最多保留 500 条日志（防止无限增长）
    if (novel.wcLog.length > 500) novel.wcLog = novel.wcLog.slice(-400);
  }

  MQ.Store = {
    getSettings,
    saveSettings,
    getNovels,
    saveNovels,
    getNovel,
    upsertNovel,
    deleteNovel,
    autoSave,
    saveDraft,
    getDraft,
    clearDraft,
    clearNovelDrafts,
    getCustomStyles,
    saveCustomStyles,
    recordWcSnapshot,
  };

})(window.MQ);
