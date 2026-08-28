/* ============================================================
   墨泉 · 应用主逻辑
   ============================================================ */
(function (MQ) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /* ---------- 全局状态 ---------- */
  const state = {
    view: 'shelf',
    currentNovel: null,
    currentChapter: 0,
    generating: false,
    outlineEngine: 'local', // 大纲生成方式：local | ai
    charEngine: 'local',   // 角色生成方式：local | ai
    compareMode: 'orig',   // 重写对比：orig | rew
    charGraph: false,      // 角色页：关系图模式
    selectedRelNode: '',   // 关系图中选中的节点
    fsOpen: false,         // 大纲页：伏笔追踪面板展开
    fsFilter: 'all',       // 伏笔筛选：all | done | pending
    tlOpen: false,         // 大纲页：时间线面板展开
  };

  /* ---------- 写作台草稿自动保存 ---------- */
  let draftTimer = null;    // 5 秒自动保存定时器
  let draftCtx = null;      // 当前草稿上下文（页面离开时立即刷新用）
  let draftHooksBound = false;

  // 当前写作台可执行的动作（由 renderWriterTab 刷新，供键盘快捷键调用）
  let writerShortcuts = null; // { generate, cont, save, prev, next }

  /* ---------- 编辑器撤销/重做 ---------- */
  const undoStack = []; // [{ text, cursorOffset }]
  const redoStack = [];
  const UNDO_MAX = 50;
  let lastUndoSnapshot = ''; // 防抖：内容未变不压栈

  function pushUndo(text) {
    if (text === lastUndoSnapshot) return; // 内容没变，跳过
    undoStack.push({ text: lastUndoSnapshot, ts: Date.now() });
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack.length = 0; // 新操作清空重做栈
    lastUndoSnapshot = text;
  }

  function undo() {
    if (!undoStack.length) return;
    const pt = document.querySelector('.paper-text');
    if (!pt) return;
    const cur = pt.innerText;
    // 当前状态压入重做栈
    redoStack.push({ text: cur, ts: Date.now() });
    // 弹出上一个状态
    const prev = undoStack.pop();
    pt.innerText = prev.text;
    lastUndoSnapshot = prev.text;
    // 同步到章节
    const n = state.currentNovel;
    if (n) {
      const c = n.chapters[state.currentChapter];
      if (c) { c.text = pt.innerText.trim(); c.wordCount = MQ.countChars(c.text); MQ.Store.upsertNovel(n); }
    }
    toast('已撤销', 'ok');
  }

  function redo() {
    if (!redoStack.length) return;
    const pt = document.querySelector('.paper-text');
    if (!pt) return;
    const cur = pt.innerText;
    undoStack.push({ text: cur, ts: Date.now() });
    const next = redoStack.pop();
    pt.innerText = next.text;
    lastUndoSnapshot = next.text;
    const n = state.currentNovel;
    if (n) {
      const c = n.chapters[state.currentChapter];
      if (c) { c.text = pt.innerText.trim(); c.wordCount = MQ.countChars(c.text); MQ.Store.upsertNovel(n); }
    }
    toast('已重做', 'ok');
  }

  /* ---------- 生成历史快照（每次生成本章/续写自动保存，最多 5 份） ---------- */
  // 存于书对象 novel.history = { [章节索引]: [{ text, ts, via, ai, wc }] }
  // via: 'pre' 生成/续写前保留 · 'gen' 生成本章结果 · 'cont' 续写结果
  const HISTORY_MAX = 5;
  function pushChapterSnapshot(n, chapterIndex, text, via, ai) {
    text = (text || '').trim();
    if (!text) return;
    if (!n.history) n.history = {};
    const list = n.history[chapterIndex] || [];
    const last = list[list.length - 1];
    if (last && last.text === text) return; // 与最新快照相同则去重（如：生成前状态已是最新快照）
    list.push({ text, ts: Date.now(), via, ai: !!ai, wc: MQ.countChars(text) });
    n.history[chapterIndex] = list.slice(-HISTORY_MAX);
  }

  // 快照徽标文案
  function snapshotLabel(s) {
    if (s.via === 'pre') return '✏️ 生成前保留';
    if (s.via === 'cont') return s.ai ? '✨ AI 续写' : '🖋️ 本地续写';
    return s.ai ? '✨ AI 生成' : '🖋️ 本地生成';
  }

  /* ---------- 写作台纸张质感（深色护眼 / 宣纸米白 / 羊皮纸） ---------- */
  const PAPER_THEMES = ['rice', 'white', 'warm', 'parchment', 'forest', 'dark'];
  function setPaperTheme(name) {
    const t = PAPER_THEMES.includes(name) ? name : 'rice';
    document.body.setAttribute('data-paper', t);
    // 同步所有切换控件（工具栏下拉 / 专注栏圆点）
    document.querySelectorAll('.paper-select').forEach(sel => { sel.value = t; });
    document.querySelectorAll('.paper-dot').forEach(d => d.classList.toggle('on', d.dataset.paper === t));
    const s = MQ.Store.getSettings();
    if (s.paperTheme !== t) { s.paperTheme = t; MQ.Store.saveSettings(s); }
  }

  /* ---------- 写作台专注模式 ---------- */
  // persist=false 时只应用/移除视觉状态（切标签、换视图时不覆盖持久化偏好）
  function setFocusMode(on, persist) {
    const active = document.body.classList.toggle('focus-mode', !!on);
    let bar = document.getElementById('focus-bar');
    if (active && !bar) {
      const cur = MQ.Store.getSettings().paperTheme || 'rice';
      bar = MQ.el('div', { id: 'focus-bar', class: 'focus-bar' }, [
        MQ.el('div', { class: 'focus-papers', title: '纸张质感' }, [
          MQ.el('button', { class: 'paper-dot' + (cur === 'white' ? ' on' : ''), 'data-paper': 'white', title: '📄 纯白', onclick: () => setPaperTheme('white') }),
          MQ.el('button', { class: 'paper-dot' + (cur === 'rice' ? ' on' : ''), 'data-paper': 'rice', title: '📜 宣纸米白', onclick: () => setPaperTheme('rice') }),
          MQ.el('button', { class: 'paper-dot' + (cur === 'warm' ? ' on' : ''), 'data-paper': 'warm', title: '🕯️ 暖黄', onclick: () => setPaperTheme('warm') }),
          MQ.el('button', { class: 'paper-dot' + (cur === 'parchment' ? ' on' : ''), 'data-paper': 'parchment', title: '🧻 羊皮纸', onclick: () => setPaperTheme('parchment') }),
          MQ.el('button', { class: 'paper-dot' + (cur === 'forest' ? ' on' : ''), 'data-paper': 'forest', title: '🌿 墨绿', onclick: () => setPaperTheme('forest') }),
          MQ.el('button', { class: 'paper-dot' + (cur === 'dark' ? ' on' : ''), 'data-paper': 'dark', title: '🌙 深色护眼', onclick: () => setPaperTheme('dark') }),
        ]),
        MQ.el('button', {
          id: 'focus-exit', class: 'focus-exit', text: '✕ 退出专注',
          title: '快捷键 Esc',
          onclick: () => setFocusMode(false),
        }),
      ]);
      document.body.appendChild(bar);
    } else if (!active && bar) {
      bar.remove();
    }
    if (persist !== false) {
      const s = MQ.Store.getSettings();
      if (!!s.focusMode !== active) {
        s.focusMode = active;
        MQ.Store.saveSettings(s);
      }
    }
    if (active) window.scrollTo(0, 0);
  }

  // 「X 秒/分钟/小时前」相对时间
  function fmtAgo(ts) {
    if (!ts) return '';
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return s + ' 秒前';
    const m = Math.round(s / 60);
    if (m < 60) return m + ' 分钟前';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' 小时前';
    return Math.round(h / 24) + ' 天前';
  }

  // 把当前编辑器内容写入草稿（空内容不写，避免留空槽）
  function flushDraft() {
    if (!draftCtx) return;
    const text = draftCtx.getText().trim();
    if (!text) return;
    MQ.Store.saveDraft(draftCtx.novelId, draftCtx.chapterIndex, text, draftCtx.title);
  }

  // 页面刷新 / 关闭 / 切后台时，把最后状态写入草稿（只绑定一次）
  function bindDraftHooks() {
    if (draftHooksBound) return;
    draftHooksBound = true;
    window.addEventListener('pagehide', flushDraft);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushDraft();
    });
  }

  /* ---- 生成引擎切换 pills（本地模板 / AI 深度创作） ---- */
  function enginePills(current, onChange) {
    const wrap = MQ.el('div', { class: 'engine-pills', title: '选择本模块的生成方式' });
    [['local', '📋 本地模板'], ['ai', '✨ AI 深度']].forEach(([v, label]) => {
      wrap.appendChild(MQ.el('button', {
        class: 'epill' + (current === v ? ' active' : ''),
        text: label,
        onclick: () => onChange(v),
      }));
    });
    return wrap;
  }

  // 持久化模块引擎偏好（随 AI 设置一起保存）
  function saveModulePrefs() {
    const s = MQ.Store.getSettings();
    s.outlineEngine = state.outlineEngine;
    s.charEngine = state.charEngine;
    MQ.Store.saveSettings(s);
  }

  /* ============================================================
     Toast
     ============================================================ */
  function toast(msg, type) {
    const root = $('toast-root');
    const t = MQ.el('div', { class: 'toast ' + (type || ''), text: msg });
    root.appendChild(t);
    // 错误提示停留更久，避免一闪而过被忽略
    const dur = type === 'err' ? 4600 : 2600;
    setTimeout(() => {
      t.classList.add('leaving');
      setTimeout(() => t.remove(), 260);
    }, dur);
  }

  /* ============================================================
     AI 任务进度浮层：循环切换阶段文案 + 实时耗时
     ============================================================ */
  let _progress = null;
  function progressOverlay(phases, onCancel) {
    if (_progress) _progress.remove();
    const el = MQ.el('div', { class: 'progress-overlay' }, [
      MQ.el('span', { class: 'po-spin', text: '◌' }),
      MQ.el('span', { class: 'po-label', text: phases[0] }),
      MQ.el('span', { class: 'po-retry', text: '' }),
      MQ.el('span', { class: 'po-time', text: '' }),
      onCancel ? MQ.el('button', { class: 'po-cancel', text: '✕ 取消', onclick: () => onCancel() }) : null,
    ]);
    document.body.appendChild(el);
    const t0 = Date.now();
    let pi = 0;
    const t1 = setInterval(() => {
      pi = (pi + 1) % phases.length;
      el.querySelector('.po-label').textContent = phases[pi];
    }, 700);
    const t2 = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      el.querySelector('.po-time').textContent = s + 's';
    }, 500);
    const prog = {
      el,
      retry(n) {
        el.querySelector('.po-retry').textContent = '第 ' + n + ' 次尝试';
        el.classList.add('retrying');
      },
      // 用户点击取消：按钮进入「取消中…」状态，等待请求中断
      cancelling() {
        const cb = el.querySelector('.po-cancel');
        if (cb) { cb.textContent = '取消中…'; cb.disabled = true; }
        el.classList.add('cancelling');
      },
      finish(finalText) {
        clearInterval(t1); clearInterval(t2);
        const cb = el.querySelector('.po-cancel');
        if (cb) cb.remove();
        el.querySelector('.po-spin').textContent = '✓';
        el.querySelector('.po-retry').textContent = '';
        el.classList.remove('retrying', 'cancelling');
        el.querySelector('.po-label').textContent = finalText || '完成';
        el.classList.add('done');
        setTimeout(() => prog.remove(), 900);
      },
      // 失败/取消：在浮层上直接显示原因并停留 1.6s，避免「没反应」的错觉（幂等）
      fail(msg) {
        if (el.classList.contains('failed')) return;
        clearInterval(t1); clearInterval(t2);
        const cb = el.querySelector('.po-cancel');
        if (cb) cb.remove();
        el.querySelector('.po-spin').textContent = '✕';
        el.querySelector('.po-retry').textContent = '';
        el.classList.remove('retrying', 'cancelling');
        el.querySelector('.po-label').textContent = msg || '失败';
        el.classList.add('failed');
        setTimeout(() => prog.remove(), 1600);
      },
      remove() {
        clearInterval(t1); clearInterval(t2);
        const cb = el.querySelector('.po-cancel');
        if (cb) cb.remove();
        el.querySelector('.po-retry').textContent = '';
        if (el.parentNode) el.parentNode.removeChild(el);
        if (_progress === prog) _progress = null;
      },
    };
    _progress = prog;
    return prog;
  }

  /* ============================================================
     视图路由
     ============================================================ */
  function showView(name) {
    state.view = name;
    if (name !== 'studio') { // 离开工作台：停止草稿自动保存，避免引用已卸载的编辑器
      clearInterval(draftTimer);
      draftTimer = null;
      draftCtx = null;
      setFocusMode(false, false); // 收起专注模式（不覆盖偏好）
    }
    ['shelf', 'create', 'studio', 'stats'].forEach(v => $('view-' + v).classList.toggle('hidden', v !== name));
    if (name === 'shelf') renderShelf();
    if (name === 'stats') renderStats();
    if (name === 'studio' && state.currentNovel) renderStudio();
    window.scrollTo(0, 0);
  }

  /* ---- 书架 SVG 封面生成 ---- */
  function generateBookCover(n) {
    const genreColors = {
      'xuanhuan': '#8b5cf6', 'xianxia': '#6366f1', 'dushi': '#3b82f6',
      'kehuan': '#06b6d4', 'wuxia': '#d97706', 'xuanyi': '#64748b',
      'yanqing': '#ec4899', 'lishi': '#92400e', 'qihuan': '#7c3aed',
      'moshi': '#dc2626', 'wuxianliu': '#0891b2',
    };
    const bg = genreColors[n.genreId] || '#4a5568';
    const title = (n.title || '未命名').slice(0, 6);
    const lines = [];
    for (let i = 0; i < title.length && i < 3; i++) {
      lines.push(`<text x="50%" y="${38 + i * 22}" text-anchor="middle" fill="white" font-size="18" font-weight="bold" font-family="serif">${title[i]}</text>`);
    }
    if (title.length > 3) {
      lines.push(`<text x="50%" y="${38 + 3 * 22}" text-anchor="middle" fill="white" font-size="18" font-weight="bold" font-family="serif">${title.slice(3)}</text>`);
    }
    return `<svg viewBox="0 0 80 110" xmlns="http://www.w3.org/2000/svg" style="width:100%;border-radius:6px">
      <defs><linearGradient id="g${n.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="${bg}88"/></linearGradient></defs>
      <rect width="80" height="110" rx="6" fill="url(#g${n.id})"/>
      <line x1="10" y1="90" x2="70" y2="90" stroke="rgba(255,255,255,.3)" stroke-width="1"/>
      <text x="50%" y="102" text-anchor="middle" fill="rgba(255,255,255,.6)" font-size="9" font-family="serif">${n.genreIcon || '📖'}</text>
      ${lines.join('')}
    </svg>`;
  }

  /* ============================================================
     书架
     ============================================================ */
  function renderShelf() {
    const grid = $('shelf-grid');
    grid.innerHTML = '';
    const novels = MQ.Store.getNovels();

    // 排序偏好
    const settings = MQ.Store.getSettings();
    const sortBy = settings.shelfSort || 'updated';
    const sortSel = document.getElementById('shelf-sort');
    if (sortSel) {
      sortSel.value = sortBy;
      sortSel.onchange = () => { settings.shelfSort = sortSel.value; MQ.Store.saveSettings(settings); renderShelf(); };
    }

    // 排序
    novels.sort((a, b) => {
      if (sortBy === 'words') return (b.wordCount || 0) - (a.wordCount || 0);
      if (sortBy === 'progress') {
        const pA = (a.chapters && a.chapters.length) ? a.chapters.filter(c => c.text).length / a.chapters.length : 0;
        const pB = (b.chapters && b.chapters.length) ? b.chapters.filter(c => c.text).length / b.chapters.length : 0;
        return pB - pA;
      }
      // updated: 按 updatedAt 降序（最新的在前）；无 updatedAt 的放在最后
      const ua = typeof a.updatedAt === 'string' ? new Date(a.updatedAt).getTime() : 0;
      const ub = typeof b.updatedAt === 'string' ? new Date(b.updatedAt).getTime() : 0;
      return ub - ua;
    });

    const newCard = MQ.el('div', {
      class: 'new-card',
      onclick: () => showView('create'),
    }, [
      MQ.el('div', { class: 'nc-plus', text: '＋' }),
      MQ.el('div', { text: '创作新小说' }),
    ]);
    grid.appendChild(newCard);

    novels.forEach(n => {
      const done = n.chapters ? n.chapters.filter(c => c.text).length : 0;
      const total = n.chapters ? n.chapters.length : 0;
      const pct = total ? Math.round(done / total * 100) : 0;
      // 生成 SVG 封面
      const coverSvg = generateBookCover(n);
      const card = MQ.el('div', {
        class: 'novel-card card',
        onclick: () => openNovel(n.id),
      }, [
        MQ.el('div', { class: 'nc-cover', html: coverSvg }),
        MQ.el('div', { class: 'nc-title', text: n.title }),
        MQ.el('span', { class: 'nc-genre', text: `${n.genreIcon} ${n.genreName}` }),
        MQ.el('div', { class: 'nc-meta', text: `${MQ.countChars(n.chapters.map(c => c.text).join(''))} 字 · ${done}/${total} 章` }),
        MQ.el('div', { class: 'nc-progress' }, [MQ.el('i', { style: `width:${pct}%` })]),
        (n.lastChapter > 0)
          ? MQ.el('div', { class: 'nc-resume', text: `📖 上次读到 第${MQ.cnNum(n.lastChapter + 1)}章${n.chapters[n.lastChapter] ? ' · ' + n.chapters[n.lastChapter].title : ''}` })
          : null,
        MQ.el('button', {
          class: 'icon-btn nc-export', text: '⬇️', title: '导出整本备份（JSON）',
          onclick: (e) => {
            e.stopPropagation();
            exportBookJSON(n);
          },
        }),
        MQ.el('button', {
          class: 'icon-btn nc-del', text: '✕', title: '删除',
          onclick: (e) => {
            e.stopPropagation();
            if (confirm(`确定删除《${n.title}》吗？此操作不可恢复。`)) {
              MQ.Store.deleteNovel(n.id);
              renderShelf();
              toast('已删除', 'ok');
            }
          },
        }),
      ]);
      grid.appendChild(card);
    });
  }

  /* ============================================================
     统计面板
     ============================================================ */
  function renderStats() {
    const novels = MQ.Store.getNovels();
    const now = Date.now();
    const dayMs = 86400000;

    // 合并所有小说的每日字数增量
    // 每本小说把 wcLog 转为每日增量（当天最后 wc - 前一天最后 wc），按天累加各小说增量
    const dailyAddMap = {}; // dayKey -> totalAddedToday
    novels.forEach(n => {
      const log = n.wcLog || [];
      if (!log.length) return;
      const novelDay = {};
      log.forEach(entry => {
        const dk = Math.floor(entry.ts / dayMs);
        if (!novelDay[dk] || entry.ts > novelDay[dk].ts) novelDay[dk] = entry.wc;
      });
      const entries = Object.entries(novelDay).sort((a, b) => Number(a[0]) - Number(b[0]));
      let prevWc = 0;
      entries.forEach(([dk, wc]) => {
        const add = Math.max(0, wc - prevWc);
        dailyAddMap[dk] = (dailyAddMap[dk] || 0) + add;
        prevWc = wc;
      });
    });

    // 转为有序数组（累积总字数）
    let running = 0;
    const days = Object.entries(dailyAddMap).map(([dk, add]) => {
      running += add;
      return { dk: Number(dk), date: new Date(Number(dk) * dayMs), wc: running, add };
    }).sort((a, b) => a.dk - b.dk);

    // 总结数字
    const totalWc = novels.reduce((s, n) => s + (n.wordCount || 0), 0);
    const totalChapters = novels.reduce((s, n) => s + (n.chapters ? n.chapters.length : 0), 0);
    const doneChapters = novels.reduce((s, n) => s + (n.chapters ? n.chapters.filter(c => c.text).length : 0), 0);

    // 连续写作天数（streak）：从 today 往回数，每天都有增量
    const todayDk = Math.floor(now / dayMs);

    // 每日字数目标（持久化到设置）
    const settings = MQ.Store.getSettings();
    const dailyGoal = settings.dailyGoal || 500;
    const goalSelect = document.getElementById('st-goal');
    if (goalSelect) { goalSelect.value = dailyGoal; goalSelect.onchange = () => { settings.dailyGoal = Number(goalSelect.value); MQ.Store.saveSettings(settings); renderStats(); }; }

    // 今日增量
    const todayDelta = dailyAddMap[todayDk] || 0;
    const metGoal = todayDelta >= dailyGoal;

    let streak = 0;
    for (let dk = todayDk; dk >= 0; dk--) {
      if (dailyAddMap[dk]) streak++;
      else break;
    }
    if (!dailyAddMap[todayDk] && streak === 0) {
      for (let dk = todayDk - 1; dk >= 0; dk--) {
        if (dailyAddMap[dk]) streak++;
        else break;
      }
    }

    // 每日写作量
    const dailyDelta = days.map(d => ({ dk: d.dk, date: d.date, delta: d.add, totalWc: d.wc }));

    // 只显示最近 14 天
    const recent = dailyDelta.slice(-14);
    const maxDelta = recent.length ? Math.max(...recent.map(d => d.delta), 1) : 1;

    // 最近 7 天累计
    const last7 = dailyDelta.slice(-7);
    const weekWc = last7.reduce((s, d) => s + d.delta, 0);

    const fmtDate = (d) => {
      const m = d.getMonth() + 1;
      const day = d.getDate();
      return m + '/' + day;
    };

    const fmtNum = (n) => n >= 10000 ? (n / 10000).toFixed(1) + '万' : n.toLocaleString();

    $('stats-body').innerHTML = '';
    const body = $('stats-body');

    // 概览卡片
    const cards = [
      { icon: '📝', label: '总字数', val: fmtNum(totalWc), sub: '' },
      { icon: '📖', label: '总章节', val: totalChapters, sub: doneChapters + ' 章已完成' },
      { icon: '📚', label: '作品数', val: novels.length, sub: novels.length ? '' : '还没有作品' },
      { icon: '🔥', label: '连续写作', val: streak + ' 天', sub: streak > 0 ? (streak >= 7 ? '太厉害了！' : '继续保持') : '今天开始写吧' },
    ];
    const cardRow = MQ.el('div', { class: 'st-cards' });
    cards.forEach(c => {
      cardRow.appendChild(MQ.el('div', { class: 'st-card card' }, [
        MQ.el('div', { class: 'stc-icon', text: c.icon }),
        MQ.el('div', { class: 'stc-val', text: c.val }),
        MQ.el('div', { class: 'stc-label', text: c.label }),
        c.sub ? MQ.el('div', { class: 'stc-sub', text: c.sub }) : null,
      ]));
    });
    body.appendChild(cardRow);

    // 每日目标提醒条
    if (novels.length) {
      const alertEl = MQ.el('div', {
        class: 'st-alert ' + (metGoal ? 'st-alert-ok' : 'st-alert-warn'),
        text: metGoal
          ? '✅ 今日已达标 ' + fmtNum(todayDelta) + ' / ' + dailyGoal + ' 字，继续保持！'
          : '⚠️ 今日进度 ' + fmtNum(todayDelta) + ' / ' + dailyGoal + ' 字' + (todayDelta ? '，还差 ' + fmtNum(dailyGoal - todayDelta) + ' 字' : '，还没开始写呢'),
      });
      body.appendChild(alertEl);
    }

    // 最近一周统计
    if (weekWc > 0) {
      body.appendChild(MQ.el('div', { class: 'st-week', text: `📅 最近 7 天写作 ${fmtNum(weekWc)} 字` }));
    }

    // 每日写作量柱状图
    if (recent.length) {
      const chartWrap = MQ.el('div', { class: 'st-chart card' });
      chartWrap.appendChild(MQ.el('div', { class: 'st-chart-title', text: '📊 每日写作量（近 14 天）' }));
      const bars = MQ.el('div', { class: 'st-bars' });
      const todayDk2 = Math.floor(now / dayMs);
      recent.forEach(d => {
        const pct = Math.round(d.delta / maxDelta * 100);
        const isToday = d.dk === todayDk2;
        const belowGoal = d.delta < dailyGoal;
        const barCls = 'st-bar' +
          (isToday ? ' st-bar-today' : '') +
          (belowGoal ? ' st-bar-warn' : ' st-bar-ok');
        const barCol = MQ.el('div', { class: 'st-bar-col' });
        barCol.appendChild(MQ.el('div', { class: 'st-bar-val', text: d.delta ? fmtNum(d.delta) : '' }));
        barCol.appendChild(MQ.el('div', { class: 'st-bar-wrap' }, [
          MQ.el('div', { class: barCls, style: 'height:' + Math.max(pct, d.delta ? 4 : 0) + '%' }),
        ]));
        barCol.appendChild(MQ.el('div', { class: 'st-bar-label', text: fmtDate(d.date) }));
        bars.appendChild(barCol);
      });
      chartWrap.appendChild(bars);
      body.appendChild(chartWrap);
    }

    // 各作品字数分布
    if (novels.length) {
      const novelBreakdown = MQ.el('div', { class: 'st-chart card' });
      novelBreakdown.appendChild(MQ.el('div', { class: 'st-chart-title', text: '📚 作品字数分布' }));
      const maxNovelWc = Math.max(...novels.map(n => n.wordCount || 0), 1);
      novels.forEach(n => {
        const wc = n.wordCount || 0;
        const pct = Math.round(wc / maxNovelWc * 100);
        const row = MQ.el('div', { class: 'st-novel-row' });
        row.appendChild(MQ.el('div', { class: 'st-novel-name', text: (n.genreIcon || '📖') + ' ' + n.title }));
        row.appendChild(MQ.el('div', { class: 'st-novel-bar-wrap' }, [
          MQ.el('div', { class: 'st-novel-bar', style: 'width:' + Math.max(pct, 1) + '%' }),
        ]));
        row.appendChild(MQ.el('div', { class: 'st-novel-wc', text: fmtNum(wc) + ' 字' }));
        novelBreakdown.appendChild(row);
      });
      body.appendChild(novelBreakdown);

      // 章节字数分布直方图
      const allChs = novels.flatMap(n => (n.chapters || []).filter(c => c.text));
      if (allChs.length) {
        const maxChWc = Math.max(...allChs.map(c => c.wordCount || 0), 1);
        const chartWrap = MQ.el('div', { class: 'st-chart card' });
        chartWrap.appendChild(MQ.el('div', { class: 'st-chart-title', text: '📊 章节字数分布（共 ' + allChs.length + ' 章）' }));
        const avgWc = Math.round(allChs.reduce((s, c) => s + (c.wordCount || 0), 0) / allChs.length);
        chartWrap.appendChild(MQ.el('div', { class: 'st-week', html: `平均每章 <b>${fmtNum(avgWc)}</b> 字 · 最多 ${fmtNum(maxChWc)} 字` }));
        const barsWrap = MQ.el('div', { class: 'st-ch-bars' });
        allChs.slice(0, 60).forEach((c, i) => {
          const wc = c.wordCount || 0;
          const pct = Math.round(wc / maxChWc * 100);
          const aboveAvg = wc > avgWc;
          const bar = MQ.el('div', { class: 'st-ch-bar-wrap', title: `${c.title}：${wc} 字` });
          bar.appendChild(MQ.el('div', {
            class: 'st-ch-bar' + (aboveAvg ? ' st-ch-above' : ''),
            style: 'width:' + Math.max(1, pct) + '%',
          }));
          bar.appendChild(MQ.el('span', { class: 'st-ch-label', text: c.title.length > 6 ? c.title.slice(0,6)+'…' : c.title }));
          barsWrap.appendChild(bar);
        });
        chartWrap.appendChild(barsWrap);
        // 平均线标注
        const avgPct = Math.round(avgWc / maxChWc * 100);
        chartWrap.appendChild(MQ.el('div', { class: 'st-ch-avg', style: 'left:' + avgPct + '%', text: `平均 ${fmtNum(avgWc)} 字` }));
        body.appendChild(chartWrap);
      }

      // 写作日历热力图（过去 12 个月）
      const yearAgoDk = Math.floor((now - 365 * dayMs) / dayMs);
      const maxDayAdd = Math.max(...Object.values(dailyAddMap), 1);
      if (maxDayAdd > 0) {
        const heatWrap = MQ.el('div', { class: 'st-chart card' });
        heatWrap.appendChild(MQ.el('div', { class: 'st-chart-title', text: '🗓️ 写作日历（过去一年）' }));

        // 按周分组（周日开始）
        const weeks = [];
        let curWeek = [];
        // 从一年前所在的周日开始
        let dk = yearAgoDk;
        while (new Date(dk * dayMs).getDay() !== 0) dk--;
        const endDk = todayDk + (6 - new Date(todayDk * dayMs).getDay());
        while (dk <= endDk) {
          curWeek.push(dk);
          if (new Date(dk * dayMs).getDay() === 6) {
            weeks.push(curWeek);
            curWeek = [];
          }
          dk++;
        }
        if (curWeek.length) weeks.push(curWeek);

        const grid = MQ.el('div', { class: 'st-heat-grid' });
        // 星期标签
        const dayLabels = ['', '一', '', '三', '', '五', ''];
        for (let r = 0; r < 7; r++) {
          const row = MQ.el('div', { class: 'st-heat-row' });
          row.appendChild(MQ.el('span', { class: 'st-heat-dl', text: dayLabels[r] }));
          weeks.forEach(w => {
            const d = w[r];
            if (d === undefined) { row.appendChild(MQ.el('span', { class: 'st-heat-empty' })); return; }
            const add = dailyAddMap[d] || 0;
            const level = add === 0 ? 0 : Math.min(4, Math.ceil(add / maxDayAdd * 4));
            row.appendChild(MQ.el('span', {
              class: 'st-heat-cell st-heat-l' + level,
              title: new Date(d * dayMs).toLocaleDateString('zh-CN') + '：' + fmtNum(add) + ' 字',
            }));
          });
          grid.appendChild(row);
        }
        // 月份标签
        const monthRow = MQ.el('div', { class: 'st-heat-row' });
        monthRow.appendChild(MQ.el('span', { class: 'st-heat-dl', text: '' }));
        let lastMonth = -1;
        weeks.forEach(w => {
          const dk2 = w[0];
          const m = new Date(dk2 * dayMs).getMonth();
          if (m !== lastMonth) {
            monthRow.appendChild(MQ.el('span', { class: 'st-heat-ml', text: (m + 1) + '月' }));
            lastMonth = m;
          } else {
            monthRow.appendChild(MQ.el('span', { class: 'st-heat-ml', text: '' }));
          }
        });
        grid.appendChild(monthRow);

        heatWrap.appendChild(grid);
        // 图例
        heatWrap.appendChild(MQ.el('div', { class: 'st-heat-legend', html: '少 ' +
          [0,1,2,3,4].map(l => `<span class="st-heat-cell st-heat-l${l}" style="display:inline-block"></span>`).join('') + ' 多'
        }));
        body.appendChild(heatWrap);
      }
    }

    // 空状态
    if (!novels.length) {
      body.appendChild(MQ.el('div', { class: 'st-empty' }, [
        MQ.el('div', { class: 'st-empty-icon', text: '📊' }),
        MQ.el('div', { class: 'st-empty-text', text: '还没有写作数据' }),
        MQ.el('div', { class: 'st-empty-sub', text: '创建小说并开始写作后，统计数据会出现在这里。' }),
      ]));
    }
  }

  /* ---------- 导出统计报告 HTML ---------- */
  function exportStatsReport() {
    const novels = MQ.Store.getNovels();
    const now = Date.now();
    const dayMs = 86400000;
    const dailyGoal = (MQ.Store.getSettings()).dailyGoal || 500;
    const todayDk = Math.floor(now / dayMs);

    // 复用 renderStats 的数据逻辑（简化版）
    const dailyAddMap = {};
    novels.forEach(n => {
      const log = n.wcLog || [];
      if (!log.length) return;
      const novelDay = {};
      log.forEach(e => { const dk = Math.floor(e.ts / dayMs); if (!novelDay[dk] || e.ts > novelDay[dk].ts) novelDay[dk] = e.wc; });
      const entries = Object.entries(novelDay).sort((a, b) => Number(a[0]) - Number(b[0]));
      let prevWc = 0;
      entries.forEach(([dk, wc]) => { dailyAddMap[dk] = (dailyAddMap[dk] || 0) + Math.max(0, wc - prevWc); prevWc = wc; });
    });

    let running = 0;
    const days = Object.entries(dailyAddMap).map(([dk, add]) => { running += add; return { dk: Number(dk), add, wc: running }; }).sort((a, b) => a.dk - b.dk);
    const totalWc = novels.reduce((s, n) => s + (n.wordCount || 0), 0);
    const totalCh = novels.reduce((s, n) => s + (n.chapters ? n.chapters.length : 0), 0);
    const doneCh = novels.reduce((s, n) => s + (n.chapters ? n.chapters.filter(c => c.text).length : 0), 0);

    let streak = 0;
    for (let dk = todayDk; dk >= 0; dk--) { if (dailyAddMap[dk]) streak++; else break; }
    if (!dailyAddMap[todayDk] && streak === 0) { for (let dk = todayDk - 1; dk >= 0; dk--) { if (dailyAddMap[dk]) streak++; else break; } }

    const fmtNum = (n) => n >= 10000 ? (n / 10000).toFixed(1) + '万' : n.toLocaleString();
    const fmtDate = (d) => { const m = d.getMonth() + 1; return m + '/' + d.getDate(); };
    const todayAdd = dailyAddMap[todayDk] || 0;
    const recent = days.slice(-14);
    const maxDelta = recent.length ? Math.max(...recent.map(d => d.add), 1) : 1;

    // 构建自包含 HTML
    const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const dateStr = new Date().toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric' });

    const barsHtml = recent.map(d => {
      const pct = Math.round(d.add / maxDelta * 100);
      const isToday = d.dk === todayDk;
      const cls = isToday ? '#d4a643' : (d.add < dailyGoal ? '#c96' : '#78be78');
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:140px">
        <span style="font-size:11px;color:#999;margin-bottom:3px">${d.add ? fmtNum(d.add) : ''}</span>
        <div style="width:100%;max-width:40px;flex:1;display:flex;align-items:flex-end;background:#2a2a35;border-radius:4px 4px 0 0;overflow:hidden">
          <div style="width:100%;height:${Math.max(pct, d.add ? 4 : 0)}%;background:${cls};border-radius:3px 3px 0 0;${isToday ? 'box-shadow:0 0 8px rgba(212,166,67,.5)' : ''}"></div>
        </div>
        <span style="font-size:10px;color:#888;margin-top:5px">${fmtDate(new Date(d.dk * dayMs))}</span>
      </div>`;
    }).join('');

    const novelRows = novels.map(n => {
      const wc = n.wordCount || 0;
      return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <span style="min-width:130px;color:#bbb">${escapeHtml((n.genreIcon||'📖') + ' ' + n.title)}</span>
        <div style="flex:1;height:8px;background:#2a2a35;border-radius:4px;overflow:hidden"><div style="width:${Math.max(1, Math.round(wc / Math.max(...novels.map(x => x.wordCount || 0), 1) * 100))}%;height:100%;background:linear-gradient(90deg,#d4a643,#d4a643);border-radius:4px"></div></div>
        <span style="font-size:12px;color:#999;min-width:70px;text-align:right">${fmtNum(wc)} 字</span>
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>墨泉写作统计报告 · ${dateStr}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif;background:#12121a;color:#ccc;padding:40px;max-width:720px;margin:0 auto}
h1{font-family:'Noto Serif SC','SimSun',serif;text-align:center;font-size:28px;color:#d4a643;letter-spacing:3px;margin-bottom:4px}
.date{text-align:center;color:#777;font-size:13px;margin-bottom:30px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.card{text-align:center;padding:18px 10px;background:#1a1a24;border-radius:10px;border:1px solid #2a2a38}
.card .val{font-size:24px;font-weight:700;color:#d4a643;letter-spacing:1px}
.card .lbl{font-size:12px;color:#888;margin-top:4px}
.card .sub{font-size:11px;color:#666}
.goal{text-align:center;padding:12px;border-radius:8px;margin-bottom:20px;font-size:14px}
.goal-ok{background:rgba(120,190,120,.1);border:1px solid rgba(120,190,120,.25);color:#78be78}
.goal-warn{background:rgba(232,139,111,.1);border:1px solid rgba(232,139,111,.25);color:#e88b6f}
.section{margin-bottom:24px}
.section h3{font-size:16px;color:#999;margin-bottom:14px;letter-spacing:1px}
.chart{background:#1a1a24;border-radius:10px;padding:20px;border:1px solid #2a2a38}
.bars{display:flex;gap:6px;height:160px;padding-top:4px}
.ft{text-align:center;color:#555;font-size:12px;margin-top:30px;padding-top:20px;border-top:1px solid #2a2a38}
a{color:#777;text-decoration:none}
</style></head>
<body>
<h1>📊 墨泉 · 写作统计</h1>
<p class="date">${dateStr} · 共 ${novels.length} 部作品</p>
<div class="cards">
  <div class="card"><div class="val">${fmtNum(totalWc)}</div><div class="lbl">📝 总字数</div></div>
  <div class="card"><div class="val">${totalCh}</div><div class="lbl">📖 总章节</div><div class="sub">${doneCh} 章已完成</div></div>
  <div class="card"><div class="val">${novels.length}</div><div class="lbl">📚 作品数</div></div>
  <div class="card"><div class="val">${streak} 天</div><div class="lbl">🔥 连续写作</div></div>
</div>
<div class="goal ${todayAdd >= dailyGoal ? 'goal-ok' : 'goal-warn'}">
  ${todayAdd >= dailyGoal ? '✅ 今日已达标 ' + fmtNum(todayAdd) + ' / ' + dailyGoal + ' 字' : '⚠️ 今日进度 ' + fmtNum(todayAdd) + ' / ' + dailyGoal + ' 字' + (todayAdd ? '，还差 ' + fmtNum(dailyGoal - todayAdd) + ' 字' : '')}
</div>
<div class="section"><h3>📊 每日写作量（近 14 天）</h3><div class="chart"><div class="bars">${barsHtml}</div></div></div>
<div class="section"><h3>📚 作品字数分布</h3><div class="chart">${novelRows || '<p style="color:#888;text-align:center">暂无作品</p>'}</div></div>
<p class="ft">由 墨泉 AI 小说生成器 自动生成 · 数据基于本地写作记录</p>
</body></html>`;

    // 触发下载
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '墨泉写作统计报告_' + dateStr.replace(/\//g, '-') + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('统计报告已下载 📤');
  }

  function openNovel(id) {
    const n = MQ.Store.getNovel(id);
    if (!n) { toast('未找到该小说', 'err'); return; }
    state.currentNovel = n;
    // 断点续读：定位到上次读到的章节（越界钳位）
    const last = n.lastChapter || 0;
    state.currentChapter = Math.max(0, Math.min(last, (n.chapters ? n.chapters.length : 1) - 1));
    showView('studio');
    // 有上次位置时直接进写作台对应章节，回到上次停下的地方
    if (last > 0) {
      showTab('writer');
      const c = n.chapters[state.currentChapter];
      toast(`已定位到上次阅读的第${MQ.cnNum(state.currentChapter + 1)}章「${c ? c.title : ''}」📖`);
    }
  }

  /* ============================================================
     创建向导
     ============================================================ */
  const draft = { genre: 'xuanhuan', title: '', protagonist: '', conflict: '', world: '', style: 'fierce', chapters: 16, template: 'three-act' };

  // 章节数钳位到合理区间
  function clampChapters(v) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return 16;
    return Math.max(5, Math.min(9999, n));
  }

  function renderGenreChips() {
    const wrap = $('genre-chips');
    wrap.innerHTML = '';
    MQ.Content.GENRES.forEach(g => {
      wrap.appendChild(MQ.el('button', {
        class: 'chip' + (draft.genre === g.id ? ' active' : ''),
        text: `${g.icon} ${g.name}`,
        onclick: () => { draft.genre = g.id; renderGenreChips(); updatePreview(); },
      }));
    });
  }

  function renderTemplateChips() {
    const wrap = $('template-chips');
    wrap.innerHTML = '';
    MQ.Engine.TEMPLATES.forEach(t => {
      wrap.appendChild(MQ.el('button', {
        class: 'chip' + (draft.template === t.id ? ' active' : ''),
        text: `${t.icon} ${t.name}`,
        title: t.desc,
        onclick: () => { draft.template = t.id; renderTemplateChips(); updatePreview(); },
      }));
    });
  }

  // 文风下拉：内置 + 自定义，随自定义文风增删刷新
  function renderStyleOptions() {
    const sel = $('f-style');
    sel.innerHTML = '';
    MQ.Prose.listStyles().forEach(s => {
      sel.appendChild(MQ.el('option', { value: s.id, text: s.name + (s.custom ? '（自定义）' : '') }));
    });
    // 回显当前选择（若该自定义文风已被删除则落到第一项）
    if (MQ.Prose.getStyle(draft.style).id === draft.style) sel.value = draft.style;
  }

  /* ---- 自定义文风管理弹窗 ---- */
  function openCustomStyleModal() {
    const editing = { id: null };
    const formTitle = MQ.el('h4', { class: 'csm-title', text: '＋ 新建自定义文风' });
    const nameEl = MQ.el('input', { id: 'csm-name', type: 'text', placeholder: '例：暗黑悬疑流', maxlength: '12' });
    const wordsEl = MQ.el('textarea', { id: 'csm-words', rows: '4', placeholder: '特色词汇，每行一个（例：诡谲）\n支持替换对：旧词→新词（例：非常→贼）' });
    const phrasesEl = MQ.el('textarea', { id: 'csm-phrases', rows: '4', placeholder: '特色句式，每行一个，可用 {hero} {place} {ally} 占位\n例：{hero}负手而立，风掀起衣袍的一角。' });
    const descEl = MQ.el('input', { id: 'csm-desc', type: 'text', placeholder: '一句话描述（可选，AI 深度创作时使用）', maxlength: '60' });
    const listWrap = MQ.el('div', { class: 'csm-list' });

    const wordsToText = (s) => (s.words || []).slice().concat((s.replaces || []).map(([f, t]) => f + '→' + t)).join('\n');
    const fillForm = (s) => {
      editing.id = s ? s.id : null;
      nameEl.value = s ? (s.name || '') : '';
      wordsEl.value = s ? wordsToText(s) : '';
      phrasesEl.value = s ? (s.phrases || []).join('\n') : '';
      descEl.value = s ? (s.desc && s.desc.indexOf('自定义文风') !== 0 ? s.desc : '') : '';
      formTitle.textContent = s ? '✎ 编辑「' + s.name + '」' : '＋ 新建自定义文风';
    };

    const renderList = () => {
      listWrap.innerHTML = '';
      const list = MQ.Store.getCustomStyles();
      if (!list.length) {
        listWrap.appendChild(MQ.el('div', { class: 'csm-empty', text: '还没有自定义文风，先在上方创建一套吧' }));
        return;
      }
      list.forEach(s => {
        listWrap.appendChild(MQ.el('div', { class: 'csm-item' }, [
          MQ.el('b', { text: s.name }),
          MQ.el('span', { class: 'csm-meta', text: `词汇 ${(s.words || []).length} · 替换 ${(s.replaces || []).length} · 句式 ${(s.phrases || []).length}` }),
          MQ.el('button', { class: 'btn btn-ghost btn-sm', text: '✎ 编辑', onclick: () => fillForm(s) }),
          MQ.el('button', {
            class: 'btn btn-ghost btn-sm', text: '🗑 删除',
            onclick: () => {
              MQ.Prose.deleteCustomStyle(s.id);
              renderList();
              renderStyleOptions();
              toast('已删除文风「' + s.name + '」');
            },
          }),
        ]));
      });
    };

    const body = MQ.el('div', {}, [
      formTitle,
      MQ.el('div', { class: 'field' }, [MQ.el('label', { text: '风格名称' }), nameEl]),
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '特色词汇' }),
        wordsEl,
      ]),
      MQ.el('div', { class: 'field' }, [MQ.el('label', { text: '特色句式' }), phrasesEl]),
      MQ.el('div', { class: 'field' }, [MQ.el('label', { text: '描述（可选）' }), descEl]),
      MQ.el('div', { class: 'csm-divider' }),
      listWrap,
    ]);

    openModal('🎨 自定义文风', body, [
      { text: '＋ 新建', cls: 'btn-ghost', onclick: () => fillForm(null) },
      { text: '取消', cls: 'btn-ghost', onclick: (m) => closeModal(m) },
      {
        text: '💾 保存', cls: 'btn-primary', onclick: (m) => {
          const name = nameEl.value.trim();
          if (!name) { toast('请先填写风格名称', 'err'); return; }
          const words = [], replaces = [];
          wordsEl.value.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
            const mt = l.match(/^(.*?)(?:→|->)(.*)$/);
            if (mt && mt[1].trim() && mt[2].trim()) replaces.push([mt[1].trim(), mt[2].trim()]);
            else words.push(l);
          });
          const phrases = phrasesEl.value.split('\n').map(l => l.trim()).filter(Boolean);
          if (!words.length && !replaces.length && !phrases.length) { toast('至少填入一个词汇、替换对或句式', 'err'); return; }
          const desc = descEl.value.trim() || '自定义文风：' + name;
          MQ.Prose.saveCustomStyle({
            id: editing.id || 'custom_' + MQ.uid(''),
            name, words, replaces, phrases,
            openers: [], closers: [], shortRate: 0.5,
            desc, custom: true,
          });
          renderList();
          renderStyleOptions();
          fillForm(null);
          toast('已保存文风「' + name + '」🎨', 'ok');
        },
      },
    ]);
    fillForm(null);
    renderList();
  }

  function bindCreateForm() {
    renderStyleOptions();
    $('f-title').addEventListener('input', e => { draft.title = e.target.value; updatePreview(); });
    $('f-protagonist').addEventListener('input', e => { draft.protagonist = e.target.value; updatePreview(); });
    $('f-conflict').addEventListener('input', e => { draft.conflict = e.target.value; updatePreview(); });
    $('f-world').addEventListener('input', e => { draft.world = e.target.value; updatePreview(); });
    $('f-style').addEventListener('change', e => { draft.style = e.target.value; updatePreview(); });
    // 输入期间只更新内存与预览（不改写输入框，避免打断多位数输入）；失焦/回车时归一化
    $('f-chapters').addEventListener('input', e => {
      draft.chapters = clampChapters(e.target.value);
      updatePreview();
    });
    $('f-chapters').addEventListener('change', e => {
      const v = clampChapters(e.target.value);
      draft.chapters = v;
      e.target.value = v;
      updatePreview();
    });

    $('btn-random').addEventListener('click', () => {
      const r = MQ.Engine.randomSetupPrefill();
      Object.assign(draft, r);
      $('f-title').value = r.title;
      $('f-protagonist').value = r.protagonist;
      $('f-conflict').value = r.conflict;
      $('f-world').value = r.world;
      $('f-style').value = r.style;
      $('f-chapters').value = r.chapters;
      renderGenreChips();
      renderTemplateChips();
      updatePreview();
      toast('灵感已降临 ✨');
    });

    $('btn-create').addEventListener('click', () => {
      const novel = MQ.Engine.generateSetup({
        genre: draft.genre,
        title: draft.title,
        protagonist: draft.protagonist,
        conflict: draft.conflict,
        world: draft.world,
        style: draft.style,
        chapters: draft.chapters,
        template: draft.template,
      });
      MQ.Engine.generateCharacters(novel);
      MQ.Engine.generateOutline(novel);
      MQ.Store.upsertNovel(novel);
      state.currentNovel = novel;
      state.currentChapter = 0;
      showView('studio');
      toast(`《${novel.title}》已创建，大纲就绪 🎉`, 'ok');
    });
  }

  function updatePreview() {
    const body = $('preview-body');
    const genre = MQ.Content.getGenre(draft.genre);
    const rng = MQ.makeRng(Math.floor(Math.random() * 1e9));
    // 留空字段用同一把随机补全，保证书名与主角名出自同一题材
    const needFill = !draft.title.trim() || !draft.protagonist.trim();
    const fill = needFill ? MQ.Engine.randomSetupPrefill() : null;
    const title = draft.title.trim() || (fill ? fill.title : '');
    const name = draft.protagonist.trim() || (fill ? fill.protagonist : '');
    const conflict = draft.conflict.trim() || rng.pick(genre.conflicts);
    const world = draft.world.trim() || rng.pick(genre.worlds);
    const style = MQ.Prose.getStyle(draft.style);
    const lengthText = `共 ${draft.chapters} 章`;

    body.innerHTML = '';
    body.appendChild(MQ.el('div', { class: 'pv-title', text: `《${title}》` }));
    body.appendChild(MQ.el('div', { class: 'pv-tag-row' }, [
      MQ.el('span', { class: 'pv-tag', text: `${genre.icon} ${genre.name}` }),
      MQ.el('span', { class: 'pv-tag', text: style.name }),
      MQ.el('span', { class: 'pv-tag', text: lengthText }),
    ]));
    body.appendChild(MQ.el('div', { class: 'pv-section' }, [
      MQ.el('h4', { text: '主角' }),
      MQ.el('p', { text: `${name} — ${rng.pick(genre.identities)}` }),
    ]));
    body.appendChild(MQ.el('div', { class: 'pv-section' }, [
      MQ.el('h4', { text: '世界观' }),
      MQ.el('p', { text: world }),
    ]));
    body.appendChild(MQ.el('div', { class: 'pv-section' }, [
      MQ.el('h4', { text: '核心冲突' }),
      MQ.el('p', { text: conflict }),
    ]));
  }

  /* ============================================================
     工作台
     ============================================================ */
  function renderStudio() {
    const n = state.currentNovel;
    if (!n) return;
    renderSidebar(n);
    renderInspire(n);
    showTab('outline');
    renderOutlineTab(n);
    renderCharactersTab(n);
    renderWriterTab(n);
  }

  /* ---- 侧栏 ---- */
  function renderSidebar(n) {
    const side = $('side-novel');
    side.innerHTML = '';
    side.appendChild(MQ.el('div', { class: 'sn-title', text: n.title }));
    side.appendChild(MQ.el('div', { class: 'sn-meta', text: `${n.genreIcon} ${n.genreName} · ${MQ.Prose.getStyle(n.styleId).name} · ${n.hero.name}` }));

    const list = $('chapter-list');
    list.innerHTML = '';
    n.chapters.forEach((c, i) => {
      const item = MQ.el('div', {
        class: 'ch-item' + (i === state.currentChapter ? ' active' : '') + (c.text ? ' done' : ''),
        onclick: () => selectChapter(i),
      }, [
        MQ.el('span', { class: 'ch-num', text: MQ.cnNum(i + 1) }),
        MQ.el('span', { class: 'ch-title', text: c.title }),
        c.text ? MQ.el('span', { class: 'ch-state', text: '✓' }) : null,
      ]);
      list.appendChild(item);
    });
  }

  function selectChapter(i) {
    state.currentChapter = i;
    state.compareMode = 'orig';
    // 记录断点：用户切换到的章节即「上次读到的位置」
    if (state.currentNovel) {
      state.currentNovel.lastChapter = i;
      MQ.Store.upsertNovel(state.currentNovel);
    }
    renderSidebar(state.currentNovel);
    renderWriterTab(state.currentNovel);
    showTab('writer');
  }

  /* ---- Tabs ---- */
  function showTab(name) {
    document.querySelectorAll('.stab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.studio-tabpane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    if (name === 'outline') renderOutlineTab(state.currentNovel);
    if (name === 'characters') renderCharactersTab(state.currentNovel);
    if (name === 'places') renderPlacesTab(state.currentNovel);
    if (name === 'writer') renderWriterTab(state.currentNovel);
    // 专注模式：仅在写作台标签生效；切走时收起（不覆盖持久化偏好，回到写作台自动重现）
    if (name === 'writer') setFocusMode(!!(MQ.Store.getSettings().focusMode), false);
    else setFocusMode(false, false);
  }

  /* ---- 大纲页 ---- */
  function renderOutlineTab(n) {
    const tab = $('tab-outline');
    tab.innerHTML = '';

    const fsList = getForeshadowList(n);
    const fsPending = fsList.filter(f => fsStatus(n, f) !== 'done').length;
    const toolbar = MQ.el('div', { class: 'outline-toolbar' }, [
      enginePills(state.outlineEngine, (v) => { state.outlineEngine = v; saveModulePrefs(); renderOutlineTab(n); }),
      MQ.el('span', { class: 'hint muted', text: `共 ${n.chapters.length} 章 · 三幕结构` }),
      MQ.el('button', {
        class: 'btn btn-ghost btn-sm' + (state.fsOpen ? ' active' : ''),
        id: 'btn-fs-toggle',
        text: `🔮 伏笔追踪${fsList.length ? ` (${fsPending} 待回收)` : ''}`,
        title: '查看所有伏笔的埋设与回收状态',
        onclick: () => { state.fsOpen = !state.fsOpen; renderOutlineTab(n); },
      }),
      MQ.el('button', {
        class: 'btn btn-ghost btn-sm', id: 'btn-consistency', text: '🧪 AI 一致性',
        title: 'AI 通读全书，检查时间线 / 人物行为 / 设定冲突 / 情节遗漏',
        onclick: () => consistencyCheck(n),
      }),
      MQ.el('button', { class: 'btn btn-ghost btn-sm', id: 'btn-regen-outline', text: '⟳ 重新生成大纲', onclick: () => regenerateOutline(n) }),
      MQ.el('button', {
        class: 'btn btn-ghost btn-sm' + (state.tlOpen ? ' active' : ''),
        id: 'btn-tl-toggle',
        text: `📅 时间线`,
        title: '按章节展示事件时间轴，一眼看清故事脉络',
        onclick: () => { state.tlOpen = !state.tlOpen; renderOutlineTab(n); },
      }),
      MQ.el('button', {
        class: 'btn btn-primary btn-sm', text: '✍️ 一键生成全部正文',
        onclick: () => generateAllChapters(n),
      }),
    ]);
    tab.appendChild(toolbar);
    if (state.fsOpen) tab.appendChild(renderForeshadowPanel(n));
    if (state.tlOpen) tab.appendChild(renderTimelinePanel(n));

    const cards = MQ.el('div', { class: 'chapter-cards' });
    const fsPlants = new Set(fsList.map(f => f.plantIdx));

    let dragIdx = -1;
    n.chapters.forEach((c, i) => {
      const actName = c.act === 1 ? '第一幕 · 起' : c.act === 2 ? '第二幕 · 承转' : '第三幕 · 合';
      const beatNames = { intro: '引子', daily: '日常', incite: '触发', depart: '启程', explore: '探索', meet: '相遇', trial: '试炼', approach: '逼近', low: '低谷', rally: '转机', climax: '决战', cost: '代价', resolve: '收束', after: '尾声' };
      const card = MQ.el('div', {
        class: 'chapter-card card',
        draggable: 'true',
        'data-ci': String(i),
      }, [
        MQ.el('div', { class: 'cc-drag', text: '⋮⋮', title: '拖拽排序' }),
        MQ.el('div', { class: 'cc-num', text: String(i + 1) }),
        MQ.el('div', { class: 'cc-body' }, [
          MQ.el('div', { class: 'cc-title', text: `${MQ.cnNum(i + 1)} · ${c.title}` }),
          MQ.el('div', { class: 'cc-tags' }, [
            MQ.el('span', { class: `cc-tag act${c.act}`, text: actName }),
            MQ.el('span', { class: 'cc-tag', text: beatNames[c.beat] || c.beat }),
            MQ.el('span', { class: 'cc-tag', text: `📍${c.place}` }),
            fsPlants.has(i) ? MQ.el('span', { class: 'cc-tag cc-plant', text: '🌱 伏笔埋设' }) : null,
            c.foreshadow ? MQ.el('span', { class: 'cc-tag cc-payoff', text: '🔗 伏笔回收' }) : null,
            c.published ? MQ.el('span', { class: 'cc-tag cc-pub', text: `📤 ${c.published}` }) : null,
            c.text ? MQ.el('span', { class: 'cc-tag', text: `已写 ${c.wordCount} 字` }) : MQ.el('span', { class: 'cc-tag cc-target', text: `目标 ${c.targetWc || 800} 字` }),
          ]),
          MQ.el('div', { class: 'cc-summary', text: c.summary }),
        ]),
        MQ.el('div', { class: 'cc-ops' }, [
          MQ.el('button', { class: 'icon-btn', title: '编辑', text: '✎', onclick: () => editChapterModal(n, i) }),
          MQ.el('button', { class: 'icon-btn', title: '生成正文', text: '✍️', onclick: () => { selectChapter(i); } }),
        ]),
      ]);

      // 拖拽事件
      card.addEventListener('dragstart', (e) => {
        dragIdx = i;
        card.classList.add('cc-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('cc-dragging');
        document.querySelectorAll('.cc-over').forEach(el => el.classList.remove('cc-over'));
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragIdx !== i) card.classList.add('cc-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('cc-over'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('cc-over');
        const from = dragIdx;
        if (from < 0 || from === i) return;
        // 重排章节
        const [moved] = n.chapters.splice(from, 1);
        const target = from < i ? i - 1 : i; // splice 后目标位置调整
        n.chapters.splice(target, 0, moved);
        MQ.Engine.remapForeshadows(n, from, target); // 伏笔的埋设/回收索引同步位移
        // 清除已生成的章节历史（结构变了，旧快照不再有效）
        if (n.history && n.history[from]) { delete n.history[from]; n.history[target] = n.history[target] || []; }
        // 更新 lastChapter 指向（如果被影响）
        if (n.lastChapter === from) n.lastChapter = target;
        else if (from < n.lastChapter && target >= n.lastChapter) n.lastChapter = Math.max(0, n.lastChapter - 1);
        else if (from > n.lastChapter && target <= n.lastChapter) n.lastChapter = Math.min(n.chapters.length - 1, n.lastChapter + 1);
        MQ.Store.upsertNovel(n);
        renderOutlineTab(n);
        toast(`已移动「${moved.title}」到第 ${target + 1} 章`);
      });

      cards.appendChild(card);
    });
    tab.appendChild(cards);
  }

  /* ============================================================
     伏笔追踪面板
     ============================================================ */
  // 获取伏笔列表：优先 novel.foreshadows，旧数据回退为从章节 foreshadow 标记推导
  function getForeshadowList(n) {
    let list = (n.foreshadows || []).filter(f => f && typeof f.plantIdx === 'number');
    if (!list.length) {
      list = n.chapters
        .map((c, i) => (c.foreshadow && i > 0) ? { id: 'fs-' + i, plantIdx: i - 1, payoffIdx: i, desc: null } : null)
        .filter(Boolean);
    }
    return list;
  }

  // 伏笔状态：done 已回收（回收章已写正文）｜pending 待回收（回收章未写）｜orphan 悬空（章节被删/顺序被打乱）
  function fsStatus(n, f) {
    if (!n.chapters || f.plantIdx >= f.payoffIdx || f.payoffIdx >= n.chapters.length) return 'orphan';
    const payoff = n.chapters[f.payoffIdx];
    if (payoff && payoff.text && MQ.countChars(payoff.text) > 20) return 'done';
    return 'pending';
  }

  function fsRow(n, f, st) {
    const labels = { done: '✅ 已回收', pending: '⏳ 待回收', orphan: '⚠️ 悬空' };
    const plant = n.chapters[f.plantIdx];
    const payoff = n.chapters[f.payoffIdx];
    const chap = (idx, c) => MQ.el('span', {
      class: 'fs-chap',
      text: `第${MQ.cnNum(idx + 1)}章 ${c ? c.title : '（章节已删除）'}`,
      title: '点击跳转到该章',
      onclick: c ? () => selectChapter(idx) : null,
    });
    return MQ.el('div', { class: 'fs-row' }, [
      MQ.el('span', { class: `fs-badge ${st}`, text: labels[st] }),
      MQ.el('div', { class: 'fs-path' }, [
        chap(f.plantIdx, plant),
        MQ.el('span', { class: 'fs-arrow', text: '→' }),
        chap(f.payoffIdx, payoff),
      ]),
      MQ.el('span', { class: 'fs-desc', text: f.desc || '（无描述）' }),
      MQ.el('button', {
        class: 'icon-btn fs-del', title: '删除这条伏笔', text: '✕',
        onclick: () => {
          if (!confirm('删除这条伏笔追踪？')) return;
          n.foreshadows = (n.foreshadows || []).filter(x => x.id !== f.id);
          MQ.Store.upsertNovel(n);
          renderOutlineTab(n);
          toast('伏笔已删除');
        },
      }),
    ]);
  }

  function renderForeshadowPanel(n) {
    const list = getForeshadowList(n);
    const statusOf = (f) => fsStatus(n, f);
    const counts = { done: 0, pending: 0, orphan: 0 };
    list.forEach(f => counts[statusOf(f)]++);

    const panel = MQ.el('div', { class: 'fs-panel card' });
    const filterChips = [
      { k: 'all', t: '全部' },
      { k: 'done', t: '已回收' },
      { k: 'pending', t: '待回收' },
    ].map(o => MQ.el('button', {
      class: 'fs-chip' + (state.fsFilter === o.k ? ' active' : ''),
      text: o.t,
      onclick: () => { state.fsFilter = o.k; renderOutlineTab(n); },
    }));

    panel.appendChild(MQ.el('div', { class: 'fs-head' }, [
      MQ.el('span', { class: 'fs-title', text: '🔮 伏笔追踪' }),
      MQ.el('span', { class: 'fs-count', text: `${list.length} 条 · ${counts.pending + counts.orphan} 条待回收` }),
      MQ.el('div', { class: 'fs-filter' }, filterChips),
      MQ.el('button', { class: 'btn btn-ghost btn-sm', text: '＋ 手动埋设', onclick: () => fsAddModal(n) }),
    ]));

    if (!list.length) {
      panel.appendChild(MQ.el('div', { class: 'fs-empty', text: '暂无伏笔。重新生成大纲时引擎会自动埋设 2 条伏笔，也可以点「＋ 手动埋设」自己埋一条。' }));
      return panel;
    }

    const filtered = list.filter(f =>
      state.fsFilter === 'all'
      || statusOf(f) === state.fsFilter
      || (state.fsFilter === 'pending' && statusOf(f) === 'orphan')
    );
    const rows = MQ.el('div', { class: 'fs-list' });
    if (!filtered.length) {
      rows.appendChild(MQ.el('div', { class: 'fs-empty', text: '该分类下暂无伏笔' }));
    } else {
      filtered.forEach(f => rows.appendChild(fsRow(n, f, statusOf(f))));
    }
    panel.appendChild(rows);
    return panel;
  }

  /* ---- 时间线面板 ---- */
  function renderTimelinePanel(n) {
    const panel = MQ.el('div', { class: 'timeline-wrap card' });
    const actColors = { 1: '#d4a643', 2: '#c95a3c', 3: '#58c08a' };
    const actNames = { 1: '第一幕 · 起', 2: '第二幕 · 承转', 3: '第三幕 · 合' };

    panel.appendChild(MQ.el('div', { class: 'tl-head' }, [
      MQ.el('span', { class: 'tl-title', text: '📅 故事时间线' }),
      MQ.el('span', { class: 'tl-count muted', text: `${n.chapters.length} 章 · ${n.chapters.filter(c => c.text).length} 章已写` }),
    ]));

    const tl = MQ.el('div', { class: 'tl-list' });
    let lastAct = 0;
    n.chapters.forEach((c, i) => {
      // 幕分隔线
      if (c.act && c.act !== lastAct) {
        lastAct = c.act;
        tl.appendChild(MQ.el('div', { class: 'tl-divider' }, [
          MQ.el('span', { class: 'tl-div-line', style: `background:${actColors[c.act] || '#666'}` }),
          MQ.el('span', { class: 'tl-div-text', text: actNames[c.act] || `第${c.act}幕` }),
          MQ.el('span', { class: 'tl-div-line', style: `background:${actColors[c.act] || '#666'}` }),
        ]));
      }
      // 时间线条目
      const hasText = c.text && MQ.countChars(c.text) > 20;
      const item = MQ.el('div', {
        class: 'tl-item' + (hasText ? ' written' : ''),
        title: `点击查看第${MQ.cnNum(i + 1)}章`,
        onclick: () => selectChapter(i),
      }, [
        MQ.el('div', { class: 'tl-dot', style: `background:${actColors[c.act] || '#666'}` }),
        MQ.el('div', { class: 'tl-line', style: `background:${actColors[c.act] || '#666'}` }),
        MQ.el('div', { class: 'tl-content' }, [
          MQ.el('div', { class: 'tl-chap', text: `第${MQ.cnNum(i + 1)}章 ${c.title}` }),
          MQ.el('div', { class: 'tl-event', text: c.event || c.summary || '（未设置事件）' }),
          MQ.el('div', { class: 'tl-meta' }, [
            MQ.el('span', { class: 'tl-place', text: `📍${c.place || '未定'}` }),
            hasText ? MQ.el('span', { class: 'tl-wc', text: `${c.wordCount || 0}字` }) : null,
          ]),
        ]),
      ]);
      tl.appendChild(item);
    });
    panel.appendChild(tl);
    return panel;
  }

  function fsAddModal(n) {
    const total = n.chapters.length;
    const defPlant = Math.max(1, Math.floor(total / 3));
    const defPayoff = Math.min(total, defPlant + 3);
    const opt = (from, to, sel) => Array.from({ length: to - from + 1 }, (_, i) => {
      const ci = from + i;
      return MQ.el('option', { value: String(ci), text: `第${MQ.cnNum(ci)}章 ${(n.chapters[ci - 1] || {}).title || ''}`, selected: ci === sel });
    });
    const seedDesc = MQ.Engine.FS_SEEDS[Math.floor(Math.random() * MQ.Engine.FS_SEEDS.length)];
    const body = [
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '埋设章节' }),
        MQ.el('select', { id: 'fs-plant' }, opt(1, total, defPlant)),
      ]),
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '回收章节' }),
        MQ.el('select', { id: 'fs-payoff' }, opt(1, total, defPayoff)),
      ]),
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '伏笔描述' }),
        MQ.el('input', { id: 'fs-desc', placeholder: '如：主角左臂的旧伤疤，来历成谜', value: seedDesc }),
      ]),
    ];
    openModal('🔮 手动埋设伏笔', body, [
      { text: '取消', cls: 'btn-ghost', onclick: () => closeModal() },
      {
        text: '埋设', cls: 'btn-primary', onclick: () => {
          const plant = parseInt($('fs-plant').value, 10) - 1;
          const payoff = parseInt($('fs-payoff').value, 10) - 1;
          const desc = ($('fs-desc').value || '').trim();
          if (plant >= payoff) { toast('回收章节需在埋设章节之后', 'err'); return; }
          if (!n.foreshadows) n.foreshadows = [];
          n.foreshadows.push({ id: 'fs-m-' + Date.now().toString(36), plantIdx: plant, payoffIdx: payoff, desc: desc || '（未填写描述）' });
          MQ.Store.upsertNovel(n);
          closeModal();
          state.fsOpen = true;
          renderOutlineTab(n);
          toast('伏笔已埋设 🔮');
        },
      },
    ]);
  }

  /* ============================================================
     AI 设定一致性检查（整书）
     ============================================================ */
  /* ============================================================
     本地错别字 / 重复词检查（写作台）
     ============================================================ */
  // 把编辑器归一化为单个文本节点（white-space: pre-wrap 保留换行），使偏移映射可靠
  function normalizePaperText(pt, text) {
    pt.textContent = text || '';
  }

  // 清除正文中的错别字高亮 mark（不影响 innerText 保存）
  function clearTypoMarks(pt) {
    pt.querySelectorAll('mark.typo-mark').forEach(m => {
      m.replaceWith(document.createTextNode(m.textContent));
    });
  }

  // 高亮 [start, end) 区间并滚动到可见
  function highlightTypo(pt, start, end) {
    clearTypoMarks(pt);
    // 编辑器应为单个文本节点（归一化后），直接按偏移切分
    const walker = document.createTreeWalker(pt, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let offset = 0;
    while (node) {
      const len = node.data.length;
      if (start >= offset && start <= offset + len) {
        const rel = start - offset;
        const range = document.createRange();
        range.setStart(node, rel);
        range.setEnd(node, Math.min(rel + (end - start), len));
        const mark = document.createElement('mark');
        mark.className = 'typo-mark';
        range.surroundContents(mark);
        mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return true;
      }
      offset += len;
      node = walker.nextNode();
    }
    return false;
  }

  // 内联刷新写作台字数统计（updateWriterStat 是 renderWriterTab 的闭包，外部不可达）
  function refreshWriterStat(c, n) {
    const statEl = document.querySelector('#tab-writer .stat');
    if (statEl) statEl.innerHTML = `本章 <b>${MQ.countChars(c.text)}</b> 字 · 全书 <b>${MQ.countChars(n.chapters.map(ch => ch.text).join(''))}</b> 字`;
  }

  function openTypoCheck(n) {
    const pt = document.querySelector('#tab-writer .paper-text');
    const c = n.chapters[state.currentChapter];
    if (!pt || !c) return;
    // 提交编辑器最新内容（重写对比锁定态不提交，检查当前已保存正文）
    if (state.compareMode !== 'rew') {
      c.text = pt.innerText.trim();
      c.wordCount = MQ.countChars(c.text);
      MQ.Store.upsertNovel(n);
    }
    const issues = MQ.Typo.check(c.text);
    if (!issues.length) {
      toast('未发现明显的地得误用或重复词 🎉', 'ok');
      return;
    }
    // 归一化编辑器，保证偏移与 c.text 一致
    normalizePaperText(pt, c.text);
    refreshWriterStat(c, n);

    const dedeCount = issues.filter(x => x.type === 'dede').length;
    const repCount = issues.filter(x => x.type === 'repeat').length;

    const head = MQ.el('div', { class: 'typo-head' }, [
      MQ.el('span', { class: 'typo-big', text: `发现 ${issues.length} 处疑似问题` }),
      MQ.el('span', { class: 'typo-count muted', text: `「的地得」${dedeCount} 处 · 重复词 ${repCount} 处 · 均为启发式判断，请人工确认` }),
    ]);

    const list = MQ.el('div', { class: 'typo-list' });
    issues.forEach((x, i) => {
      const ctxStart = Math.max(0, x.start - 6);
      const ctxEnd = Math.min(c.text.length, x.start + x.len + 6);
      const ctx = MQ.el('span', { class: 'typo-ctx' },
        (ctxStart > 0 ? '…' : '') + c.text.slice(ctxStart, x.start) +
        '『' + c.text.slice(x.start, x.start + x.len) + '』' +
        c.text.slice(x.start + x.len, ctxEnd) + (ctxEnd < c.text.length ? '…' : '')
      );
      const row = MQ.el('div', { class: 'typo-row' }, [
        MQ.el('span', { class: 'typo-badge ' + (x.type === 'dede' ? 'dede' : 'repeat'), text: x.kind }),
        ctx,
        MQ.el('span', { class: 'typo-hint', text: x.hint }),
        MQ.el('div', { class: 'typo-ops' }, [
          MQ.el('button', { class: 'btn btn-ghost btn-sm', text: '👁 定位', onclick: () => {
            closeModal();
            highlightTypo(pt, x.start, x.start + x.len);
          } }),
          MQ.el('button', {
            class: 'btn btn-primary btn-sm', text: `✓ 改为「${x.fix}」`,
            onclick: () => {
              c.text = c.text.slice(0, x.start) + x.fix + c.text.slice(x.start + x.len);
              c.wordCount = MQ.countChars(c.text);
              n.wordCount = n.chapters.reduce((s, ch) => s + (ch.wordCount || 0), 0);
              MQ.Store.upsertNovel(n);
              normalizePaperText(pt, c.text);
              refreshWriterStat(c, n);
              toast(`已改为「${x.fix}」`);
              openTypoCheck(n); // 重新检查刷新列表
            },
          }),
        ]),
      ]);
      list.appendChild(row);
    });

    openModal('🔍 错别字 / 重复词检查', MQ.el('div', {}, [head, list]), [
      { text: '关闭', cls: 'btn-primary', onclick: () => closeModal() },
    ], true);
  }

  async function consistencyCheck(n) {
    if (state.generating) return; // 防重入
    if (!MQ.AI.isConfigured()) { toast('请先在右上角「🤖 AI 设置」配置 AI 接口，再运行一致性检查', 'err'); return; }
    if (!n.chapters.some(c => c.text)) { toast('还没有已写正文，先去写作台生成几章再检查', 'err'); return; }
    state.generating = true;
    const ac = new AbortController();
    const prog = progressOverlay(['正在通读全书', '正在核对时间线', '正在比对人物行为', '正在检查设定冲突', '正在生成报告'], () => { ac.abort(); prog.cancelling(); });
    let tries = 1;
    try {
      const report = await MQ.AI.consistencyCheckAI(n, (a) => { tries = a; if (a > 1) prog.retry(a); }, ac.signal);
      prog.finish('检查完成');
      consistencyReportModal(n, report, tries);
    } catch (err) {
      if (MQ.AI.isAbort(err)) {
        prog.fail('已取消');
        toast('已取消一致性检查');
      } else {
        prog.fail('失败：' + err.message);
        toast(`一致性检查失败（已尝试 ${tries} 次）：` + err.message, 'err');
      }
    } finally {
      state.generating = false;
    }
  }

  function consistencyReportModal(n, report, tries) {
    const issues = (report.issues || []).slice();
    const sevOrder = { '高': 0, '中': 1, '低': 2 };
    issues.sort((a, b) => (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3));

    const typeCls = { '时间线': 't-timeline', '人物行为': 't-behavior', '设定冲突': 't-setting', '情节遗漏': 't-plot', '其他': 't-other' };
    const sevCls = { '高': 's-hi', '中': 's-mid', '低': 's-lo' };

    const head = MQ.el('div', { class: 'cc-summary' }, [
      MQ.el('div', { class: 'cc-summary-main' }, [
        MQ.el('span', { class: 'cc-big' + (issues.length ? '' : ' cc-clean'), text: issues.length ? `发现 ${issues.length} 处潜在矛盾` : '未发现明显矛盾 🎉' }),
        report.summary ? MQ.el('span', { class: 'cc-summary-text', text: report.summary }) : null,
      ]),
      MQ.el('span', { class: 'cc-meta muted', text: `扫描 ${n.chapters.length} 章 · 已写 ${n.chapters.filter(c => c.text).length} 章 · 尝试 ${tries} 次` }),
    ]);

    const list = MQ.el('div', { class: 'cc-list' });
    if (!issues.length) {
      list.appendChild(MQ.el('div', { class: 'cc-empty', text: 'AI 通读全书后未发现时间线或人物行为上的前后矛盾。建议写满更多章节后再跑一次——长篇小说越到后期，越容易出现被遗忘的设定或伏笔。' }));
    } else {
      issues.forEach(x => list.appendChild(MQ.el('div', { class: 'cc-issue' }, [
        MQ.el('div', { class: 'cc-issue-top' }, [
          MQ.el('span', { class: `cc-type ${typeCls[x.type] || 't-other'}`, text: x.type }),
          MQ.el('span', { class: `cc-sev ${sevCls[x.severity] || 's-mid'}`, text: x.severity }),
          x.chapter ? MQ.el('span', { class: 'cc-chap', text: x.chapter }) : null,
        ]),
        x.desc ? MQ.el('div', { class: 'cc-desc', text: x.desc }) : null,
        x.fix ? MQ.el('div', { class: 'cc-fix', text: '💡 ' + x.fix }) : null,
      ])));
    }

    openModal('🧪 AI 设定一致性检查', MQ.el('div', {}, [head, list]), [
      { text: '关闭', cls: 'btn-primary', onclick: () => closeModal() },
    ], true);
  }

  async function regenerateOutline(n) {
    if (state.generating) return; // 防重入（批量生成等任务进行中）
    if (n.chapters.some(c => c.text) && !confirm('重新生成会替换大纲标题与摘要（已写正文将保留）。继续？')) return;
    const oldTexts = n.chapters.map(c => c.text);
    let usedAI = false;
    let tries = 1;
    let cancelled = false;
    if (state.outlineEngine === 'ai') {
      if (!MQ.AI.isConfigured()) {
        toast('未配置 AI 接口，已改用本地模板生成', 'err');
      } else {
        usedAI = true;
        state.generating = true;
        const btn = $('btn-regen-outline');
        const ac = new AbortController();
        const prog = progressOverlay(['正在构思章节结构', '正在铺陈三幕节奏', '正在埋设伏笔', '正在润色大纲'], () => { ac.abort(); prog.cancelling(); });
        if (btn) { btn.disabled = true; btn.textContent = 'AI 构思中…'; }
        try {
          n.chapters = await MQ.AI.generateOutlineAI(n, (a) => { tries = a; if (a > 1) prog.retry(a); }, ac.signal);
          prog.finish('大纲完成');
        } catch (err) {
          if (MQ.AI.isAbort(err)) {
            cancelled = true; // 用户主动取消：保留原大纲，不回退本地、不提示成功
            prog.fail('已取消');
            toast('已取消大纲生成');
          } else {
            usedAI = false; // AI 失败，已回退本地
            prog.fail('失败：' + err.message);
            toast(`AI 大纲失败（已尝试 ${tries} 次）：` + err.message + '（已改用本地模板）', 'err');
            MQ.Engine.generateOutline(n);
          }
        } finally {
          state.generating = false;
        }
        if (btn) { btn.disabled = false; btn.textContent = '⟳ 重新生成大纲'; }
      }
    }
    if (cancelled) return; // 取消：原大纲保持不变
    if (!usedAI) MQ.Engine.generateOutline(n);
    MQ.Engine.syncForeshadows(n); // AI 或本地生成后重建伏笔追踪表（保留手动条目）
    n.history = {}; // 章节结构已变，旧快照失去锚点，清空生成历史
    // 保留已写正文（按原章节索引回填）
    n.chapters.forEach((c, i) => { c.text = oldTexts[i] || ''; c.wordCount = c.text ? MQ.countChars(c.text) : 0; });
    n.wordCount = n.chapters.reduce((s, c) => s + c.wordCount, 0);
    MQ.Store.upsertNovel(n);
    renderSidebar(n);
    renderOutlineTab(n);
    renderWriterTab(n);
    toast(usedAI ? (tries > 1 ? `AI 深度大纲已生成（第 ${tries} 次尝试成功）🎉` : 'AI 深度大纲已生成 🎉') : '大纲已重新生成');
  }

  function editChapterModal(n, idx) {
    const c = n.chapters[idx];
    if (!c.targetWc) c.targetWc = 800;
    const body = MQ.el('div', {}, [
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '章节标题' }),
        MQ.el('input', { id: 'ec-title', value: c.title }),
      ]),
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '剧情摘要' }),
        MQ.el('textarea', { id: 'ec-summary', rows: 4, value: c.summary }),
      ]),
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '发生地点' }),
        MQ.el('input', { id: 'ec-place', value: c.place || '' }),
      ]),
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '目标字数（生成时至少达到此字数）' }),
        MQ.el('input', { id: 'ec-targetWc', type: 'number', min: '100', max: '5000', step: '100', value: String(c.targetWc || 800) }),
      ]),
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '发布状态' }),
        MQ.el('select', { id: 'ec-pub' }, [
          MQ.el('option', { value: '', text: '（未发布）', selected: !c.published }),
          MQ.el('option', { value: '起点', text: '📕 起点中文网', selected: c.published === '起点' }),
          MQ.el('option', { value: '番茄', text: '🍅 番茄小说', selected: c.published === '番茄' }),
          MQ.el('option', { value: '晋江', text: '💚 晋江文学城', selected: c.published === '晋江' }),
          MQ.el('option', { value: '纵横', text: '🏯 纵横中文网', selected: c.published === '纵横' }),
          MQ.el('option', { value: '其他', text: '📤 其他平台', selected: c.published === '其他' }),
        ]),
      ]),
    ]);
    openModal('编辑章节', body, [
      { text: '取消', cls: 'btn-ghost', onclick: (m) => closeModal(m) },
      {
        text: '保存', cls: 'btn-primary', onclick: (m) => {
          c.title = $('ec-title').value.trim() || c.title;
          c.summary = $('ec-summary').value.trim() || c.summary;
          c.place = $('ec-place').value.trim() || c.place;
          const tw = parseInt($('ec-targetWc').value, 10);
          c.targetWc = Number.isFinite(tw) ? Math.max(100, Math.min(5000, tw)) : 800;
          c.published = $('ec-pub').value || '';
          n.updatedAt = MQ.now();
          MQ.Store.upsertNovel(n);
          renderSidebar(n);
          renderOutlineTab(n);
          renderWriterTab(n);
          closeModal(m);
          toast('已保存', 'ok');
        },
      },
    ]);
  }

  async function generateAllChapters(n) {
    if (state.generating) return;
    if (!confirm(`将为全部 ${n.chapters.length} 章生成正文（每章约 1000 字）。继续？`)) return;
    state.generating = true;
    toast('正在批量生成…');
    const useAI = MQ.AI.activeEngine() === 'ai';
    let retried = 0;
    try {
      for (let i = 0; i < n.chapters.length; i++) {
        if (useAI) {
          await MQ.AI.generateChapterAI(n, i, null, (a) => { if (a > 1) retried++; });
        } else {
          MQ.Engine.generateChapter(n, i);
        }
        renderSidebar(n);
        renderOutlineTab(n);
        await sleep(20);
      }
      MQ.Store.upsertNovel(n);
      toast(retried > 0 ? `全部 ${n.chapters.length} 章已生成（${retried} 章经自动重试）🎉` : `全部 ${n.chapters.length} 章已生成 🎉`, 'ok');
    } catch (err) {
      toast('批量生成中断：' + err.message, 'err');
    } finally {
      state.generating = false;
      renderOutlineTab(n);
    }
  }

  /* ---- 地点出场自动追踪 ---- */
  function trackChapterPlace(n, chapterIndex) {
    const c = n.chapters[chapterIndex];
    if (!c || !c.place || !Array.isArray(n.places) || !n.places.length) return;
    const match = n.places.find(p => p.name === c.place);
    if (!match) return;
    // 记录章节
    if (!Array.isArray(match.chapters)) match.chapters = [];
    if (!match.chapters.includes(chapterIndex)) {
      match.chapters.push(chapterIndex);
      match.chapters.sort((a, b) => a - b);
    }
    // 记录角色
    if (!Array.isArray(match.characters)) match.characters = [];
    const addChar = (name) => { if (name && !match.characters.includes(name)) match.characters.push(name); };
    addChar(n.hero && n.hero.name);
    (n.characters || []).forEach(ch => { if (ch.role !== '主角') addChar(ch.name); });
  }

  /* ---- 角色关系初始化 ---- */
  function syncDefaultRelations(n) {
    if (!Array.isArray(n.relations)) n.relations = [];
    if (!Array.isArray(n.characters) || !n.characters.length) return;
    const hero = n.characters.find(c => c.role === '主角');
    if (!hero) return;
    // 为每个非主角角色确保至少有一条与主角的关系边
    n.characters.forEach(ch => {
      if (ch.role === '主角') return;
      const exists = n.relations.some(r =>
        (r.from === hero.name && r.to === ch.name) || (r.from === ch.name && r.to === hero.name)
      );
      if (exists) return;
      const type = ch.role === '对手' ? '宿敌' : ch.role === '引路人' ? '师徒' : '盟友';
      n.relations.push({ from: hero.name, to: ch.name, type });
    });
    // 也补上盟友之间的边
    const allies = n.characters.filter(c => c.role === '盟友' || c.role === '主盟友');
    for (let i = 0; i < allies.length; i++) {
      for (let j = i + 1; j < allies.length; j++) {
        const a = allies[i], b = allies[j];
        const exists = n.relations.some(r =>
          (r.from === a.name && r.to === b.name) || (r.from === b.name && r.to === a.name)
        );
        if (!exists) n.relations.push({ from: a.name, to: b.name, type: '同门' });
      }
    }
  }

  /* ---- 角色页 ---- */
  function renderCharactersTab(n) {
    const tab = $('tab-characters');
    tab.innerHTML = '';
    syncDefaultRelations(n);
    MQ.Store.upsertNovel(n);

    const toolbar = MQ.el('div', { class: 'outline-toolbar' }, [
      enginePills(state.charEngine, (v) => { state.charEngine = v; saveModulePrefs(); renderCharactersTab(n); }),
      MQ.el('span', { class: 'hint muted', text: `${n.characters.length} 位角色 · 对话已按性格区分` }),
      MQ.el('button', { class: 'btn btn-ghost btn-sm', id: 'btn-graph-toggle', text: '🔗 关系图', title: '切换角色关系图视图',
        onclick: () => { state.charGraph = !state.charGraph; renderCharactersTab(n); }
      }),
      MQ.el('button', { class: 'btn btn-ghost btn-sm', id: 'btn-regen-chars', text: '⟳ 重新生成角色', onclick: () => regenerateCharacters(n) }),
    ]);
    tab.appendChild(toolbar);

    // 关系图视图
    if (state.charGraph) {
      const graphArea = MQ.el('div', { id: 'rg-area' });
      tab.appendChild(graphArea);
      renderRelationGraph(n, graphArea);
      return;
    }
    if (!n.characters.length) {
      tab.appendChild(MQ.el('div', { class: 'empty-state' }, [
        MQ.el('div', { class: 'es-ico', text: '👥' }),
        MQ.el('p', { text: '还没有角色，点击上方按钮生成角色卡。' }),
      ]));
      return;
    }
    const grid = MQ.el('div', { class: 'char-grid' });
    const roleCls = { '主角': '⭐', '主盟友': '🛡️', '盟友': '🛡️', '引路人': '🕯️', '对手': '⚔️' };
    n.characters.forEach(ch => {
      const card = MQ.el('div', { class: 'char-card card' }, [
        MQ.el('div', {}, [
          MQ.el('span', { class: 'cc-name', text: ch.name }),
          MQ.el('span', { class: 'cc-role', text: `${roleCls[ch.role] || ''} ${ch.role}` }),
        ]),
        MQ.el('div', { class: 'cc-persona', text: `${ch.identity} · ${ch.personaOuter} / ${ch.personaInner}` }),
        MQ.el('div', { class: 'cc-line', html: `<b>样貌：</b>${MQ.esc(ch.body)}` }),
        MQ.el('div', { class: 'cc-line', html: `<b>性格：</b>${MQ.esc(ch.personaSay)}` }),
        MQ.el('div', { class: 'cc-line', html: `<b>背景：</b>${MQ.esc(ch.backstory)}` }),
        MQ.el('div', { class: 'cc-line', html: `<b>目标：</b>${MQ.esc(ch.goal)}` }),
        ch.arc && ch.arc.flaw ? MQ.el('div', { class: 'cc-arc', html: `<b>成长弧光：</b>${MQ.esc(ch.arc.flaw)} → ${MQ.esc(ch.arc.turn)} → ${MQ.esc(ch.arc.end)}` })
          : ch.arc ? MQ.el('div', { class: 'cc-arc', html: `<b>故事线：</b>${MQ.esc(ch.arc)}` }) : null,
      ]);
      grid.appendChild(card);
    });
    tab.appendChild(grid);
  }

  /* ---- 角色关系图 ---- */
  function renderRelationGraph(n, area) {
    area.innerHTML = ''; // 清除旧内容，避免重渲染时 SVG 叠加
    if (!Array.isArray(n.relations)) n.relations = [];
    if (!n.graphPos) n.graphPos = {};
    const sel = state.selectedRelNode || '';

    const nameSet = new Set();
    n.characters.forEach(c => nameSet.add(c.name));
    n.relations.forEach(r => { nameSet.add(r.from); nameSet.add(r.to); });
    const names = [...nameSet];

    // 节点大小按角色区分
    const nodeR = (ch) => ch && ch.role === '主角' ? 32 : (ch && (ch.role === '主盟友' || ch.role === '对手') ? 28 : 24);

    // 初始化位置
    const cx = 350, cy = 260, radius = Math.min(180, names.length * 50);
    names.forEach((name, i) => {
      if (!n.graphPos[name]) {
        const angle = (2 * Math.PI * i) / names.length - Math.PI / 2;
        n.graphPos[name] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
      }
    });

    // 与选中节点相关的名字集合
    const relatedNames = new Set();
    if (sel) {
      relatedNames.add(sel);
      n.relations.forEach(r => {
        if (r.from === sel) relatedNames.add(r.to);
        if (r.to === sel) relatedNames.add(r.from);
      });
    }

    const lineStyles = { '盟友': '#78be78', '宿敌': '#e88b6f', '师徒': '#8eb8f0', '同门': '#d4a643', '情侣': '#f0a0b0', '血亲': '#a78bfa' };

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'rg-svg');
    svg.setAttribute('viewBox', '0 0 700 520');
    svg.style.width = '100%'; svg.style.height = '500px';

    // 线组
    const lineGroup = document.createElementNS(svgNs, 'g');
    n.relations.forEach((r, ri) => {
      const from = n.graphPos[r.from], to = n.graphPos[r.to];
      if (!from || !to) return;
      const color = lineStyles[r.type] || '#666';
      const isRel = !sel || (r.from === sel || r.to === sel);

      const line = document.createElementNS(svgNs, 'line');
      line.setAttribute('x1', from.x); line.setAttribute('y1', from.y);
      line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', isRel ? '3' : '1.5');
      line.setAttribute('opacity', isRel ? '1' : '0.12');
      line.setAttribute('data-ri', ri);
      line.style.cursor = 'pointer';
      line.addEventListener('click', () => openRelationModal(n, r, ri));
      lineGroup.appendChild(line);

      // 标签
      if (isRel) {
        const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
        const label = document.createElementNS(svgNs, 'text');
        label.setAttribute('x', mx); label.setAttribute('y', my - 8);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', color); label.setAttribute('font-size', '12');
        label.setAttribute('font-weight', '600');
        label.textContent = r.type;
        lineGroup.appendChild(label);
      }
    });
    svg.appendChild(lineGroup);

    // 节点组
    const nodeGroup = document.createElementNS(svgNs, 'g');
    names.forEach(name => {
      const ch = n.characters.find(c => c.name === name);
      const pos = n.graphPos[name];
      if (!pos) return;
      const r = nodeR(ch);
      const isHighlight = !sel || relatedNames.has(name);

      const g = document.createElementNS(svgNs, 'g');
      g.setAttribute('class', 'rg-node');
      g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
      g.setAttribute('data-name', name);
      g.style.cursor = sel ? (relatedNames.has(name) ? 'pointer' : 'default') : 'grab';
      g.style.opacity = isHighlight ? '1' : '0.2';
      g.style.transition = 'opacity .25s';

      const circle = document.createElementNS(svgNs, 'circle');
      circle.setAttribute('r', String(r));
      circle.setAttribute('stroke', name === sel ? '#f0e68c' : (ch ? '#d4a643' : '#555'));
      circle.setAttribute('stroke-width', name === sel ? '3' : '2');
      circle.style.fill = name === sel ? '#d4a643' : '#1a1a24';
      if (!ch) circle.style.fill = '#333';
      g.appendChild(circle);

      const txt = document.createElementNS(svgNs, 'text');
      txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dy', '5');
      txt.style.fill = name === sel ? '#1a1a24' : '#ccc';
      txt.setAttribute('font-size', String(r > 28 ? 14 : 11));
      txt.setAttribute('font-weight', '700');
      txt.textContent = name.length > 3 ? name.slice(0, 3) + '…' : name;
      g.appendChild(txt);

      if (ch && isHighlight) {
        const role = document.createElementNS(svgNs, 'text');
        role.setAttribute('text-anchor', 'middle'); role.setAttribute('dy', String(r + 16));
        role.style.fill = '#888'; role.setAttribute('font-size', '10');
        role.textContent = ch.role || '';
        g.appendChild(role);
      }

      // 交互：轻点选中，拖拽移动
      g.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        g.setAttribute('data-dragging', '1');
        g.setAttribute('data-mx', e.clientX);
        g.setAttribute('data-my', e.clientY);
        g.setAttribute('data-mt', Date.now());
        g.style.cursor = 'grabbing';
      });
      nodeGroup.appendChild(g);
    });
    svg.appendChild(nodeGroup);

    // 全局 mousemove / mouseup（委托在 svg 上，避免逐节点累加监听器）
    svg.onmousemove = (e) => {
      const dragging = svg.querySelector('.rg-node[data-dragging="1"]');
      if (!dragging) return;
      const mt = parseInt(dragging.getAttribute('data-mt'), 10);
      if (Date.now() - mt < 30) return;
      const name = dragging.getAttribute('data-name');
      const rect = svg.getBoundingClientRect();
      const sx = 700 / rect.width, sy = 520 / rect.height;
      const x = Math.max(28, Math.min(672, (e.clientX - rect.left) * sx));
      const y = Math.max(28, Math.min(492, (e.clientY - rect.top) * sy));
      n.graphPos[name] = { x, y };
      // 直接移动 node 的 transform（不重渲染，避免销毁正在拖拽的 DOM）
      dragging.setAttribute('transform', `translate(${x},${y})`);
      // 更新与此节点相关的连线端点
      const lines = svg.querySelectorAll('line');
      lines.forEach(line => {
        const ri = parseInt(line.getAttribute('data-ri'), 10);
        if (isNaN(ri)) return;
        const r = n.relations[ri];
        if (!r) return;
        if (r.from === name) { line.setAttribute('x1', x); line.setAttribute('y1', y); }
        if (r.to === name) { line.setAttribute('x2', x); line.setAttribute('y2', y); }
      });
    };
    svg.onmouseup = (e) => {
      const dragging = svg.querySelector('.rg-node[data-dragging="1"]');
      if (!dragging) return;
      const mx = parseInt(dragging.getAttribute('data-mx'), 10);
      const my = parseInt(dragging.getAttribute('data-my'), 10);
      const name = dragging.getAttribute('data-name');
      const dist = Math.hypot(e.clientX - mx, e.clientY - my);
      dragging.removeAttribute('data-dragging');
      dragging.style.cursor = '';
      if (dist > 3) { MQ.Store.upsertNovel(n); renderRelationGraph(n, area); return; }
      // 点击：若已有选中节点且点了另一个无关系节点，弹出快速创建
      if (sel && name !== sel && !showQuickPicker(name)) return;
      // 否则切换选中
      state.selectedRelNode = (sel === name) ? '' : name;
      renderRelationGraph(n, area);
    };
    svg.onmouseleave = () => {
      const dragging = svg.querySelector('.rg-node[data-dragging="1"]');
      if (dragging) { dragging.removeAttribute('data-dragging'); dragging.style.cursor = ''; }
    };

    // 点击空白取消选中
    svg.onclick = (e) => {
      if (e.target === svg && sel) { state.selectedRelNode = ''; renderRelationGraph(n, area); }
    };

    // 选中节点后点击另一个无关节点 → 快速创建关系
    function showQuickPicker(targetName) {
      if (!sel || targetName === sel) return false;
      const exists = n.relations.some(r =>
        (r.from === sel && r.to === targetName) || (r.from === targetName && r.to === sel)
      );
      if (exists) return false;
      const types = ['盟友', '宿敌', '师徒', '同门', '情侣', '血亲'];
      const picker = MQ.el('div', { class: 'rg-picker' });
      types.forEach(t => {
        picker.appendChild(MQ.el('button', {
          class: 'btn btn-ghost btn-sm', text: t, style: 'color:' + (lineStyles[t] || '#ccc'),
          onclick: () => {
            n.relations.push({ from: sel, to: targetName, type: t });
            MQ.Store.upsertNovel(n);
            state.selectedRelNode = '';
            renderRelationGraph(n, area);
            toast(`已添加「${sel} → ${targetName}」${t}`);
          },
        }));
      });
      picker.appendChild(MQ.el('button', { class: 'btn btn-ghost btn-sm', text: '✕', onclick: () => picker.remove() }));
      document.body.appendChild(picker);
      const movePicker = (ev) => { picker.style.left = (ev.clientX + 12) + 'px'; picker.style.top = (ev.clientY - 6) + 'px'; };
      movePicker(window.event || { clientX: 300, clientY: 200 });
      setTimeout(() => document.addEventListener('click', function rm() { picker.remove(); document.removeEventListener('click', rm); }, { once: true }), 50);
      return true;
    };

    const addRelBtn = MQ.el('button', { class: 'btn btn-ghost btn-sm', style: 'margin-top:12px', text: '＋ 添加关系',
      onclick: () => openRelationModal(n, null),
    });

    const wrapper = MQ.el('div', { class: 'rg-wrap' });
    wrapper.appendChild(svg);
    area.appendChild(wrapper);
    area.appendChild(MQ.el('div', { class: 'rg-legend' }, [
      MQ.el('span', { text: '盟友', style: 'color:#78be78' }),
      MQ.el('span', { text: '宿敌', style: 'color:#e88b6f;margin-left:8px' }),
      MQ.el('span', { text: '师徒', style: 'color:#8eb8f0;margin-left:8px' }),
      MQ.el('span', { text: '同门', style: 'color:#d4a643;margin-left:8px' }),
      MQ.el('span', { text: '情侣', style: 'color:#f0a0b0;margin-left:8px' }),
      MQ.el('span', { text: '血亲', style: 'color:#a78bfa;margin-left:8px' }),
      MQ.el('span', { text: sel ? '💡 再点另一个角色建立关系' : '💡 点角色高亮其关系网', style: 'margin-left:12px;color:var(--ink-faint);font-size:11px' }),
    ]));
    area.appendChild(addRelBtn);
  }

  function openRelationModal(n, rel, idx) {
    const isEdit = !!rel;
    closeModal();
    const fromInp = MQ.el('select', {}, (n.characters || []).map(c => MQ.el('option', { value: c.name, text: c.name + '（' + c.role + '）', selected: rel ? c.name === rel.from : false })));
    const toInp = MQ.el('select', {}, (n.characters || []).map(c => MQ.el('option', { value: c.name, text: c.name + '（' + c.role + '）', selected: rel ? c.name === rel.to : false })));
    const typeOpts = ['盟友', '宿敌', '师徒', '同门', '情侣', '血亲'];
    const typeInp = MQ.el('select', {}, typeOpts.map(t => MQ.el('option', { value: t, text: t, selected: rel ? t === rel.type : false })));

    const body = [
      MQ.el('div', { class: 'field' }, [MQ.el('label', { text: '角色 A' }), fromInp]),
      MQ.el('div', { class: 'field' }, [MQ.el('label', { text: '角色 B' }), toInp]),
      MQ.el('div', { class: 'field' }, [MQ.el('label', { text: '关系类型' }), typeInp]),
    ];

    openModal(isEdit ? '编辑关系' : '添加关系', body, [
      isEdit ? { text: '删除', class: 'btn-ghost', style: 'color:var(--err)', onclick: () => { n.relations.splice(idx, 1); MQ.Store.upsertNovel(n); closeModal(); renderCharactersTab(n); toast('已删除关系'); } } : null,
      { text: '取消', class: 'btn-ghost', onclick: closeModal },
      {
        text: isEdit ? '保存' : '✓ 添加', class: 'btn-primary',
        onclick: () => {
          const from = fromInp.value, to = toInp.value, type = typeInp.value;
          if (from === to) { toast('不能选择同一个角色', 'warn'); return; }
          if (isEdit) { rel.from = from; rel.to = to; rel.type = type; }
          else {
            const dup = n.relations.find(r => (r.from === from && r.to === to) || (r.from === to && r.to === from));
            if (dup) { toast('这两个角色之间已有关系', 'warn'); return; }
            n.relations.push({ from, to, type });
          }
          MQ.Store.upsertNovel(n);
          closeModal();
          renderCharactersTab(n);
          toast(isEdit ? '关系已更新' : `已添加「${from} → ${to}」${type}`);
        },
      },
    ].filter(Boolean));
  }

  async function regenerateCharacters(n) {
    if (state.generating) return;
    if (n.characters.length && !confirm('重新生成角色卡将覆盖现有角色。继续？')) return;
    state.generating = true;
    const btn = $('btn-regen-chars');
    if (btn) { btn.disabled = true; btn.textContent = '…生成中'; }
    let usedAI = false;
    let tries = 1;
    let cancelled = false;
    try {
      if (state.charEngine === 'ai') {
        if (!MQ.AI.isConfigured()) {
          toast('未配置 AI 接口，已改用本地模板生成', 'err');
        } else {
          usedAI = true;
          const ac = new AbortController();
          const prog = progressOverlay(['正在描摹人物轮廓', '正在打磨性格差异', '正在撰写背景故事', '正在收束角色弧光'], () => { ac.abort(); prog.cancelling(); });
          try {
            n.characters = await MQ.AI.generateCharactersAI(n, (a) => { tries = a; if (a > 1) prog.retry(a); }, ac.signal);
            prog.finish('角色完成');
          } catch (err) {
            if (MQ.AI.isAbort(err)) {
              cancelled = true; // 用户主动取消：保留原角色，不回退本地
              prog.fail('已取消');
              toast('已取消角色生成');
            } else {
              usedAI = false; // AI 失败，已回退本地
              prog.fail('失败：' + err.message);
              toast(`AI 角色失败（已尝试 ${tries} 次）：` + err.message + '（已改用本地模板）', 'err');
              MQ.Engine.generateCharacters(n);
            }
          }
        }
      }
      if (cancelled) return; // 取消：原角色保持不变
      if (!usedAI) MQ.Engine.generateCharacters(n);
      syncDefaultRelations(n);
      MQ.Store.upsertNovel(n);
      renderCharactersTab(n);
      toast(usedAI ? (tries > 1 ? `AI 深度角色卡已生成（第 ${tries} 次尝试成功）🎉` : 'AI 深度角色卡已生成 🎉') : '角色卡已重新生成');
    } finally {
      state.generating = false;
      if (btn) { btn.disabled = false; btn.textContent = '⟳ 重新生成角色'; }
    }
  }

  /* ---- 地点百科 ---- */
  function renderPlacesTab(n) {
    const tab = $('tab-places');
    tab.innerHTML = '';
    if (!Array.isArray(n.places)) n.places = [];

    const toolbar = MQ.el('div', { class: 'outline-toolbar' }, [
      MQ.el('span', { class: 'hint muted', text: `${n.places.length} 个地点 · 生成时优先从自定义地点池中选取场景` }),
      MQ.el('button', { class: 'btn btn-ghost btn-sm', text: '🎲 一键填入', title: `填入「${n.genreName}」题材的热门地点`,
        onclick: () => {
          const genre = MQ.Content.getGenre(n.genreId);
          if (!genre || !genre.places) { toast('当前题材无内置地点', 'warn'); return; }
          // 根据题材生成地点描述模板
          const descTpl = (name) => {
            const tpls = {
              xuanhuan: ['灵气充沛的古老之地，传说中曾有上古大能在此留下遗迹。', '这片土地蕴含着不为人知的秘密，空气中弥漫着淡淡的灵力波动。', '一座被岁月尘封的秘地，只有真正的强者才有资格踏入。'],
              xianxia: ['云雾缭绕的仙家圣地，凡人望而却步的禁域。', '剑气纵横之处，千年来无数修士在此悟道飞升。', '天地灵气汇聚之所，修道者梦寐以求的福地。'],
              wuxia: ['江湖中赫赫有名的地方，无数侠客在此留下传说。', '青石铺路，古木参天，一派肃杀之气。', '恩怨在此交织，刀光剑影中见证着江湖的兴衰。'],
              kehuan: ['高科技设施密布的区域，闪烁着冰冷的金属光泽。', '超越时代的造物，人类科技的最高结晶。', '隐藏着不为人知的技术秘密，空气中弥漫着机械的低鸣。'],
              dushi: ['城市中最具标志性的角落，日夜交替间上演着无数故事。', '繁华与落寞的交界，每个人都在这里寻找属于自己的位置。'],
              xuanyi: ['阴森诡谲之地，每当夜色降临便笼罩在不安的气氛中。', '无数未解之谜的源头，连最勇敢的人也望而却步。'],
              yanqing: ['充满浪漫气息的角落，每一缕微风都仿佛在讲述温柔的故事。', '时光在这里变得缓慢，让人忍不住停下脚步。'],
              lishi: ['铭刻着岁月痕迹的古老之地，每一块砖石都在诉说往昔。', '历史的风沙掩盖不了曾经的辉煌，这里的故事流传千年。'],
              qihuan: ['魔法与奇迹交织的梦幻之地，现实与幻想的边界在此模糊。', '异世界的入口，每一寸土地都散发着神秘的光芒。'],
              moshi: ['末日降临后的废墟，残垣断壁间尚存一丝生机。', '文明的墓碑，昔日繁华如今只剩下萧瑟的风声。'],
              wuxian: ['时空裂缝中的异变之地，规则在这里失去意义。', '无限循环中的夹缝，踏入者将面对难以想象的试炼。'],
            };
            const pool = tpls[n.genreId] || ['一个具有重要意义的地方，故事的齿轮在这里悄然转动。', '不可忽视的场景，主角的命运在这里迎来转折。'];
            return pool[Math.floor(Math.random() * pool.length)];
          };
          let added = 0;
          genre.places.forEach(name => {
            if (n.places.find(p => p.name === name)) return;
            n.places.push({ name, desc: descTpl(name), chapters: [], characters: [] });
            added++;
          });
          if (added) { MQ.Store.upsertNovel(n); renderPlacesTab(n); toast(`已填入 ${n.genreName} 题材 ${added} 个地点 🎲`); }
          else toast('所有内置地点已在列表中', 'warn');
        },
      }),
    ]);
    tab.appendChild(toolbar);

    const grid = MQ.el('div', { class: 'places-grid' });

    // 现有地点卡片
    n.places.forEach((p, i) => {
      const chapNames = (p.chapters || []).map(ci => `第${MQ.cnNum(ci + 1)}章`).join('、');
      const charNames = (p.characters || []).join('、');
      const card = MQ.el('div', { class: 'place-card card' }, [
        MQ.el('div', { class: 'pl-name', text: p.name }),
        p.desc ? MQ.el('div', { class: 'pl-desc', text: p.desc }) : null,
        (chapNames || charNames)
          ? MQ.el('div', {
            class: 'pl-meta',
            html: (chapNames ? `<b>出场章节：</b>${chapNames} ` : '') + (charNames ? `<b>关联角色：</b>${charNames}` : ''),
          })
          : null,
        MQ.el('div', { class: 'pl-actions' }, [
          MQ.el('button', {
            class: 'pl-edit', text: '✎', title: '编辑地点',
            onclick: (e) => { e.stopPropagation(); openPlaceModal(n, p, i); },
          }),
          MQ.el('button', {
            class: 'pl-del', text: '✕', title: '删除地点',
            onclick: (e) => {
              e.stopPropagation();
              if (!confirm(`删除地点「${p.name}」？`)) return;
              n.places.splice(i, 1);
              MQ.Store.upsertNovel(n);
              renderPlacesTab(n);
              toast(`已删除「${p.name}」`);
            },
          }),
        ]),
      ]);
      grid.appendChild(card);
    });

    // 添加地点按钮
    const addCard = MQ.el('div', {
      class: 'pl-add', text: '＋ 添加地点',
      onclick: () => openPlaceModal(n, null),
    });
    grid.appendChild(addCard);

    tab.appendChild(grid);
  }

  function openPlaceModal(n, place, idx) {
    const isEdit = !!place;
    closeModal();
    const nameInp = MQ.el('input', {
      type: 'text', placeholder: '地点名称（例：落霞城、藏剑山庄）', maxlength: 16,
      value: place ? place.name : '',
    });
    const descInp = MQ.el('textarea', {
      rows: 3, placeholder: '地点描述（例：一座被血色晚霞笼罩的边陲小镇…）', maxlength: 120,
      value: place ? (place.desc || '') : '',
    });
    const body = [
      MQ.el('div', { class: 'field' }, [MQ.el('label', { text: '地点名称' }), nameInp]),
      MQ.el('div', { class: 'field' }, [MQ.el('label', { text: '描述（可选）' }), descInp]),
    ];

    openModal(isEdit ? '编辑地点' : '添加地点', body, [
      { text: '取消', class: 'btn-ghost', onclick: closeModal },
      {
        text: isEdit ? '保存' : '✓ 添加', class: 'btn-primary',
        onclick: () => {
          const name = nameInp.value.trim();
          if (!name) { toast('请输入地点名称', 'warn'); return; }
          if (!Array.isArray(n.places)) n.places = [];
          // 检查重名
          const dup = n.places.find((p, i) => p.name === name && i !== idx);
          if (dup) { toast('地点名称已存在，请换一个', 'warn'); return; }
          if (isEdit) {
            place.name = name;
            place.desc = descInp.value.trim();
          } else {
            n.places.push({ name, desc: descInp.value.trim(), chapters: [], characters: [] });
          }
          MQ.Store.upsertNovel(n);
          closeModal();
          renderPlacesTab(n);
          toast(isEdit ? `已保存「${name}」` : `已添加「${name}」`);
        },
      },
    ]);
    // 自动聚焦输入框
    setTimeout(() => nameInp.focus(), 60);
  }

  /* ---- 写作台 ---- */
  function renderWriterTab(n) {
    const tab = $('tab-writer');
    const c = n.chapters[state.currentChapter];
    tab.innerHTML = '';

    const engine = MQ.AI.activeEngine();
    const isAI = engine === 'ai';

    const toolbar = MQ.el('div', { class: 'writer-toolbar' }, [
      MQ.el('button', { class: 'btn btn-primary', text: isAI ? '✨ AI 生成本章' : '🖋️ 生成本章', title: '快捷键 Ctrl+Enter', onclick: () => generateCurrent() }),
      MQ.el('button', { class: 'btn btn-ghost', text: '🎲 多版本', title: '一次生成 3 个整章候选，选一个采用', onclick: () => multiGenerate() }),
      MQ.el('button', { class: 'btn btn-ghost', text: '✎ 重写本章', onclick: () => openRewriteModal(n) }),
      MQ.el('button', { class: 'btn btn-ghost', text: '🕘 生成历史', title: '本章自动保存的生成快照，可对比并回滚', onclick: () => openHistoryModal(n) }),
      MQ.el('button', { class: 'btn btn-ghost', text: '🗑️ 清空', onclick: () => clearCurrent() }),
      MQ.el('button', {
        class: 'btn btn-ghost', text: '🔍 错别字', title: '本地检查「的地得」误用与相邻重复词，可定位高亮或一键修复',
        onclick: () => openTypoCheck(n),
      }),
      MQ.el('button', {
        class: 'btn btn-ghost', text: '✏️ 全局替换', title: '全书替换人名/称呼，并同步大纲与角色卡',
        onclick: () => {
          // 先把编辑器当前内容提交进章节，避免防抖未触发导致统计/替换遗漏最新输入（重写预览锁定态不提交，防止覆盖原稿）
          if (state.compareMode !== 'rew') {
            c.text = pt.innerText.trim();
            c.wordCount = MQ.countChars(c.text);
            MQ.Store.upsertNovel(n);
          }
          openGlobalReplaceModal(n);
        },
      }),
      MQ.el('button', {
        class: 'btn btn-ghost', text: '📥 导入 TXT', title: '导入外部文本片段追加到当前章末尾',
        onclick: () => importTxt(n),
      }),
      MQ.el('button', {
        class: 'btn btn-ghost', text: '⬇️ 导出',
        onclick: () => openExportModal(n),
      }),
      MQ.el('button', { class: 'btn btn-ghost', text: '🧘 专注', title: '隐藏侧栏与工具栏，沉浸写作（Esc 退出）', onclick: () => setFocusMode(true) }),
      MQ.el('select', {
        class: 'paper-select', title: '纸张质感',
        onchange: (e) => setPaperTheme(e.target.value),
      }, [
        MQ.el('option', { value: 'white', text: '📄 纯白' }),
        MQ.el('option', { value: 'rice', text: '📜 宣纸米白' }),
        MQ.el('option', { value: 'warm', text: '🕯️ 暖黄' }),
        MQ.el('option', { value: 'parchment', text: '🧻 羊皮纸' }),
        MQ.el('option', { value: 'forest', text: '🌿 墨绿' }),
        MQ.el('option', { value: 'dark', text: '🌙 深色护眼' }),
      ]),
      MQ.el('span', {
        class: 'engine-badge ' + (isAI ? 'ai' : 'local'),
        html: `<span class="dot"></span>${isAI ? 'AI 引擎 · ' + MQ.AI.getConfig().model : '本地引擎'}`,
        title: isAI ? '已配置 AI 接口，生成走 AI' : '未配置 AI 或已切换本地，生成走本地引擎',
      }),
    ]);
    tab.appendChild(toolbar);
    // 切章时刷新灵感面板（上下文感知：当前章 beat 变了，卡片也会变）
    renderInspire(n);
    // 回显持久化的纸张主题（同步下拉选中项）
    setPaperTheme(MQ.Store.getSettings().paperTheme || 'rice');

    const head = MQ.el('div', { class: 'writer-head' }, [
      MQ.el('div', { class: 'writer-title', text: `第${MQ.cnNum(state.currentChapter + 1)}章 ${c.title}` }),
      MQ.el('div', { class: 'writer-sub', text: `${c.summary}` }),
    ]);
    tab.appendChild(head);

    // 重写对比条（原稿 / 重写版）
    if (c.rewrite) {
      const bar = MQ.el('div', { class: 'rewrite-bar' }, [
        MQ.el('button', {
          class: 'rb-pill' + (state.compareMode === 'orig' ? ' active' : ''),
          text: `📄 原稿 · ${MQ.countChars(c.text)} 字`,
          onclick: () => { state.compareMode = 'orig'; renderWriterTab(n); },
        }),
        MQ.el('button', {
          class: 'rb-pill' + (state.compareMode === 'rew' ? ' active' : ''),
          text: `🔄 重写版 · ${c.rewrite.styleName} · ${c.rewrite.wordCount} 字`,
          onclick: () => { state.compareMode = 'rew'; renderWriterTab(n); },
        }),
        MQ.el('span', { class: 'rb-spacer' }),
        MQ.el('span', { class: 'rb-note', text: state.compareMode === 'rew' ? '重写版预览中，编辑已锁定，请先采用或放弃' : '点击切换，对比两个版本' }),
        MQ.el('button', {
          class: 'btn btn-primary btn-sm', text: '✓ 采用重写版',
          onclick: () => {
            c.text = c.rewrite.text;
            c.wordCount = MQ.countChars(c.text);
            n.wordCount = n.chapters.reduce((s, x) => s + (x.wordCount || 0), 0);
            c.rewrite = null;
            state.compareMode = 'orig';
            MQ.Store.upsertNovel(n);
            MQ.Store.clearDraft(n.id, state.currentChapter); // 采用重写版后旧草稿已无意义
            renderWriterTab(n);
            toast('已采用重写版 ✍️', 'ok');
          },
        }),
        MQ.el('button', {
          class: 'btn btn-ghost btn-sm', text: '✕ 放弃',
          onclick: () => {
            c.rewrite = null;
            state.compareMode = 'orig';
            MQ.Store.upsertNovel(n);
            MQ.Store.clearDraft(n.id, state.currentChapter); // 放弃重写后旧草稿已无意义
            renderWriterTab(n);
            toast('已放弃重写');
          },
        }),
      ]);
      tab.appendChild(bar);
    }

    const paper = MQ.el('div', { class: 'paper' }, [
      MQ.el('div', { class: 'paper-text', contenteditable: String(state.compareMode !== 'rew') }),
    ]);
    tab.appendChild(paper);

    // 生成本章工作区（过程在下方预览，确认满意后再并入正文）
    const genArea = MQ.el('div', { class: 'gen-area hidden' }, [
      MQ.el('div', { class: 'gen-head' }, [
        MQ.el('span', { class: 'gen-title', text: '✨ 生成本章预览' }),
        MQ.el('span', { class: 'gen-status', text: '' }),
        MQ.el('button', { class: 'gen-cancel', text: '✕ 取消', title: '停止生成，可保留已生成部分' }),
      ]),
      MQ.el('div', { class: 'gen-out' }),
      MQ.el('div', { class: 'cont-cards gen-cards hidden' }),
      MQ.el('div', { class: 'gen-foot hidden' }, [
        MQ.el('button', { class: 'btn btn-primary btn-sm gen-adopt', text: '✓ 采用此版本' }),
        MQ.el('button', { class: 'btn btn-ghost btn-sm gen-compare hidden', text: '👁 全文对比', title: '与当前正文双栏对照，差异高亮后决定是否采用' }),
        MQ.el('button', { class: 'btn btn-ghost btn-sm gen-discard', text: '✕ 放弃' }),
        MQ.el('button', { class: 'btn btn-ghost btn-sm gen-review hidden', text: '🤖 AI 审稿', title: '让 AI 审阅本章，给出节奏/对话/伏笔/可删减段落的反馈' }),
        MQ.el('button', { class: 'btn btn-ghost btn-sm gen-retry hidden', text: '↻ 重新生成' }),
      ]),
    ]);
    tab.appendChild(genArea);

    // 续写工作区（生成时展开，清晰展示续写过程）
    const contArea = MQ.el('div', { class: 'cont-area hidden' }, [
      MQ.el('div', { class: 'cont-head' }, [
        MQ.el('span', { class: 'cont-title', text: '➕ 正在续写…' }),
        MQ.el('span', { class: 'cont-status', text: '' }),
        MQ.el('button', { class: 'cont-cancel', text: '✕ 取消', title: '停止续写，保留已生成部分' }),
      ]),
      MQ.el('div', { class: 'cont-out' }),
      MQ.el('div', { class: 'cont-cards hidden' }),
      MQ.el('div', { class: 'cont-foot hidden' }, [
        MQ.el('button', { class: 'btn btn-primary btn-sm cont-merge', text: '✓ 并入正文' }),
        MQ.el('button', { class: 'btn btn-ghost btn-sm cont-draft', text: '📝 保留为草稿' }),
        MQ.el('button', { class: 'btn btn-ghost btn-sm cont-drop', text: '✕ 丢弃' }),
      ]),
    ]);
    tab.appendChild(contArea);

    // 续写视角选择器（AI/本地均生效）
    const perspectiveSel = MQ.el('select', {
      class: 'paper-select', title: '续写视角', style: 'font-size:12px;width:auto;',
      onchange: (e) => { const s = MQ.Store.getSettings(); s.perspective = e.target.value; MQ.Store.saveSettings(s); },
    }, [
      MQ.el('option', { value: '', text: '🎭 默认视角' }),
      MQ.el('option', { value: '第一人称', text: '👤 第一人称' }),
      MQ.el('option', { value: '第三人称限知', text: '👁 第三人称限知' }),
      MQ.el('option', { value: '上帝视角', text: '🌍 上帝视角' }),
    ]);
    perspectiveSel.value = MQ.Store.getSettings().perspective || '';

    // 续写入口条（常驻，文章下方）
    const contBar = MQ.el('div', { class: 'cont-bar' }, [
      MQ.el('button', { class: 'btn btn-ghost', text: '➕ 续写本章', title: '从文章末尾继续（快捷键 Ctrl+Shift+Enter）', onclick: () => continueCurrent() }),
      MQ.el('button', { class: 'btn btn-ghost', text: '🎲 多版本续写', title: '一次生成 3 个不同走向的续写候选，选一个并入正文', onclick: () => multiContinue() }),
      perspectiveSel,
      MQ.el('span', { class: 'cont-bar-note', text: '选择视角后续写会按对应人称展开' }),
    ]);
    tab.appendChild(contBar);

    const stat = MQ.el('div', { class: 'stat' });

    // 字数目标进度环（目标可调并持久化，达标时脉冲提示一次）
    const ringWrap = MQ.el('span', { class: 'wc-ring', title: '本章字数达标进度' });
    ringWrap.innerHTML = '<svg viewBox="0 0 36 36"><circle class="ring-bg" cx="18" cy="18" r="15.5" fill="none"></circle><circle class="ring-fg" cx="18" cy="18" r="15.5" fill="none" stroke-dasharray="97.4" stroke-dashoffset="97.4"></circle></svg><span class="ring-pct">0%</span>';
    let target = c.targetWc || parseInt(MQ.Store.getSettings().chapterTarget, 10) || 800;
    let targetNotified = null; // null=未评估（首次更新时按当前字数初始化），true/false=已达标/未达标
    const targetSel = MQ.el('select', { class: 'wc-target', title: '本章字数目标（调整后自动保存）' },
      [[300, '目标 300'], [500, '目标 500'], [800, '目标 800'], [1000, '目标 1000'], [1500, '目标 1500'], [2000, '目标 2000']]
        .map(([v, t]) => MQ.el('option', { value: String(v), text: t }))
    );
    targetSel.value = String(target);
    targetSel.addEventListener('change', () => {
      const v = parseInt(targetSel.value, 10) || 800;
      c.targetWc = v; // 写回本章
      const s = MQ.Store.getSettings();
      s.chapterTarget = v; MQ.Store.saveSettings(s);
      target = v;
      targetNotified = null;
      MQ.Store.upsertNovel(n); // 持久化本章目标
      updateWriterStat();
      renderOutlineTab(n); // 大纲卡刷新目标标签
      toast(`本章目标已设为 ${target} 字`);
    });

    const actions = MQ.el('div', { class: 'writer-actions' }, [
      MQ.el('button', { class: 'btn btn-ghost btn-sm', text: '⟲ 上一章', title: '快捷键 ←', onclick: () => { if (state.currentChapter > 0) selectChapter(state.currentChapter - 1); } }),
      MQ.el('button', { class: 'btn btn-ghost btn-sm', text: '⟳ 下一章', title: '快捷键 →', onclick: () => { if (state.currentChapter < n.chapters.length - 1) selectChapter(state.currentChapter + 1); } }),
      ringWrap,
      targetSel,
      stat,
      MQ.el('span', { class: 'writer-keys', html: 'Ctrl+Enter 生成 · Ctrl+Shift+Enter 续写 · Ctrl+S 保存 · ←/→ 切章' }),
    ]);
    tab.appendChild(actions);

    // 绑定编辑器
    const pt = paper.querySelector('.paper-text');
    pt.textContent = state.compareMode === 'rew' && c.rewrite ? c.rewrite.text : (c.text || '');
    updateWriterStat();

    // ---------- 草稿自动保存：每 5 秒持久化，页面离开/刷新时立即刷新（重写预览锁定态不参与） ----------
    clearInterval(draftTimer);
    draftTimer = null;
    draftCtx = null; // 重写预览锁定态下无草稿上下文，pagehide 时不会用陈旧引用写草稿
    if (state.compareMode !== 'rew') {
      draftCtx = {
        novelId: n.id,
        chapterIndex: state.currentChapter,
        title: c.title,
        getText: () => pt.innerText,
      };
      draftTimer = setInterval(flushDraft, 5000);
      bindDraftHooks();

      // 恢复上次未保存的草稿
      const draft = MQ.Store.getDraft(n.id, state.currentChapter);
      if (draft && draft.text && draft.text.trim() !== (c.text || '').trim()) {
        const bar = MQ.el('div', { class: 'draft-bar' }, [
          MQ.el('span', {
            class: 'db-note',
            html: `📝 检测到未保存的草稿（${fmtAgo(draft.updatedAt)}）· <b>${MQ.countChars(draft.text)}</b> 字`,
          }),
          MQ.el('button', {
            class: 'btn btn-primary btn-sm', text: '↩ 恢复草稿',
            onclick: () => {
              pt.textContent = draft.text;
              c.text = draft.text;
              c.wordCount = MQ.countChars(c.text);
              n.wordCount = n.chapters.reduce((s, x) => s + (x.wordCount || 0), 0);
              MQ.Store.upsertNovel(n);
              MQ.Store.clearDraft(n.id, state.currentChapter);
              bar.remove();
              updateWriterStat();
              renderSidebar(n);
              toast('已恢复草稿 ✍️', 'ok');
            },
          }),
          MQ.el('button', {
            class: 'btn btn-ghost btn-sm', text: '✕ 丢弃',
            onclick: () => {
              MQ.Store.clearDraft(n.id, state.currentChapter);
              bar.remove();
              toast('已丢弃草稿');
            },
          }),
        ]);
        tab.insertBefore(bar, paper);
      }
    }

    // 快捷键动作引用（模块级 writerShortcuts 由全局 keydown 调用）
    writerShortcuts = {
      generate: () => generateCurrent(),
      cont: () => continueCurrent(),
      save: () => {
        if (state.compareMode === 'rew') { toast('重写预览锁定中，无法保存', 'err'); return; } // 预览态不覆盖原稿
        c.text = pt.innerText.trim();
        c.wordCount = MQ.countChars(c.text);
        MQ.Store.upsertNovel(n);
        updateWriterStat();
        renderSidebar(n);
        toast('已保存 ✓', 'ok');
      },
      prev: () => { if (state.currentChapter > 0) selectChapter(state.currentChapter - 1); },
      next: () => { if (state.currentChapter < n.chapters.length - 1) selectChapter(state.currentChapter + 1); },
    };

    const save = MQ.debounce(() => {
      c.text = pt.innerText.trim();
      c.wordCount = MQ.countChars(c.text);
      updateWriterStat();
      MQ.Store.autoSave(n);
    }, 700);
    // 初始化撤销快照基准
    lastUndoSnapshot = (c.text || '').trim();
    pt.addEventListener('input', () => { // 用户输入时清除跳转高亮，避免残留标记影响编辑
      pt.querySelectorAll('mark.mq-hl').forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
      // 撤销快照：防抖，每 800ms 最多压一次栈
      pushUndo(pt.innerText.trim());
    });
    pt.addEventListener('input', save);
    pt.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '　　'); }
    });

    function updateWriterStat() {
      const cur = MQ.countChars(pt.innerText);
      stat.innerHTML = `本章 <b>${cur}</b> 字 · 全书 <b>${MQ.countChars(n.chapters.map(ch => ch.text).join(''))}</b> 字`;
      // 进度环
      const pct = Math.min(100, Math.round(cur / target * 100));
      const fg = ringWrap.querySelector('.ring-fg');
      const pctEl = ringWrap.querySelector('.ring-pct');
      if (fg) fg.style.strokeDashoffset = String(Math.round(97.4 * (1 - pct / 100)));
      if (pctEl) pctEl.textContent = pct + '%';
      // 达标提示：仅在「未达标→达标」的跨越瞬间触发一次
      if (targetNotified === null) {
        targetNotified = cur >= target; // 初始已达标不重复提示
      } else if (cur >= target && !targetNotified) {
        targetNotified = true;
        ringWrap.classList.add('done');
        setTimeout(() => ringWrap.classList.remove('done'), 1200);
        toast(`🎉 本章已达目标 ${target} 字`, 'ok');
      } else if (cur < target) {
        targetNotified = false;
      }
    }

    async function generateCurrent() {
      if (state.generating) return;
      if (c.rewrite) { c.rewrite = null; state.compareMode = 'orig'; }
      state.generating = true;
      let ac = null;
      let localCancelled = false;
      contArea.classList.add('hidden'); // 三个工作区互斥：展开生成本章时收起续写工作区
      // 生成前的原文（对比用）：生成结束后 c.text 会被新稿覆盖，必须先存原值
      const origText = c.text || '';

      // 展开下方生成工作区：过程在预览区展开，确认满意后再并入正文（不遮罩、不清空原文）
      const genOut = genArea.querySelector('.gen-out');
      const genStatus = genArea.querySelector('.gen-status');
      const genTitle = genArea.querySelector('.gen-title');
      const genCancel = genArea.querySelector('.gen-cancel');
      const genFoot = genArea.querySelector('.gen-foot');
      const genAdopt = genFoot.querySelector('.gen-adopt');
      const genDiscard = genFoot.querySelector('.gen-discard');
      const genRetry = genFoot.querySelector('.gen-retry');
      const genCompare = genFoot.querySelector('.gen-compare');
      const genReview = genFoot.querySelector('.gen-review');
      genAdopt.onclick = () => adopt(genAdopt.textContent.includes('部分') ? '（已生成部分）' : '');
      genDiscard.onclick = () => discard('已放弃本次生成，原文未改变');
      genReview.onclick = () => openReviewReport(n, state.currentChapter, genOut.textContent.trim());
      // 全文对比：与生成前的原文双栏对照，差异高亮后决定是否采用
      genCompare.onclick = () => {
        const { oldParts, newParts, stat } = sentenceDiff(origText, genOut.textContent.trim());
        const pane = (title, parts, side) => MQ.el('div', { class: 'compare-pane' }, [
          MQ.el('div', { class: 'compare-head ' + side }, [
            MQ.el('b', { text: title }),
            MQ.el('span', { text: parts.length + ' 句' }),
          ]),
          MQ.el('div', { class: 'compare-body cd-body' }, parts.map(p => MQ.el('span', { class: 'cd-' + p.d, text: p.t }))),
        ]);
        const body = MQ.el('div', {}, [
          MQ.el('div', { class: 'cd-stat', html: `新增 <b>${stat.add}</b> 句 · 删除 <b>${stat.del}</b> 句 · 相同 <b>${stat.same}</b> 句（左：当前正文 / 右：生成的新稿）` }),
          MQ.el('div', { class: 'compare-grid' }, [
            pane('当前正文', oldParts, 'cur'),
            pane('生成的新稿', newParts, 'snap'),
          ]),
        ]);
        openModal('👁 全文对比 · ' + c.title, body, [
          { text: '↩ 返回', cls: 'btn-ghost', onclick: (m) => closeModal(m) },
          { text: '✓ 采用此版本', cls: 'btn-primary', onclick: (m) => { closeModal(m); adopt(''); } },
        ], true);
      };
      genArea.querySelector('.gen-cards').classList.add('hidden'); // 确保单版本模式（防多版本残留）
      genOut.classList.remove('hidden');
      genArea.classList.remove('hidden');
      genOut.textContent = '';
      genOut.style.color = '';
      genStatus.textContent = '';
      genTitle.textContent = '✨ 正在生成本章…';
      genFoot.classList.add('hidden');
      genAdopt.classList.remove('hidden');
      genCompare.classList.add('hidden');
      genRetry.classList.add('hidden');
      genCancel.textContent = '✕ 取消';
      genCancel.disabled = false;
      genCancel.classList.remove('hidden');
      genCancel.onclick = () => {
        if (ac) ac.abort();
        else localCancelled = true;
        genCancel.textContent = '取消中…';
        genCancel.disabled = true;
      };
      genArea.scrollIntoView({ block: 'nearest' });
      const appendGen = (text) => {
        genOut.textContent += text;
        genOut.scrollTop = genOut.scrollHeight; // 自动跟随，持续看到最新内容
      };

      // 生成前保留当前内容为快照（防止生成覆盖手写内容后无法找回）
      pushChapterSnapshot(n, state.currentChapter, pt.innerText, 'pre', MQ.AI.activeEngine() === 'ai');

      const t0 = Date.now();
      const tint = setInterval(() => {
        genStatus.textContent = '已用 ' + Math.round((Date.now() - t0) / 1000) + 's';
      }, 500);
      let tries = 1;

      // 采用：把预览内容并入正文（完整替换本章）
      const adopt = (label) => {
        const text = genOut.textContent.trim();
        c.text = text;
        c.wordCount = MQ.countChars(c.text);
        n.wordCount = n.chapters.reduce((s, x) => s + (x.wordCount || 0), 0);
        pt.textContent = c.text;
        pushChapterSnapshot(n, state.currentChapter, c.text, 'gen', MQ.AI.activeEngine() === 'ai');
        trackChapterPlace(n, state.currentChapter);
        MQ.Store.upsertNovel(n);
        MQ.Store.clearDraft(n.id, state.currentChapter);
        updateWriterStat();
        renderSidebar(n);
        renderOutlineTab(n);
        toast('已采用新生成的本章（' + MQ.countChars(c.text) + ' 字）' + label + ' ✍️', 'ok');
        closeGen();
        setTimeout(() => pt.scrollIntoView({ block: 'end' }), 50);
      };
      const discard = (msg) => {
        closeGen();
        toast(msg || '已放弃本次生成，原文未改变');
      };
      const closeGen = () => {
        clearInterval(tint);
        state.generating = false;
        genArea.classList.add('hidden');
        genFoot.classList.add('hidden');
        genTitle.textContent = '✨ 生成本章预览';
      };
      const showFoot = (adoptText, discardText) => {
        genAdopt.textContent = adoptText;
        genDiscard.textContent = discardText;
        genCompare.classList.remove('hidden');
        if (MQ.AI.isConfigured()) genReview.classList.remove('hidden');
        else genReview.classList.add('hidden');
        genFoot.classList.remove('hidden');
      };

      try {
        if (MQ.AI.activeEngine() === 'ai') {
          ac = new AbortController();
          await MQ.AI.generateChapterAI(n, state.currentChapter, (delta) => {
            appendGen(delta);
          }, (a) => {
            tries = a;
            if (a > 1) genStatus.textContent = '⚠ 生成中断，正在第 ' + a + ' 次尝试…';
          }, ac.signal);
          // AI 引擎已在内部写入 c.text（polish 版全文），但正文采用以预览区为准
          c.text = genOut.textContent;
        } else {
          const chapter = MQ.Engine.generateChapter(n, state.currentChapter);
          const paras = chapter.text.split('\n\n');
          for (let i = 0; i < paras.length; i++) {
            if (localCancelled) break;
            appendGen(paras.length > 1 && i > 0 ? '\n\n' + paras[i] : paras[i]);
            await sleep(55 + Math.random() * 60);
          }
          c.text = genOut.textContent;
        }
        // 生成结束：交由用户确认（解锁生成锁，但工作区保持展开等待采用/放弃）
        clearInterval(tint);
        state.generating = false;
        genCancel.classList.add('hidden');
        if (localCancelled) {
          // 取消：若已有部分内容，允许「采用已生成部分」或放弃
          genTitle.textContent = '已取消生成（保留已生成部分）';
          if (genOut.textContent.trim()) {
            showFoot('✓ 采用已生成部分', '✕ 放弃');
          } else {
            discard('已取消生成');
          }
        } else {
          genTitle.textContent = '生成完成——请确认是否并入正文';
          genStatus.textContent = tries > 1 ? `第 ${tries} 次尝试成功 · ${MQ.countChars(genOut.textContent)} 字` : `${MQ.countChars(genOut.textContent)} 字`;
          showFoot('✓ 采用此版本', '✕ 放弃');
        }
      } catch (err) {
        clearInterval(tint);
        state.generating = false;
        const aborted = MQ.AI.isAbort(err);
        genCancel.classList.add('hidden');
        if (aborted) {
          genTitle.textContent = '已取消生成（保留已生成部分）';
          if (genOut.textContent.trim()) showFoot('✓ 采用已生成部分', '✕ 放弃');
          else discard('已取消生成');
        } else {
          // 失败：显示原因，可重试或放弃
          genTitle.textContent = '✕ 生成失败';
          genOut.textContent = '生成失败：' + err.message;
          genOut.style.color = '#e88b6f';
          genRetry.classList.remove('hidden');
          genRetry.onclick = () => { closeGen(); setTimeout(() => generateCurrent(), 30); };
          showFoot('', '✕ 放弃');
          genAdopt.classList.add('hidden');
        }
      } finally {
        updateWriterStat();
      }
    }

    // 多版本生成本章：一次生成 3 个整章候选，选一个采用（参考多版本续写）
    async function multiGenerate() {
      if (state.generating) return;
      if (c.rewrite) { c.rewrite = null; state.compareMode = 'orig'; }
      state.generating = true;
      let ac = null;
      let aborted = false;
      contArea.classList.add('hidden'); // 工作区互斥
      const origText = c.text || '';
      pushChapterSnapshot(n, state.currentChapter, origText, 'pre', MQ.AI.activeEngine() === 'ai');

      const dirs = ['剑走偏锋 · 冲突升级', '温情收束 · 羁绊加深', '悬念迭起 · 伏笔展开'];
      const aiDirs = ['冲突与危机升级', '人物情感与羁绊加深', '悬念与伏笔展开'];

      // 展开 genArea 并切到多版本模式
      const genOut = genArea.querySelector('.gen-out');
      const genCards = genArea.querySelector('.gen-cards');
      const genStatus = genArea.querySelector('.gen-status');
      const genTitle = genArea.querySelector('.gen-title');
      const genCancel = genArea.querySelector('.gen-cancel');
      const genFoot = genArea.querySelector('.gen-foot');
      genTitle.textContent = '🎲 多版本生成本章中…';
      genArea.classList.remove('hidden');
      genOut.classList.add('hidden');
      genCards.classList.remove('hidden');
      genCards.innerHTML = '';
      genFoot.classList.add('hidden');
      genStatus.textContent = '';
      genCancel.textContent = '✕ 取消（放弃本次）';
      genCancel.disabled = false;
      genCancel.onclick = () => {
        if (ac) ac.abort();
        else aborted = true;
        genCancel.textContent = '取消中…';
        genCancel.disabled = true;
      };
      genArea.scrollIntoView({ block: 'nearest' });

      // 三张候选卡（复用续写卡样式）
      const cards = dirs.map((label) => {
        const adoptBtn = MQ.el('button', { class: 'btn btn-primary btn-sm', text: '✓ 采用此版本', disabled: 'disabled' });
        const card = MQ.el('div', { class: 'cont-card' }, [
          MQ.el('div', { class: 'cont-card-head' }, [
            MQ.el('span', { class: 'cont-card-dir', text: label }),
            MQ.el('span', { class: 'cont-card-wc', text: '…' }),
          ]),
          MQ.el('div', { class: 'cont-card-body' }),
          MQ.el('div', { class: 'cont-card-foot' }, [adoptBtn]),
        ]);
        genCards.appendChild(card);
        return {
          el: card,
          body: card.querySelector('.cont-card-body'),
          wcEl: card.querySelector('.cont-card-wc'),
          adoptBtn,
          fullText: null,
          done: false,
        };
      });

      const t0 = Date.now();
      const tint = setInterval(() => {
        genStatus.textContent = '已用 ' + Math.round((Date.now() - t0) / 1000) + 's';
      }, 500);
      let tries = 1;

      const closeGenArea = () => {
        clearInterval(tint);
        state.generating = false;
        genArea.classList.add('hidden');
        genCards.classList.add('hidden');
        genTitle.textContent = '✨ 生成本章预览';
      };

      const finishCard = (card, fullText) => {
        card.fullText = fullText;
        card.done = true;
        card.wcEl.textContent = MQ.countChars(fullText) + ' 字';
        card.adoptBtn.disabled = false;
        card.adoptBtn.onclick = () => {
          // 采用：整章替换
          c.text = card.fullText;
          c.wordCount = MQ.countChars(c.text);
          n.wordCount = n.chapters.reduce((s, x) => s + (x.wordCount || 0), 0);
          pt.textContent = c.text;
          pushChapterSnapshot(n, state.currentChapter, c.text, 'gen', MQ.AI.activeEngine() === 'ai');
          trackChapterPlace(n, state.currentChapter);
          MQ.Store.upsertNovel(n);
          MQ.Store.clearDraft(n.id, state.currentChapter);
          updateWriterStat();
          renderSidebar(n);
          renderOutlineTab(n);
          const label = dirs[cards.indexOf(card)].split(' · ')[0];
          closeGenArea();
          toast('已采用「' + label + '」版本（' + MQ.countChars(c.text) + ' 字）✍️', 'ok');
          setTimeout(() => pt.scrollIntoView({ block: 'end' }), 50);
        };
      };

      try {
        if (MQ.AI.activeEngine() === 'ai') {
          ac = new AbortController();
          await Promise.all(cards.map((card, i) =>
            MQ.AI.generateChapterAI(n, state.currentChapter, (delta) => {
              card.body.textContent += delta;
              card.body.scrollTop = card.body.scrollHeight;
            }, (a) => {
              tries = a;
              if (a > 1) genStatus.textContent = '⚠ 生成中断，正在第 ' + a + ' 次尝试…';
            }, ac.signal, aiDirs[i])
              .then(ch => finishCard(card, ch.text))
              .catch(e => {
                if (MQ.AI.isAbort(e)) throw e;
                card.body.textContent = '✕ 生成失败：' + e.message;
                card.body.style.color = '#e88b6f';
                card.wcEl.textContent = '失败';
              })
          ));
        } else {
          for (let i = 0; i < 3; i++) {
            if (aborted) break;
            const ch = MQ.Engine.generateChapter(n, state.currentChapter, undefined, i);
            const paras = (ch.text || '').split('\n\n');
            for (const para of paras) {
              if (aborted) break;
              if (!para.trim()) continue;
              cards[i].body.textContent = cards[i].body.textContent ? cards[i].body.textContent + '\n\n' + para : para;
              cards[i].body.scrollTop = cards[i].body.scrollHeight;
              await sleep(40);
            }
            finishCard(cards[i], ch.text);
          }
        }
        if (!cards.some(c => c.done)) {
          toast('多版本生成本章失败：所有候选都未生成', 'err');
        }
      } catch (err) {
        if (!MQ.AI.isAbort(err)) toast('多版本生成本章失败：' + err.message, 'err');
      } finally {
        if (!state.generating) { /* 已通过采用提前解锁 */ } else {
          clearInterval(tint);
          state.generating = false;
        }
        if (aborted) {
          const done = cards.filter(c => c.done);
          if (done.length) {
            genStatus.textContent = `已停止生成，${done.length} 个候选已完成——可选用，或点「关闭」放弃全部`;
            genCancel.textContent = '✕ 关闭';
            genCancel.disabled = false;
            genCancel.onclick = () => {
              closeGenArea();
              toast('已放弃本次多版本生成本章');
            };
          } else {
            closeGenArea();
            toast('已放弃多版本生成本章');
          }
        } else if (!aborted && cards.some(c => c.done)) {
          genStatus.textContent = '生成完成，请选择一个版本采用';
        }
      }
    }

    // 导入外部 TXT 文本追加到当前章末尾
    function importTxt(n) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.text';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const content = reader.result.trim();
          if (!content) { toast('文件内容为空', 'err'); return; }
          // 推入撤销栈
          pushUndo(pt.innerText.trim());
          // 追加到编辑器末尾
          const cur = pt.innerText.trim();
          pt.innerText = cur ? cur + '\n\n' + content : content;
          // 同步到章节
          c.text = pt.innerText.trim();
          c.wordCount = MQ.countChars(c.text);
          MQ.Store.upsertNovel(n);
          updateWriterStat();
          toast(`已导入「${file.name}」（${MQ.countChars(content)} 字）✅`, 'ok');
        };
        reader.readAsText(file, 'UTF-8');
      };
      input.click();
    }

    async function continueCurrent() {
      if (state.generating) return;
      if (c.rewrite) { c.rewrite = null; state.compareMode = 'orig'; }
      state.generating = true;
      let ac = null;
      let localCancelled = false;
      genArea.classList.add('hidden'); // 三个工作区互斥：展开续写时收起生成本章工作区
      const existing = pt.innerText.trim();
      // 续写前保留当前内容为快照（回滚可截断新增部分）
      pushChapterSnapshot(n, state.currentChapter, existing, 'pre', MQ.AI.activeEngine() === 'ai');
      // 展开下方工作区，清晰展示续写过程（不遮罩，原文保持可见）
      const contOut = contArea.querySelector('.cont-out');
      const contStatus = contArea.querySelector('.cont-status');
      const cancelBtn = contArea.querySelector('.cont-cancel');
      const contTitle = contArea.querySelector('.cont-title');
      const contFoot = contArea.querySelector('.cont-foot');
      contArea.querySelector('.cont-cards').classList.add('hidden'); // 确保单版本模式（防多版本残留）
      contFoot.classList.add('hidden');
      contOut.classList.remove('hidden');
      contTitle.textContent = '➕ 正在续写…';
      contArea.classList.remove('hidden');
      contOut.textContent = '';
      contStatus.textContent = '';
      cancelBtn.textContent = '✕ 取消';
      cancelBtn.disabled = false;
      cancelBtn.onclick = () => {
        if (ac) ac.abort();
        else localCancelled = true;
        cancelBtn.textContent = '取消中…';
        cancelBtn.disabled = true;
      };
      contArea.scrollIntoView({ block: 'nearest' });
      const appendDelta = (text) => {
        contOut.textContent += text;
        contOut.scrollTop = contOut.scrollHeight; // 自动跟随，持续看到最新内容
      };
      const t0 = Date.now();
      const tint = setInterval(() => {
        contStatus.textContent = '已用 ' + Math.round((Date.now() - t0) / 1000) + 's';
      }, 500);
      let tries = 1;
      // 累计已生成的续写内容（取消/失败时供用户选择处理方式）
      let merged = '';
      let finished = false; // 正常完成标志：仅此路径收拢并滚动

      // 收拢续写工作区（幂等）
      const closeCont = () => {
        clearInterval(tint);
        state.generating = false;
        contArea.classList.add('hidden');
        contOut.textContent = '';
        contFoot.classList.add('hidden');
        cancelBtn.classList.remove('hidden');
        cancelBtn.textContent = '✕ 取消';
        cancelBtn.disabled = false;
        contTitle.textContent = '➕ 正在续写…';
      };

      // 取消/失败：不再自动合并，交由用户选择处理方式
      const showPartialOptions = (title) => {
        clearInterval(tint);
        state.generating = false;
        cancelBtn.classList.add('hidden');
        contTitle.textContent = title;
        contFoot.classList.remove('hidden');
        const partial = merged.trim();
        const partialText = existing ? existing + '\n\n' + partial : partial;
        contFoot.querySelector('.cont-merge').onclick = () => {
          c.text = partialText;
          c.wordCount = MQ.countChars(c.text);
          pt.textContent = c.text;
          MQ.Store.upsertNovel(n);
          updateWriterStat();
          renderSidebar(n);
          toast('已并入续写部分（' + MQ.countChars(partialText) + ' 字）✍️', 'ok');
          closeCont();
        };
        contFoot.querySelector('.cont-draft').onclick = () => {
          MQ.Store.saveDraft(n.id, state.currentChapter, partialText, c.title);
          toast('已保留为草稿（' + MQ.countChars(partialText) + ' 字），正文未改变 📝');
          closeCont();
        };
        contFoot.querySelector('.cont-drop').onclick = () => {
          toast('已丢弃，正文未改变');
          closeCont();
        };
      };

      try {
        // 续写视角：从设置读取，传给引擎/AI
        const perspective = MQ.Store.getSettings().perspective || '';
        const perspectiveHint = perspective ? '【视角要求：' + perspective + '，请严格使用对应人称叙述】' : '';

        if (MQ.AI.activeEngine() === 'ai') {
          ac = new AbortController();
          await MQ.AI.continueChapterAI(n, state.currentChapter, existing, (delta) => {
            merged += delta;
            appendDelta(delta);
          }, (a) => {
            tries = a;
            if (a > 1) contStatus.textContent = '⚠ 续写中断，正在第 ' + a + ' 次尝试…';
          }, ac.signal, perspectiveHint || undefined);
        } else {
          const chapter = MQ.Engine.continueChapter(n, state.currentChapter, existing, undefined, undefined, undefined, perspective);
          const newPart = chapter.text.slice(existing.length).split('\n\n');
          for (const para of newPart) {
            if (localCancelled) break;
            if (!para.trim()) continue;
            merged = merged ? merged + '\n\n' + para : para;
            appendDelta('\n\n' + para);
            await sleep(40);
          }
        }
        if (localCancelled) {
          // 取消：不自动合并，由用户选择 并入 / 草稿 / 丢弃
          if (merged.trim()) showPartialOptions('已取消续写（已生成 ' + MQ.countChars(merged) + ' 字）——如何处理？');
          else { toast('已取消续写'); closeCont(); }
        } else {
          // 成功：正文已是全文（AI/本地引擎均已写入 c.text）
          finished = true;
          pt.textContent = c.text;
          if (!c.wordCount) c.wordCount = MQ.countChars(c.text);
          pushChapterSnapshot(n, state.currentChapter, c.text, 'cont', MQ.AI.activeEngine() === 'ai'); // 成功结果入历史
          trackChapterPlace(n, state.currentChapter);
          MQ.Store.upsertNovel(n);
          updateWriterStat();
          renderSidebar(n);
          toast(tries > 1 ? `续写完成（第 ${tries} 次尝试成功）✍️` : '续写完成 ✍️', 'ok');
          closeCont();
        }
      } catch (err) {
        const aborted = MQ.AI.isAbort(err);
        if (merged.trim()) {
          showPartialOptions(aborted ? '已取消续写（已生成 ' + MQ.countChars(merged) + ' 字）——如何处理？' : '续写失败：' + err.message + '（已生成 ' + MQ.countChars(merged) + ' 字）——如何处理？');
        } else {
          toast(aborted ? '已取消续写' : '续写失败：' + err.message, aborted ? '' : 'err');
          closeCont();
        }
      } finally {
        if (finished) setTimeout(() => pt.scrollIntoView({ block: 'end' }), 50);
      }
    }

    // 灵感驱动续写：点灵感卡片 → 按卡片主题生成续写片段
    async function inspireContinue(card) {
      if (state.generating) return;
      if (c.rewrite) { c.rewrite = null; state.compareMode = 'orig'; }
      state.generating = true;
      let ac = null;
      let localCancelled = false;
      genArea.classList.add('hidden');
      const existing = pt.innerText.trim();
      pushChapterSnapshot(n, state.currentChapter, existing, 'pre', MQ.AI.activeEngine() === 'ai');
      const contOut = contArea.querySelector('.cont-out');
      const contStatus = contArea.querySelector('.cont-status');
      const cancelBtn = contArea.querySelector('.cont-cancel');
      const contTitle = contArea.querySelector('.cont-title');
      const contFoot = contArea.querySelector('.cont-foot');
      contArea.querySelector('.cont-cards').classList.add('hidden');
      contFoot.classList.add('hidden');
      contOut.classList.remove('hidden');
      contTitle.textContent = '💡 灵感续写 · ' + card.tag;
      contArea.classList.remove('hidden');
      contOut.textContent = '';
      contStatus.textContent = '';
      cancelBtn.textContent = '✕ 取消';
      cancelBtn.disabled = false;
      cancelBtn.onclick = () => {
        if (ac) ac.abort();
        else localCancelled = true;
        cancelBtn.textContent = '取消中…';
        cancelBtn.disabled = true;
      };
      contArea.scrollIntoView({ block: 'nearest' });
      const appendDelta = (text) => {
        contOut.textContent += text;
        contOut.scrollTop = contOut.scrollHeight;
      };
      const t0 = Date.now();
      const tint = setInterval(() => {
        contStatus.textContent = '已用 ' + Math.round((Date.now() - t0) / 1000) + 's';
      }, 500);
      let tries = 1;
      let merged = '';
      let finished = false;

      const closeCont = () => {
        clearInterval(tint);
        state.generating = false;
        contArea.classList.add('hidden');
        contOut.textContent = '';
        contFoot.classList.add('hidden');
        cancelBtn.classList.remove('hidden');
        cancelBtn.textContent = '✕ 取消';
        cancelBtn.disabled = false;
        contTitle.textContent = '💡 灵感续写…';
      };

      const showPartialOptions = (title) => {
        clearInterval(tint);
        state.generating = false;
        cancelBtn.classList.add('hidden');
        contTitle.textContent = title;
        contFoot.classList.remove('hidden');
        const partial = merged.trim();
        const partialText = existing ? existing + '\n\n' + partial : partial;
        contFoot.querySelector('.cont-merge').onclick = () => {
          c.text = partialText; c.wordCount = MQ.countChars(c.text);
          pt.textContent = c.text; MQ.Store.upsertNovel(n);
          updateWriterStat(); renderSidebar(n);
          toast('已并入灵感续写（' + MQ.countChars(partialText) + ' 字）✍️', 'ok');
          closeCont();
        };
        contFoot.querySelector('.cont-draft').onclick = () => {
          MQ.Store.saveDraft(n.id, state.currentChapter, partialText, c.title);
          toast('已保留为草稿（' + MQ.countChars(partialText) + ' 字），正文未改变 📝');
          closeCont();
        };
        contFoot.querySelector('.cont-drop').onclick = () => { toast('已丢弃'); closeCont(); };
      };

      try {
        const mood = card.tag;
        if (MQ.AI.activeEngine() === 'ai') {
          ac = new AbortController();
          const direction = mood + '：' + card.text.slice(0, 80);
          await MQ.AI.continueChapterAI(n, state.currentChapter, existing, (delta) => {
            merged += delta; appendDelta(delta);
          }, (a) => { tries = a; if (a > 1) contStatus.textContent = '⚠ 续写中断，第 ' + a + ' 次尝试…'; }, ac.signal, direction);
        } else {
          const chapter = MQ.Engine.continueChapter(n, state.currentChapter, existing, null, 0, mood);
          const newPart = chapter.text.slice(existing.length).split('\n\n');
          for (const para of newPart) {
            if (localCancelled) break;
            if (!para.trim()) continue;
            merged = merged ? merged + '\n\n' + para : para;
            appendDelta('\n\n' + para);
            await sleep(40);
          }
        }
        if (localCancelled) {
          if (merged.trim()) showPartialOptions('已取消续写（已生成 ' + MQ.countChars(merged) + ' 字）——如何处理？');
          else { toast('已取消续写'); closeCont(); }
        } else {
          finished = true;
          pt.textContent = c.text;
          if (!c.wordCount) c.wordCount = MQ.countChars(c.text);
          pushChapterSnapshot(n, state.currentChapter, c.text, 'cont', MQ.AI.activeEngine() === 'ai');
          trackChapterPlace(n, state.currentChapter);
          MQ.Store.upsertNovel(n);
          updateWriterStat(); renderSidebar(n);
          toast(tries > 1 ? `灵感续写完成（第 ${tries} 次尝试成功）✍️` : '灵感续写完成 ✍️', 'ok');
          closeCont();
        }
      } catch (err) {
        const aborted = MQ.AI.isAbort(err);
        if (merged.trim()) {
          showPartialOptions(aborted ? '已取消（' + MQ.countChars(merged) + ' 字）——如何处理？' : '续写失败：' + err.message + '（' + MQ.countChars(merged) + ' 字）——如何处理？');
        } else {
          toast(aborted ? '已取消' : '续写失败：' + err.message, aborted ? '' : 'err');
          closeCont();
        }
      } finally {
        if (finished) setTimeout(() => pt.scrollIntoView({ block: 'end' }), 50);
      }
    }
    state.inspireContinue = (card) => inspireContinue(card);

    // 多版本续写：一次生成 3 个不同走向的候选，选一个并入正文
    async function multiContinue() {
      if (state.generating) return;
      if (c.rewrite) { c.rewrite = null; state.compareMode = 'orig'; }
      state.generating = true;
      let ac = null;
      let aborted = false;
      genArea.classList.add('hidden'); // 三个工作区互斥：展开多版本续写时收起生成本章工作区
      const existing = pt.innerText.trim();
      pushChapterSnapshot(n, state.currentChapter, existing, 'pre', MQ.AI.activeEngine() === 'ai');

      const dirs = ['剑走偏锋 · 冲突升级', '温情收束 · 羁绊加深', '悬念迭起 · 伏笔展开'];
      const aiDirs = ['冲突与危机升级', '人物情感与羁绊加深', '悬念与伏笔展开'];

      // 展开工作区，切到多版本模式
      const contCards = contArea.querySelector('.cont-cards');
      const contOut = contArea.querySelector('.cont-out');
      const contStatus = contArea.querySelector('.cont-status');
      const contTitle = contArea.querySelector('.cont-title');
      const cancelBtn = contArea.querySelector('.cont-cancel');
      contTitle.textContent = '🎲 多版本续写中…';
      contArea.classList.remove('hidden');
      contOut.classList.add('hidden');
      contCards.classList.remove('hidden');
      contCards.innerHTML = '';
      contStatus.textContent = '';
      cancelBtn.textContent = '✕ 取消（放弃本次）';
      cancelBtn.disabled = false;
      cancelBtn.onclick = () => {
        if (ac) ac.abort();
        else aborted = true;
        cancelBtn.textContent = '取消中…';
        cancelBtn.disabled = true;
      };
      contArea.scrollIntoView({ block: 'nearest' });

      // 三张候选卡：{ el, body, adoptBtn, fullText, done }
      const cards = dirs.map((label) => {
        const adoptBtn = MQ.el('button', { class: 'btn btn-primary btn-sm', text: '✓ 采用此版本', disabled: 'disabled' });
        const card = MQ.el('div', { class: 'cont-card' }, [
          MQ.el('div', { class: 'cont-card-head' }, [
            MQ.el('span', { class: 'cont-card-dir', text: label }),
            MQ.el('span', { class: 'cont-card-wc', text: '…' }),
          ]),
          MQ.el('div', { class: 'cont-card-body' }),
          MQ.el('div', { class: 'cont-card-foot' }, [adoptBtn]),
        ]);
        contCards.appendChild(card);
        return {
          el: card,
          body: card.querySelector('.cont-card-body'),
          wcEl: card.querySelector('.cont-card-wc'),
          adoptBtn,
          fullText: null,
          done: false,
        };
      });

      const t0 = Date.now();
      const tint = setInterval(() => {
        contStatus.textContent = '已用 ' + Math.round((Date.now() - t0) / 1000) + 's';
      }, 500);
      let tries = 1;

      const finishCard = (card, fullText) => {
        card.fullText = fullText;
        card.done = true;
        card.wcEl.textContent = MQ.countChars(fullText) + ' 字';
        card.adoptBtn.disabled = false;
        card.adoptBtn.onclick = () => adoptVariant(card); // 闭包绑定自己的卡片
      };

      const adoptVariant = (card) => {
        if (!card.done || !card.fullText) return;
        c.text = card.fullText;
        c.wordCount = MQ.countChars(c.text);
        n.wordCount = n.chapters.reduce((s, x) => s + (x.wordCount || 0), 0);
        pt.textContent = c.text;
        pushChapterSnapshot(n, state.currentChapter, c.text, 'cont', MQ.AI.activeEngine() === 'ai');
        trackChapterPlace(n, state.currentChapter);
        MQ.Store.upsertNovel(n);
        MQ.Store.clearDraft(n.id, state.currentChapter);
        updateWriterStat();
        renderSidebar(n);
        state.generating = false; // 提前解锁，收尾不再重复处理
        clearInterval(tint);
        contArea.classList.add('hidden');
        contCards.classList.add('hidden');
        contTitle.textContent = '➕ 正在续写…';
        const label = dirs[cards.indexOf(card)].split(' · ')[0];
        toast('已采用「' + label + '」版本 ✍️', 'ok');
        setTimeout(() => pt.scrollIntoView({ block: 'end' }), 50);
      };

      try {
        if (MQ.AI.activeEngine() === 'ai') {
          ac = new AbortController();
          // 并行生成 3 个候选，各自流式填充对应卡片
          await Promise.all(cards.map((card, i) =>
            MQ.AI.continueChapterAI(n, state.currentChapter, existing, (delta) => {
              card.body.textContent += delta;
              card.body.scrollTop = card.body.scrollHeight;
            }, (a) => {
              tries = a;
              if (a > 1) contStatus.textContent = '⚠ 生成中断，正在第 ' + a + ' 次尝试…';
            }, ac.signal, aiDirs[i])
              .then(ch => finishCard(card, ch.text))
              .catch(e => {
                if (MQ.AI.isAbort(e)) throw e;
                card.body.textContent = '✕ 生成失败：' + e.message;
                card.body.style.color = '#e88b6f';
                card.wcEl.textContent = '失败';
              })
          ));
        } else {
          // 本地引擎：3 个 seed 变体依次生成并逐段填充
          for (let i = 0; i < 3; i++) {
            if (aborted) break;
            const ch = MQ.Engine.continueChapter(n, state.currentChapter, existing, undefined, i);
            const newPart = ch.text.slice(existing.length).split('\n\n');
            for (const para of newPart) {
              if (aborted) break;
              if (!para.trim()) continue;
              cards[i].body.textContent = cards[i].body.textContent ? cards[i].body.textContent + '\n\n' + para : para;
              cards[i].body.scrollTop = cards[i].body.scrollHeight;
              await sleep(40);
            }
            finishCard(cards[i], ch.text);
          }
        }
        if (!cards.some(c => c.done)) {
          toast('多版本续写失败：所有候选都未生成', 'err');
        }
      } catch (err) {
        if (!MQ.AI.isAbort(err)) toast('多版本续写失败：' + err.message, 'err');
        // AbortError 由 finally 统一处理取消后的 UI
      } finally {
        if (!state.generating) { /* 已通过采用提前解锁 */ } else {
          clearInterval(tint);
          state.generating = false;
        }
        if (aborted) {
          const done = cards.filter(c => c.done);
          if (done.length) {
            // 已有完成候选：保留工作区供选用，取消按钮变为「关闭」
            contStatus.textContent = `已停止生成，${done.length} 个候选已完成——可选用，或点「关闭」放弃全部`;
            cancelBtn.textContent = '✕ 关闭';
            cancelBtn.disabled = false;
            cancelBtn.onclick = () => {
              contArea.classList.add('hidden');
              contCards.classList.add('hidden');
              contTitle.textContent = '➕ 正在续写…';
              toast('已放弃本次多版本续写');
            };
          } else {
            // 无任何候选：直接收拢
            contArea.classList.add('hidden');
            contCards.classList.add('hidden');
            contTitle.textContent = '➕ 正在续写…';
            toast('已放弃多版本续写');
          }
        }
      }
    }

    function clearCurrent() {
      if (c.text && !confirm('清空本章正文？')) return;
      c.text = '';
      c.wordCount = 0;
      c.rewrite = null;
      state.compareMode = 'orig';
      pt.textContent = '';
      updateWriterStat();
      MQ.Store.upsertNovel(n);
      MQ.Store.clearDraft(n.id, state.currentChapter); // 清空后不再提示恢复旧内容
      renderSidebar(n);
      renderOutlineTab(n);
    }
  }

  /* ---- 灵感面板 ---- */
  /* ---- 灵感面板（上下文感知） ---- */
  function renderInspire(n) {
    const body = $('inspire-body');
    // 获取当前章节的 beat 类型
    let beatType = null;
    if (state.currentChapter != null && n.chapters && n.chapters[state.currentChapter]) {
      beatType = n.chapters[state.currentChapter].beat || null;
    }
    // 上下文感知选取 3 张卡片
    const cards = MQ.Engine.contextAwareInspire(n, beatType, 3);
    const els = cards.map((card, i) =>
      MQ.el('div', { class: 'inspire-card' + (i === 0 ? ' hot' : ''), title: '点击以此灵感驱动续写', onclick: () => {
        if (state.inspireContinue) state.inspireContinue(card);
        else toast('请先进入写作台');
      } }, [
        MQ.el('b', { text: '✦ ' + card.tag }),
        MQ.el('div', { text: card.text }),
      ])
    );
    body.innerHTML = '';
    els.forEach(c => body.appendChild(c));
  }

  /* ============================================================
     弹窗
     ============================================================ */
  function openModal(title, body, buttons, wide) {
    closeModal();
    const mask = MQ.el('div', { class: 'modal-mask', id: 'active-modal' });
    const modal = MQ.el('div', { class: 'modal' + (wide ? ' wide' : '') }, [
      MQ.el('div', { class: 'modal-head' }, [
        MQ.el('h3', { text: title }),
        MQ.el('button', { class: 'icon-btn', text: '✕', onclick: () => closeModal() }),
      ]),
      MQ.el('div', { class: 'modal-body' }, Array.isArray(body) ? body : [body]),
      MQ.el('div', { class: 'modal-actions' }, (buttons || []).map(b =>
        MQ.el('button', { class: b.cls || 'btn btn-ghost', text: b.text, onclick: () => b.onclick(mask) })
      )),
    ]);
    mask.appendChild(modal);
    mask.addEventListener('click', e => { if (e.target === mask) closeModal(); });
    $('modal-root').appendChild(mask);
  }

  function closeModal() {
    const m = $('active-modal');
    if (m) m.remove();
  }

  /* ============================================================
     重写本章（换一种文风 + 对比查看）
     ============================================================ */
  function openRewriteModal(n) {
    const c = n.chapters[state.currentChapter];
    const styles = MQ.Prose.listStyles();
    const isAI = MQ.AI.activeEngine() === 'ai';
    let chosen = null;

    const pills = MQ.el('div', { class: 'engine-pills' });
    styles.forEach(s => {
      pills.appendChild(MQ.el('button', {
        class: 'epill' + (s.id === n.styleId ? ' active' : ''),
        text: s.name,
        onclick: (e) => {
          pills.querySelectorAll('.epill').forEach(x => x.classList.remove('active'));
          e.target.classList.add('active');
          chosen = s.id;
        },
      }));
    });

    const body = MQ.el('div', {}, [
      MQ.el('p', { class: 'muted', text: `当前章：第${MQ.cnNum(state.currentChapter + 1)}章「${c.title}」。请选择重写的文风：` }),
      pills,
      MQ.el('div', { class: 'ai-hint', html: isAI
        ? '将使用 <b>AI 引擎</b> 深度重写：保留剧情走向，全面更换文风。' +
          '<br>重写稿先生成到文章下方预览，满意后再进入「原稿 / 重写版」对比模式。'
        : '将使用 <b>本地引擎</b> 重写（未配置 AI 或当前选了本地生成）。' +
          '<br>重写稿先生成到文章下方预览，满意后再进入「原稿 / 重写版」对比模式。' }),
    ]);

    openModal('✎ 重写本章', body, [
      { text: '取消', cls: 'btn-ghost', onclick: (m) => closeModal(m) },
      {
        text: '🚀 开始重写', cls: 'btn-primary', onclick: async (m) => {
          const styleId = chosen || n.styleId;
          closeModal(m);
          await doRewrite(n, styleId);
        },
      },
    ]);
  }

  async function doRewrite(n, styleId) {
    if (state.generating) return;
    state.generating = true;
    const c = n.chapters[state.currentChapter];
    const original = c.text;
    const isAI = MQ.AI.activeEngine() === 'ai';
    const styleName = MQ.Prose.getStyle(styleId).name;

    // 展开下方预览区（复用 gen-area）：重写稿先在此预览，满意再进对比模式
    const genArea = document.querySelector('#tab-writer .gen-area');
    const genOut = genArea.querySelector('.gen-out');
    const genStatus = genArea.querySelector('.gen-status');
    const genTitle = genArea.querySelector('.gen-title');
    const genCancel = genArea.querySelector('.gen-cancel');
    const genFoot = genArea.querySelector('.gen-foot');
    const genAdopt = genFoot.querySelector('.gen-adopt');
    const genDiscard = genFoot.querySelector('.gen-discard');
    const genCompare = genFoot.querySelector('.gen-compare');
    const genRetry = genFoot.querySelector('.gen-retry');
    const genReview = genFoot.querySelector('.gen-review');
    genReview.onclick = () => openReviewReport(n, state.currentChapter, genOut.textContent.trim());
    genArea.querySelector('.gen-cards').classList.add('hidden');
    genOut.classList.remove('hidden');
    genOut.textContent = '';
    genOut.style.color = '';
    genFoot.classList.add('hidden');
    genTitle.textContent = `✎ 正在以「${styleName}」重写本章…`;
    genStatus.textContent = '';
    genArea.classList.remove('hidden');
    genCancel.classList.remove('hidden');
    genCancel.textContent = '✕ 取消';
    genCancel.disabled = false;
    genArea.scrollIntoView({ block: 'nearest' });

    let ac = null;
    genCancel.onclick = () => {
      if (ac) ac.abort();
      genCancel.textContent = '取消中…';
      genCancel.disabled = true;
    };
    const closeGen = () => {
      genArea.classList.add('hidden');
      genFoot.classList.add('hidden');
      genTitle.textContent = '✨ 生成本章预览';
    };

    const phases = ['正在通读本章', '正在转换文风', '正在逐段重写', '正在润色收束'];
    let pi = 0;
    const t0 = Date.now();
    const tint = setInterval(() => {
      genStatus.textContent = (isAI ? phases[pi % phases.length] + ' · ' : '') + '已用 ' + Math.round((Date.now() - t0) / 1000) + 's';
      pi++;
    }, 600);
    try {
      let result;
      if (isAI) {
        ac = new AbortController();
        result = await MQ.AI.rewriteChapterAI(n, state.currentChapter, styleId, ac.signal);
      } else {
        const ch = MQ.Engine.generateChapter(n, state.currentChapter, styleId);
        // ch 与 c 是同一章节对象引用，先捕获重写稿再还原原稿（否则 ch.text 也会被覆盖）
        const rewriteText = ch.text;
        result = { text: rewriteText, styleId, styleName, wordCount: MQ.countChars(rewriteText) };
        // 本地生成会直接覆盖 chapter.text，先还原原稿（未确认前不动正文）
        c.text = original;
        c.wordCount = MQ.countChars(original);
        n.wordCount = n.chapters.reduce((s, x) => s + (x.wordCount || 0), 0);
        // 重写稿逐段展开到预览区
        const paras = rewriteText.split('\n\n');
        for (const para of paras) {
          if (!para.trim()) continue;
          genOut.textContent = genOut.textContent ? genOut.textContent + '\n\n' + para : para;
          genOut.scrollTop = genOut.scrollHeight;
          await sleep(40);
        }
      }
      if (!result.text || MQ.countChars(result.text) < 40) throw new Error('生成内容为空');
      if (isAI) genOut.textContent = result.text; // AI 非流式：完成后一次性显示
      clearInterval(tint);
      state.generating = false;
      genCancel.classList.add('hidden');
      genTitle.textContent = '✎ 重写完成——满意后进入对比模式';
      genStatus.textContent = styleName + ' · ' + result.wordCount + ' 字';
      genCompare.classList.add('hidden');
      genRetry.classList.add('hidden');
      if (MQ.AI.isConfigured()) genReview.classList.remove('hidden');
      else genReview.classList.add('hidden');
      genAdopt.classList.remove('hidden');
      genAdopt.textContent = '✓ 进入对比模式';
      genAdopt.onclick = () => {
        c.rewrite = result;
        state.compareMode = 'rew';
        MQ.Store.upsertNovel(n);
        closeGen();
        renderWriterTab(n);
        toast('重写完成，已进入对比模式（原稿 / 重写版）✨', 'ok');
      };
      genDiscard.classList.remove('hidden');
      genDiscard.textContent = '✕ 放弃';
      genDiscard.onclick = () => { closeGen(); toast('已放弃重写，原稿未改变'); };
      genFoot.classList.remove('hidden');
    } catch (err) {
      clearInterval(tint);
      state.generating = false;
      c.text = original;
      c.wordCount = MQ.countChars(original);
      n.wordCount = n.chapters.reduce((s, x) => s + (x.wordCount || 0), 0);
      MQ.Store.upsertNovel(n);
      if (MQ.AI.isAbort(err)) {
        closeGen();
        toast('已取消重写');
      } else {
        genTitle.textContent = '✕ 重写失败';
        genOut.textContent = '重写失败：' + err.message;
        genOut.style.color = '#e88b6f';
        genCancel.classList.add('hidden');
        genAdopt.classList.add('hidden');
        genCompare.classList.add('hidden');
        genRetry.classList.add('hidden');
        genDiscard.classList.remove('hidden');
        genDiscard.textContent = '✕ 放弃';
        genDiscard.onclick = () => { closeGen(); toast('已放弃重写，原稿未改变'); };
        genFoot.classList.remove('hidden');
      }
    }
  }

  /* ============================================================
     AI 设置弹窗
     ============================================================ */
  function openAiModal() {
    const settings = MQ.Store.getSettings();
    const cfg = settings.ai || {};
    let statusEl = null;

    const providerRow = MQ.el('div', { class: 'provider-pills' });
    MQ.AI.PROVIDERS.forEach(p => {
      providerRow.appendChild(MQ.el('button', {
        class: 'provider-pill' + ((cfg.base || '') === p.base ? ' active' : ''),
        text: p.name,
        onclick: (e) => {
          providerRow.querySelectorAll('.provider-pill').forEach(x => x.classList.remove('active'));
          e.target.classList.add('active');
          $('ai-base').value = p.base;
          if (p.model) $('ai-model').value = p.model;
        },
      }));
    });

    const body = MQ.el('div', {}, [
      providerRow,
      MQ.el('div', { class: 'ai-status no', id: 'ai-status', text: '未检测' }),
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '接口 Base URL' }),
        MQ.el('input', { id: 'ai-base', placeholder: 'https://api.openai.com/v1', value: cfg.base || MQ.AI.DEFAULT_BASE }),
      ]),
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: 'API Key' }),
        MQ.el('input', { id: 'ai-key', type: 'password', placeholder: 'sk-…', value: cfg.key || '' }),
      ]),
      MQ.el('div', { class: 'field-row' }, [
        MQ.el('div', { class: 'field' }, [
          MQ.el('label', { text: '模型' }),
          MQ.el('div', { class: 'model-row' }, [
            MQ.el('input', { id: 'ai-model', placeholder: 'gpt-4o-mini', value: cfg.model || MQ.AI.DEFAULT_MODEL }),
            MQ.el('button', { class: 'btn btn-ghost btn-sm', id: 'ai-model-fetch', text: '↻ 自动读取', onclick: () => fetchModels() }),
          ]),
          MQ.el('div', { class: 'model-list', id: 'ai-model-list' }),
        ]),
        MQ.el('div', { class: 'field' }, [
          MQ.el('label', { text: '温度（0–2）' }),
          MQ.el('input', { id: 'ai-temp', type: 'number', min: '0', max: '2', step: '0.1', value: cfg.temperature != null ? cfg.temperature : 0.8 }),
        ]),
      ]),
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '生成方式' }),
        MQ.el('div', { class: 'provider-pills' }, [
          ['auto', '智能（配置后自动用 AI）'], ['ai', '始终用 AI'], ['local', '始终用本地引擎'],
        ].map(([v, label]) => {
          const pill = MQ.el('button', {
            class: 'provider-pill' + ((cfg.engineMode || 'auto') === v ? ' active' : ''),
            text: label,
            onclick: () => {
              body.querySelectorAll('.provider-pills')[1].querySelectorAll('.provider-pill').forEach(x => x.classList.remove('active'));
              pill.classList.add('active');
              pill.dataset.mode = v;
            },
          });
          pill.dataset.mode = v;
          return pill;
        })),
      ]),
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '失败自动重试' }),
        MQ.el('div', { class: 'provider-pills' }, [
          ['0', '不重试'], ['1', '重试 1 次'], ['2', '重试 2 次'],
        ].map(([v, label]) => {
          const cur = cfg.retries != null ? parseInt(cfg.retries, 10) : 1;
          const pill = MQ.el('button', {
            class: 'provider-pill' + (cur === parseInt(v, 10) ? ' active' : ''),
            text: label,
            onclick: () => {
              body.querySelectorAll('.provider-pills')[2].querySelectorAll('.provider-pill').forEach(x => x.classList.remove('active'));
              pill.classList.add('active');
              pill.dataset.retries = v;
            },
          });
          pill.dataset.retries = v;
          return pill;
        })),
      ]),
      MQ.el('div', { class: 'ai-hint', html: '兼容任何 OpenAI 格式接口。常见服务：<br>· DeepSeek：<code>https://api.deepseek.com/v1</code> · 模型 <code>deepseek-chat</code><br>· 智谱 GLM：<code>https://open.bigmodel.cn/api/paas/v4</code> · 模型 <code>glm-4-flash</code><br>· 通义千问：<code>https://dashscope.aliyuncs.com/compatible-mode/v1</code> · 模型 <code>qwen-plus</code><br>密钥仅保存在本地浏览器，不会上传到任何服务器。<br>「失败自动重试」作用于大纲 / 角色 / 正文 / 续写的 AI 生成（正文与续写重试时保留已生成部分）。' }),
    ]);

    openModal('AI 设置', body, [
      {
        text: '🔌 测试连接', cls: 'btn-ghost', onclick: async (m) => {
          const cfg2 = readAiForm();
          const status = $('ai-status');
          status.className = 'ai-status';
          status.innerHTML = '<span class="spin">◌</span> 正在连接…';
          try {
            await MQ.AI.testConnection(cfg2);
            status.className = 'ai-status ok';
            status.textContent = '✓ 连接成功！可以使用 AI 生成正文了';
          } catch (err) {
            status.className = 'ai-status no';
            status.textContent = '✕ ' + err.message;
          }
        },
      },
      {
        text: '保存', cls: 'btn-primary', onclick: (m) => {
          const cfg2 = readAiForm();
          settings.ai = cfg2;
          MQ.Store.saveSettings(settings);
          closeModal(m);
          if (state.view === 'studio') renderWriterTab(state.currentNovel);
          toast('AI 设置已保存', 'ok');
        },
      },
    ]);

    // 自动读取服务商模型列表：成功渲染为可点击的 pill，点击填入模型输入框
    async function fetchModels() {
      const btn = $('ai-model-fetch');
      const listEl = $('ai-model-list');
      const base = $('ai-base').value.trim();
      const key = $('ai-key').value.trim();
      if (!base || !key) {
        listEl.innerHTML = '<span class="ml-err">请先填写 Base URL 与 API Key，再读取模型</span>';
        return;
      }
      btn.disabled = true;
      btn.textContent = '读取中…';
      listEl.innerHTML = '<span class="ml-loading">…正在拉取模型列表</span>';
      try {
        const ids = await MQ.AI.listModels({ base, key, model: $('ai-model').value.trim() });
        if (!ids.length) {
          listEl.innerHTML = '<span class="ml-err">接口可用，但未返回模型列表，请手动输入模型名。</span>';
          return;
        }
        const cur = $('ai-model').value.trim();
        listEl.innerHTML = '';
        ids.forEach(id => {
          listEl.appendChild(MQ.el('button', {
            class: 'model-pill' + (id === cur ? ' active' : ''),
            text: id,
            onclick: () => {
              $('ai-model').value = id;
              listEl.querySelectorAll('.model-pill').forEach(p => p.classList.toggle('active', p.textContent === id));
            },
          }));
        });
      } catch (err) {
        listEl.innerHTML = '<span class="ml-err">' + MQ.esc(err.message) + '</span>' +
          '<span class="ml-hint">部分平台不提供模型列表接口，可手动输入模型名后点「测试连接」验证。</span>';
      } finally {
        btn.disabled = false;
        btn.textContent = '↻ 自动读取';
      }
    }

    function readAiForm() {
      const modeEl = body.querySelectorAll('.provider-pills')[1].querySelector('.provider-pill.active');
      const retryEl = body.querySelectorAll('.provider-pills')[2].querySelector('.provider-pill.active');
      return {
        base: $('ai-base').value.trim(),
        key: $('ai-key').value.trim(),
        model: $('ai-model').value.trim(),
        temperature: (() => { const v = parseFloat($('ai-temp').value); return Number.isFinite(v) ? v : 0.8; })(),
        engineMode: modeEl ? modeEl.dataset.mode : 'auto',
        retries: retryEl ? parseInt(retryEl.dataset.retries, 10) : 1,
        enabled: true,
      };
    }

    // 初始化状态显示
    const isCfg = MQ.AI.isConfigured(cfg);
    const st = $('ai-status');
    if (isCfg) {
      st.className = 'ai-status ok';
      st.textContent = `✓ 已配置 ${cfg.model}（${cfg.base}）`;
    }
  }

  /* ============================================================
     导出
     ============================================================ */
  function openExportModal(n) {
    const body = MQ.el('div', {}, [
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '导出范围' }),
        MQ.el('select', { id: 'ex-range' }, [
          MQ.el('option', { value: 'all', text: `全部章节（${n.chapters.length} 章）` }),
          MQ.el('option', { value: 'written', text: '已写正文的章节' }),
          MQ.el('option', { value: 'current', text: `仅当前章（第 ${state.currentChapter + 1} 章）` }),
        ]),
      ]),
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '格式' }),
        MQ.el('select', { id: 'ex-format' }, [
          MQ.el('option', { value: 'txt', text: 'TXT 纯文本' }),
          MQ.el('option', { value: 'md', text: 'Markdown' }),
          MQ.el('option', { value: 'epub', text: 'EPUB 电子书' }),
        ]),
      ]),
      MQ.el('div', { class: 'field' }, [
        MQ.el('label', { text: '发布平台预设（章节标题格式）' }),
        MQ.el('select', { id: 'ex-platform' }, [
          MQ.el('option', { value: '', text: '通用 · 第X章 标题' }),
          MQ.el('option', { value: 'qidian', text: '起点 · 第X章 标题' }),
          MQ.el('option', { value: 'fanqie', text: '番茄 · 第X章：标题' }),
          MQ.el('option', { value: 'jjwxc', text: '晋江 · Chapter X' }),
        ]),
      ]),
    ]);
    openModal('导出小说', body, [
      { text: '取消', cls: 'btn-ghost', onclick: (m) => closeModal(m) },

      {
        text: '📲 一键导入', cls: 'btn-ghost', onclick: (m) => importToStudio(n),
      },
      {
        text: '⬇️ 下载', cls: 'btn-primary', onclick: (m) => {
          const range = $('ex-range').value;
          const format = $('ex-format').value;
          const platform = $('ex-platform').value;
          exportNovel(n, range, format, platform);
          closeModal(m);
          toast('已导出 📥', 'ok');
        },
      },
    ]);
  }

  function exportNovel(n, range, format) {
    if (format === 'epub') { exportEpub(n, range); return; }
    // 平台预设：章节标题格式
    const ptTitle = (i, title) => {
      if (platform === 'fanqie') return `第${MQ.cnNum(i + 1)}章：${title}`;
      if (platform === 'jjwxc') return `Chapter ${i + 1} ${title}`;
      return `第${MQ.cnNum(i + 1)}章 ${title}`; // 通用 / 起点
    };
    const isMd = format === 'md';
    const lines = [];
    lines.push(isMd ? `# 《${n.title}》` : `《${n.title}》`);
    lines.push('');
    lines.push(`${n.genreIcon} ${n.genreName} · 主角：${n.hero.name} · 生成于 ${n.createdAt}`);
    lines.push('');
    lines.push(isMd ? '---' : '========================================');
    lines.push('');
    if (n.world) { lines.push(isMd ? `**世界观**：${n.world}` : `世界观：${n.world}`); lines.push(''); }
    if (n.conflict) { lines.push(isMd ? `**核心冲突**：${n.conflict}` : `核心冲突：${n.conflict}`); lines.push(''); }

    // 目录
    lines.push(isMd ? '## 目录' : '【目录】');
    n.chapters.forEach((c, i) => {
      if (range === 'written' && !c.text) return;
      if (range === 'current' && i !== state.currentChapter) return;
      lines.push(ptTitle(i, c.title));
    });
    lines.push('');

    // 正文
    n.chapters.forEach((c, i) => {
      if (range === 'written' && !c.text) return;
      if (range === 'current' && i !== state.currentChapter) return;
      lines.push('');
      lines.push(isMd ? `## ${ptTitle(i, c.title)}` : ptTitle(i, c.title));
      lines.push('');
      lines.push(c.text || '（本章尚未生成正文）');
    });

    const content = lines.join('\n');
    const ext = isMd ? 'md' : 'txt';
    const blob = new Blob(['\ufeff' + content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${n.title}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---- EPUB 导出（零依赖 ZIP + XHTML） ---- */
  function exportEpub(n, range) {
    const chs = range === 'written' ? n.chapters.filter(c => c.text) : range === 'current' ? [n.chapters[state.currentChapter]] : n.chapters;
    const meta = n;
    const escXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // 构建各文件内容
    const opfId = 'book-id';
    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="${opfId}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${escXml(meta.title)}</dc:title>
<dc:creator>${escXml(meta.hero.name)}</dc:creator>
<dc:language>zh-CN</dc:language>
<meta property="dcterms:modified">${new Date().toISOString()}</meta>
</metadata>
<manifest>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="cover-img" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>
<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
${chs.map((c, i) => `<item id="ch${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine toc="ncx">
<itemref idref="cover" linear="yes"/>
<itemref idref="nav"/>
${chs.map((c, i) => `<itemref idref="ch${i}"/>`).join('\n')}
</spine>
</package>`;

    const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${escXml(meta.title)}"/></head>
<docTitle><text>${escXml(meta.title)}</text></docTitle>
<navMap>
${chs.map((c, i) => `<navPoint id="nav${i}" playOrder="${i+1}"><navLabel><text>${escXml(c.title)}</text></navLabel><content src="chapter${i}.xhtml"/></navPoint>`).join('\n')}
</navMap>
</ncx>`;

    const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body><nav epub:type="toc"><h1>目录</h1><ol>
${chs.map((c, i) => `<li><a href="chapter${i}.xhtml">${escXml(c.title)}</a></li>`).join('\n')}
</ol></nav></body></html>`;

    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

    // 封面 SVG（嵌入书架封面）
    const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a1e28"/><stop offset="100%" stop-color="#0f0f17"/></linearGradient></defs>
<rect width="600" height="800" fill="url(#bg)"/>
<text x="300" y="280" text-anchor="middle" fill="#d4a643" font-size="72" font-family="serif">${escXml(meta.title)}</text>
<line x1="150" y1="310" x2="450" y2="310" stroke="#d4a643" stroke-width="1" opacity=".5"/>
<text x="300" y="370" text-anchor="middle" fill="#8a8a8a" font-size="22">${escXml(meta.genreName)} · ${escXml((MQ.Prose.getStyle(meta.styleId)||{}).name||'')}</text>
<text x="300" y="430" text-anchor="middle" fill="#555" font-size="18">作者：${escXml(meta.hero.name)}</text>
<text x="300" y="500" text-anchor="middle" fill="#d4a643" font-size="48" font-family="serif">${escXml(meta.hero.name)}</text>
<text x="300" y="560" text-anchor="middle" fill="#666" font-size="16">${escXml((meta.hero.identity||'').slice(0,20))}</text>
<text x="300" y="720" text-anchor="middle" fill="#444" font-size="14">由墨泉 AI 小说生成器创作</text>
</svg>`;
    const coverXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>封面</title></head>
<body style="margin:0;text-align:center">
<div><img src="cover.svg" alt="封面" style="width:100%;max-width:600px"/></div>
</body></html>`;

    // 章节 XHTML
    const chapterDocs = chs.map((c, i) => {
      const bodyText = (c.text || '').split('\n\n').map(p => `<p>${escXml(p.trim())}</p>`).join('\n');
      return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escXml(c.title)}</title></head>
<body><h2>${escXml(c.title)}</h2>
${bodyText || '<p>（本章暂无正文）</p>'}</body></html>`;
    });

    // 文件清单
    const files = [
      { name: 'mimetype', data: 'application/epub+zip', uncomp: true },
      { name: 'META-INF/container.xml', data: containerXml },
      { name: 'OEBPS/content.opf', data: opf },
      { name: 'OEBPS/toc.ncx', data: ncx },
      { name: 'OEBPS/nav.xhtml', data: navXhtml },
      { name: 'OEBPS/cover.svg', data: coverSvg },
      { name: 'OEBPS/cover.xhtml', data: coverXhtml },
    ];
    chs.forEach((c, i) => files.push({ name: `OEBPS/chapter${i}.xhtml`, data: chapterDocs[i] }));

    // 简易 ZIP builder
    const encoder = new TextEncoder();
    const parts = [];
    const cd = [];
    let offset = 0;

    files.forEach(f => {
      const raw = encoder.encode(f.data);
      const name = encoder.encode(f.name);
      const crc = 0; // 简化：CRC32 填 0（大多数阅读器兼容）
      const method = f.uncomp ? 0 : 0; // 全部 store
      const modTime = 0x4B3C; // 默认时间

      // Local header
      const lh = new Uint8Array(30 + name.length);
      const dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true); // version
      dv.setUint16(6, 0, true); // flags
      dv.setUint16(8, method, true);
      dv.setUint16(10, modTime, true);
      dv.setUint16(12, modTime, true); // mod date
      dv.setUint32(14, crc, true);
      dv.setUint32(18, raw.length, true); // compressed size
      dv.setUint32(22, raw.length, true); // uncompressed size
      dv.setUint16(26, name.length, true);
      dv.setUint16(28, 0, true); // extra field
      lh.set(name, 30);
      parts.push(lh);
      parts.push(raw);

      // Central directory entry
      const ce = new Uint8Array(46 + name.length);
      const cdv = new DataView(ce.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0, true);
      cdv.setUint16(10, method, true);
      cdv.setUint16(12, modTime, true);
      cdv.setUint16(14, modTime, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, raw.length, true);
      cdv.setUint32(24, raw.length, true);
      cdv.setUint16(28, name.length, true);
      cdv.setUint16(30, 0, true);
      cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true);
      cdv.setUint32(36, 0, true);
      cdv.setUint32(40, 0, true);
      cdv.setUint32(42, offset, true);
      ce.set(name, 46);
      cd.push(ce);

      offset += lh.length + raw.length;
    });

    const cdBlob = (() => { let len = 0; cd.forEach(c => len += c.length); const b = new Uint8Array(len); let p = 0; cd.forEach(c => { b.set(c, p); p += c.length; }); return b; })();

    // End of central directory
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdBlob.length, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    // 合并所有部分
    let totalLen = 0; parts.forEach(p => totalLen += p.length); totalLen += cdBlob.length + eocd.length;
    const zip = new Uint8Array(totalLen);
    let zp = 0;
    parts.forEach(p => { zip.set(p, zp); zp += p.length; });
    zip.set(cdBlob, zp); zp += cdBlob.length;
    zip.set(eocd, zp);

    const blob = new Blob([zip], { type: 'application/epub+zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `《${n.title}》.epub`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('EPUB 已导出 📖', 'ok');
  }

  /* ---- 整本书 JSON 备份：导出 / 导入 ---- */
  function exportBookJSON(n) {
    const payload = {
      app: '墨泉',
      type: 'novel-backup',
      version: 1,
      exportedAt: MQ.now(),
      meta: {
        title: n.title,
        genre: n.genreName,
        chapterCount: n.chapters ? n.chapters.length : 0,
        written: n.chapters ? n.chapters.filter(c => c.text).length : 0,
        wordCount: MQ.countChars((n.chapters || []).map(c => c.text).join('')),
      },
      novel: n, // 完整小说对象：大纲、角色卡、全部章节正文与元数据
    };
    const blob = new Blob(['\ufeff' + JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `《${n.title}》备份.mq.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('已导出整本备份 📦', 'ok');
  }

  // 校验并归一化导入的备份：兼容「包装格式」与「裸小说对象」两种结构，导入总是新 id（绝不覆盖原书）
  function normalizeImportedBook(obj) {
    const src = (obj && obj.novel && typeof obj.novel === 'object') ? obj.novel : obj;
    if (!src || typeof src !== 'object' || !src.title || !Array.isArray(src.chapters)) {
      throw new Error('不是有效的墨泉备份文件（缺少书名或章节列表）');
    }
    const novel = Object.assign({}, src);
    novel.id = MQ.uid('novel');
    if (typeof novel.updatedAt !== 'string') novel.updatedAt = MQ.now();
    novel.chapters = (novel.chapters || []).map(c => (c && typeof c === 'object') ? c : {});
    novel.chapters.forEach(c => {
      if (typeof c.title !== 'string') c.title = '';
      if (typeof c.summary !== 'string') c.summary = '';
      if (typeof c.text !== 'string') c.text = '';
      if (typeof c.wordCount !== 'number') c.wordCount = MQ.countChars(c.text || '');
    });
    if (!Array.isArray(novel.characters)) novel.characters = [];
    if (!Array.isArray(novel.places)) novel.places = [];
    if (!Array.isArray(novel.relations)) novel.relations = [];
    if (!novel.graphPos || typeof novel.graphPos !== 'object') novel.graphPos = {};
    if (!novel.hero || typeof novel.hero !== 'object') novel.hero = { name: novel.protagonist || '主角' };
    novel.wordCount = novel.chapters.reduce((s, c) => s + (c.wordCount || 0), 0);
    return novel;
  }

  function importBookJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = () => toast('读取文件失败，请重试', 'err');
      reader.onload = () => {
        try {
          const novel = normalizeImportedBook(JSON.parse(reader.result));
          MQ.Store.upsertNovel(novel);
          renderShelf();
          toast(`已导入《${novel.title}》📥`, 'ok');
        } catch (e) {
          toast('导入失败：' + e.message, 'err');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  /* ============================================================
     全局替换：全书人名 / 称呼一键替换，同步大纲与角色卡
     ============================================================ */
  // 统计全书出现次数（正文 / 大纲与设定 / 角色卡），oldName 为空时返回全 0
  function countGlobalReplace(n, oldName) {
    const out = { body: 0, outline: 0, chars: 0, total: 0 };
    if (!oldName) return out;
    const cnt = (s) => (typeof s === 'string') ? s.split(oldName).length - 1 : 0;
    const cntDeep = (v) => {
      if (typeof v === 'string') return v.split(oldName).length - 1;
      if (Array.isArray(v)) return v.reduce((s, x) => s + cntDeep(x), 0);
      if (v && typeof v === 'object') return Object.values(v).reduce((s, x) => s + cntDeep(x), 0);
      return 0;
    };
    const CARD_SKIP = new Set(['id', 'side']);
    (n.chapters || []).forEach(c => {
      out.outline += cnt(c.title) + cnt(c.summary);
      out.body += cnt(c.text) + cnt((c.rewrite || {}).text);
    });
    const cards = [n.hero].concat((n.characters || []).filter(c => c !== n.hero)).filter(Boolean);
    cards.forEach(ch => {
      Object.keys(ch).forEach(k => { if (!CARD_SKIP.has(k)) out.chars += cntDeep(ch[k]); });
    });
    ['protagonist', 'identity', 'conflict', 'world'].forEach(k => { out.outline += cnt(n[k]); });
    out.total = out.body + out.outline + out.chars;
    return out;
  }

  // 执行替换并持久化，返回各分类计数
  function doGlobalReplace(n, oldName, newName) {
    const rep = (s) => (typeof s === 'string') ? s.split(oldName).join(newName) : s;
    const cnt = (s) => (typeof s === 'string') ? s.split(oldName).length - 1 : 0;
    const repDeep = (v) => {
      if (typeof v === 'string') return v.split(oldName).join(newName);
      if (Array.isArray(v)) return v.map(repDeep);
      if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) o[k] = repDeep(v[k]);
        return o;
      }
      return v;
    };
    const cntDeep = (v) => {
      if (typeof v === 'string') return v.split(oldName).length - 1;
      if (Array.isArray(v)) return v.reduce((s, x) => s + cntDeep(x), 0);
      if (v && typeof v === 'object') return Object.values(v).reduce((s, x) => s + cntDeep(x), 0);
      return 0;
    };
    const CARD_SKIP = new Set(['id', 'side']);

    const res = { body: 0, outline: 0, chars: 0 };

    // 章节：标题 / 摘要 / 正文 / 重写版
    (n.chapters || []).forEach(c => {
      if (c.title) { res.outline += cnt(c.title); c.title = rep(c.title); }
      if (c.summary) { res.outline += cnt(c.summary); c.summary = rep(c.summary); }
      if (c.text) { res.body += cnt(c.text); c.text = rep(c.text); c.wordCount = MQ.countChars(c.text); }
      if (c.rewrite && c.rewrite.text) {
        res.body += cnt(c.rewrite.text);
        c.rewrite.text = rep(c.rewrite.text);
        c.rewrite.wordCount = MQ.countChars(c.rewrite.text);
      }
    });

    // 角色卡：主角 + 其他角色（hero 与 characters 同引用只处理一次）
    const cards = [n.hero].concat((n.characters || []).filter(c => c !== n.hero)).filter(Boolean);
    cards.forEach(ch => {
      Object.keys(ch).forEach(k => {
        if (CARD_SKIP.has(k)) return;
        res.chars += cntDeep(ch[k]);
        ch[k] = repDeep(ch[k]);
      });
    });

    // 小说级设定字段（主角名 / 身份 / 冲突 / 世界观）
    ['protagonist', 'identity', 'conflict', 'world'].forEach(k => {
      if (typeof n[k] === 'string') { res.outline += cnt(n[k]); n[k] = rep(n[k]); }
    });

    n.wordCount = n.chapters.reduce((s, c) => s + (c.wordCount || 0), 0);
    n.updatedAt = MQ.now();
    MQ.Store.upsertNovel(n);
    return res;
  }

  function openGlobalReplaceModal(n) {
    const oldInput = MQ.el('input', { id: 'gr-old', type: 'text', placeholder: '例：林动', maxlength: '20' });
    const newInput = MQ.el('input', { id: 'gr-new', type: 'text', placeholder: '例：李无尘', maxlength: '20' });
    const stat = MQ.el('div', { class: 'gr-stat' });
    const warn = MQ.el('div', { class: 'gr-warn' });

    const refresh = () => {
      const oldName = oldInput.value.trim();
      const newName = newInput.value.trim();
      warn.textContent = '';
      if (!oldName) { stat.textContent = '输入旧称呼后，这里会显示全书替换统计'; stat.className = 'gr-stat'; return; }
      const c = countGlobalReplace(n, oldName);
      if (c.total === 0) {
        stat.textContent = '全书未找到「' + oldName + '」，请检查输入是否与书中一致';
        stat.className = 'gr-stat warn';
        return;
      }
      stat.innerHTML = `全书共 <b>${c.total}</b> 处：正文 ${c.body} · 大纲与设定 ${c.outline} · 角色卡 ${c.chars}`;
      stat.className = 'gr-stat';
      if (newName && newName !== oldName && countGlobalReplace(n, newName).total > 0) {
        warn.textContent = '⚠ 新称呼「' + newName + '」已存在于书中，替换后可能造成混淆';
      }
    };
    oldInput.addEventListener('input', refresh);
    newInput.addEventListener('input', refresh);

    const body = MQ.el('div', {}, [
      MQ.el('p', { class: 'muted', text: '将书中所有「旧称呼」替换为「新称呼」，并同步更新章节正文、大纲摘要与角色卡。' }),
      MQ.el('div', { class: 'field' }, [MQ.el('label', { text: '旧称呼 / 人名' }), oldInput]),
      MQ.el('div', { class: 'field' }, [MQ.el('label', { text: '新称呼 / 人名' }), newInput]),
      stat,
      warn,
    ]);

    openModal('✏️ 全局替换', body, [
      { text: '取消', cls: 'btn-ghost', onclick: (m) => closeModal(m) },
      {
        text: '🔁 一键替换', cls: 'btn-primary', onclick: (m) => {
          const oldName = oldInput.value.trim();
          const newName = newInput.value.trim();
          if (!oldName) { toast('请先输入旧称呼', 'err'); return; }
          if (!newName) { toast('请先输入新称呼', 'err'); return; }
          if (oldName === newName) { toast('新旧称呼相同，无需替换', 'err'); return; }
          const res = doGlobalReplace(n, oldName, newName);
          closeModal(m);
          renderWriterTab(n);
          renderOutlineTab(n);
          renderCharactersTab(n);
          renderSidebar(n);
          toast(`已替换「${oldName}」→「${newName}」：正文 ${res.body} 处 · 大纲 ${res.outline} 处 · 角色卡 ${res.chars} 处 ✍️`, 'ok');
        },
      },
    ]);
    refresh();
  }

  /* ============================================================
     生成历史（本章快照：对比 + 回滚）
     ============================================================ */
  function openHistoryModal(n) {
    if (state.compareMode === 'rew') { toast('重写预览中，请先采用或放弃再查看历史', 'err'); return; }
    const c = n.chapters[state.currentChapter];
    const idx = state.currentChapter;
    const list = (n.history && n.history[idx]) || [];

    // 快照列表视图
    const rows = MQ.el('div', { class: 'gh-list' });
    if (!list.length) {
      rows.appendChild(MQ.el('div', { class: 'gh-empty', html: '本章还没有生成记录。<br>每次<b>生成本章 / 续写</b>成功都会自动保存一份快照（最多保留最近 5 份），生成前的手写内容也会被保留。' }));
    } else {
      list.slice().reverse().forEach((s, i) => {
        const row = MQ.el('div', { class: 'gh-row' }, [
          MQ.el('span', { class: 'gh-pill ' + s.via, text: snapshotLabel(s) }),
          MQ.el('span', { class: 'gh-time', text: fmtAgo(s.ts) + ' · ' + s.wc + ' 字' }),
          MQ.el('span', { class: 'gh-actions' }, [
            MQ.el('button', {
              class: 'btn btn-ghost btn-sm', text: '👁 对比',
              onclick: () => renderCompare(s, list.length - i),
            }),
            MQ.el('button', {
              class: 'btn btn-ghost btn-sm', text: '↩ 回滚',
              onclick: () => doRollback(s),
            }),
          ]),
        ]);
        rows.appendChild(row);
      });
    }

    // 对比视图：当前版本 vs 快照版本
    function renderCompare(s, num) {
      const cur = c.text || '';
      const pane = (title, text, side) => MQ.el('div', { class: 'compare-pane' }, [
        MQ.el('div', { class: 'compare-head ' + side }, [
          MQ.el('b', { text: title }),
          MQ.el('span', { text: MQ.countChars(text) + ' 字' }),
        ]),
        MQ.el('div', { class: 'compare-body', text }),
      ]);
      const body = MQ.el('div', {}, [
        MQ.el('div', { class: 'compare-grid' }, [
          pane('当前版本', cur, 'cur'),
          pane(`快照 ${num} · ${snapshotLabel(s)} · ${fmtAgo(s.ts)}`, s.text, 'snap'),
        ]),
      ]);
      openModal(`👁 对比 · 第${MQ.cnNum(idx + 1)}章「${c.title}」`, body, [
        { text: '← 返回列表', cls: 'btn-ghost', onclick: (m) => { closeModal(m); openHistoryModal(n); } },
        { text: '↩ 回滚到此版本', cls: 'btn-primary', onclick: (m) => { closeModal(m); doRollback(s); } },
      ], true);
    }

    // 回滚：恢复快照文本（弹窗关闭后重绘写作台）
    function doRollback(s) {
      if (s.text.trim() === (c.text || '').trim()) { toast('当前已是该版本内容'); return; }
      c.text = s.text;
      c.wordCount = MQ.countChars(c.text);
      n.wordCount = n.chapters.reduce((sum, x) => sum + (x.wordCount || 0), 0);
      MQ.Store.upsertNovel(n);
      MQ.Store.clearDraft(n.id, idx); // 回滚后清草稿，避免恢复条误弹旧内容
      closeModal();
      renderWriterTab(n);
      renderSidebar(n);
      renderOutlineTab(n);
      toast('已回滚到「' + snapshotLabel(s) + '」版本（' + s.wc + ' 字） ↩️', 'ok');
    }

    openModal(`🕘 生成历史 · 第${MQ.cnNum(idx + 1)}章「${c.title}」`, rows, [
      { text: '关闭', cls: 'btn-ghost', onclick: (m) => closeModal(m) },
    ]);
  }

  /* ============================================================
     全文查找（跨章节搜索 + 分组结果 + 跳转高亮）
     ============================================================ */
  // 正则转义（snippet 高亮用）
  const RE_ESC = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function openFindModal(n) {
    const input = MQ.el('input', { type: 'text', class: 'ft-input', placeholder: '输入人名 / 关键词，如「李长安」…', autofocus: 'autofocus' });
    const scopeWrap = MQ.el('div', { class: 'engine-pills ft-scope' });
    const scopes = [['text', '📖 正文'], ['outline', '📋 大纲'], ['char', '🎭 角色卡']];
    let scope = 'text';
    scopes.forEach(([id, label]) => {
      scopeWrap.appendChild(MQ.el('button', {
        class: 'epill' + (id === scope ? ' active' : ''),
        text: label,
        onclick: (e) => {
          scope = id;
          scopeWrap.querySelectorAll('.epill').forEach(x => x.classList.remove('active'));
          e.target.classList.add('active');
          run();
        },
      }));
    });

    const summary = MQ.el('div', { class: 'ft-summary' });
    const list = MQ.el('div', { class: 'ft-list' });
    const body = MQ.el('div', {}, [input, scopeWrap, summary, list]);
    openModal('🔍 全文查找', body, [{ text: '关闭', cls: 'btn-ghost', onclick: (m) => closeModal(m) }], true);
    input.focus();

    // 生成带高亮的上下文片段
    function snippet(text, idx, len) {
      const start = Math.max(0, idx - 24);
      const end = Math.min(text.length, idx + len + 24);
      const pre = start > 0 ? '…' : '';
      const post = end < text.length ? '…' : '';
      let seg = MQ.esc(text.slice(start, end));
      try { seg = seg.replace(new RegExp(RE_ESC(input.value.trim()), 'gi'), m => '<mark class="mq-hl">' + m + '</mark>'); } catch (e) { /* 非法正则兜底 */ }
      return pre + seg + post;
    }

    // 统计某文本中的命中数（不重叠）
    function countHits(text, q) {
      if (!text || !q) return 0;
      const lower = text.toLowerCase();
      let c = 0, from = 0;
      while ((from = lower.indexOf(q, from)) !== -1) { c++; from += q.length; }
      return c;
    }

    // 某范围内第 occ 次命中的起始位置（0 基）
    function nthHit(text, q, occ) {
      const lower = text.toLowerCase();
      let from = 0;
      for (let i = 0; i <= occ; i++) {
        from = lower.indexOf(q, from);
        if (from === -1) return -1;
        if (i < occ) from += q.length;
      }
      return from;
    }

    let firstJump = null; // 记录第一条结果，Enter 直达

    function run() {
      const q = input.value.trim().toLowerCase();
      firstJump = null;
      list.innerHTML = '';
      if (!q) { summary.textContent = '输入关键词开始搜索'; summary.className = 'ft-summary'; return; }
      let total = 0, groups = 0;

      if (scope === 'text') {
        n.chapters.forEach((c, ci) => {
          const hits = countHits(c.text, q);
          if (!hits) return;
          groups++;
          total += hits;
          const group = MQ.el('div', { class: 'ft-group' }, [
            MQ.el('div', { class: 'ft-group-head' }, [
              MQ.el('b', { text: `第${MQ.cnNum(ci + 1)}章 ${c.title}` }),
              MQ.el('span', { text: `${hits} 处` }),
            ]),
          ]);
          const shown = Math.min(hits, 10);
          for (let occ = 0; occ < shown; occ++) {
            const idx = nthHit(c.text, q, occ);
            if (idx === -1) break;
            if (!firstJump) firstJump = { ci, occ, q: input.value.trim() };
            group.appendChild(MQ.el('div', { class: 'ft-item' }, [
              MQ.el('div', { class: 'ft-snip', html: snippet(c.text, idx, q.length) }),
              MQ.el('button', { class: 'btn btn-ghost btn-sm', text: '↩ 跳转', onclick: () => jumpToMatch(n, ci, input.value.trim(), occ) }),
            ]));
          }
          if (hits > shown) group.appendChild(MQ.el('div', { class: 'ft-more', text: `… 本章还有 ${hits - shown} 处` }));
          list.appendChild(group);
        });
      } else if (scope === 'outline') {
        n.chapters.forEach((c, ci) => {
          const hits = countHits(c.title + '\n' + c.summary, q);
          if (!hits) return;
          groups++;
          total += hits;
          const group = MQ.el('div', { class: 'ft-group' }, [
            MQ.el('div', { class: 'ft-group-head' }, [
              MQ.el('b', { text: `第${MQ.cnNum(ci + 1)}章 ${c.title}` }),
              MQ.el('span', { text: `${hits} 处` }),
            ]),
            MQ.el('div', { class: 'ft-item ft-item-outline' }, [
              MQ.el('div', { class: 'ft-snip', html: snippet(c.title + '　' + c.summary, nthHit(c.title + '\n' + c.summary, q, 0), q.length) }),
              MQ.el('button', { class: 'btn btn-ghost btn-sm', text: '↩ 查看大纲', onclick: () => { closeModal(); showView('studio'); showTab('outline'); toast(`已定位到 第${MQ.cnNum(ci + 1)}章「${c.title}」`); } }),
            ]),
          ]);
          if (!firstJump) firstJump = { ci, occ: 0, q: input.value.trim() };
          list.appendChild(group);
        });
      } else {
        // hero 与 characters[0] 可能是同一主角，按姓名去重避免重复分组
        const seen = new Set();
        const allChars = [n.hero].concat(n.characters || []).filter(ch => {
          const k = (ch && ch.name) || '角色';
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        allChars.forEach((ch, ci) => {
          const fields = ['name', 'identity', 'personaOuter', 'personaInner', 'dialogueStyle', 'appearance', 'backstory', 'goal', 'flaw', 'arc', 'role'];
          const joined = fields.map(f => ch[f]).filter(Boolean).join('　');
          const hits = countHits(joined, q);
          if (!hits) return;
          groups++;
          total += hits;
          const group = MQ.el('div', { class: 'ft-group' }, [
            MQ.el('div', { class: 'ft-group-head' }, [
              MQ.el('b', { text: `🎭 ${ch.name || '角色'}` }),
              MQ.el('span', { text: `${hits} 处` }),
            ]),
            MQ.el('div', { class: 'ft-item ft-item-outline' }, [
              MQ.el('div', { class: 'ft-snip', html: snippet(joined, nthHit(joined, q, 0), q.length) }),
              MQ.el('button', { class: 'btn btn-ghost btn-sm', text: '↩ 查看角色', onclick: () => { closeModal(); showView('studio'); showTab('characters'); toast('已定位到角色卡'); } }),
            ]),
          ]);
          if (!firstJump) firstJump = { ci, occ: 0, q: input.value.trim() };
          list.appendChild(group);
        });
      }

      if (!total) {
        summary.textContent = '未找到「' + input.value.trim() + '」';
        summary.className = 'ft-summary none';
        return;
      }
      summary.innerHTML = `全书共 <b>${total}</b> 处 · 覆盖 <b>${groups}</b> 个${scope === 'char' ? '角色' : '章节'}（Enter 直达第一条）`;
      summary.className = 'ft-summary';
    }

    input.addEventListener('input', MQ.debounce(run, 300));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && firstJump) {
        e.preventDefault();
        if (scope === 'text') jumpToMatch(n, firstJump.ci, firstJump.q, firstJump.occ);
        else closeModal();
      }
    });
  }

  // 跳转到某章并在编辑器中高亮第 occ 个匹配
  function jumpToMatch(n, ci, term, occ) {
    closeModal();
    if (state.view !== 'studio') showView('studio');
    selectChapter(ci); // 内部会 renderSidebar + renderWriterTab + showTab('writer')
    // 用 setTimeout 而非 requestAnimationFrame：后台标签页 rAF 可能被冻结（如预览环境），setTimeout 更可靠
    setTimeout(() => {
      const pt = document.querySelector('#tab-writer .paper-text');
      if (!pt) return;
      const ok = highlightOccurrence(pt, term, occ);
      toast(ok ? `已定位到 第${MQ.cnNum(ci + 1)}章「${n.chapters[ci].title}」的「${term}」` : '该章未找到匹配（可能内容已变化）');
    }, 60);
  }

  // 在编辑器中定位第 occ 个匹配并包裹 <mark> 高亮（区分大小写不敏感；对 innerText 无影响）
  function highlightOccurrence(pt, term, occ) {
    pt.querySelectorAll('mark.mq-hl').forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
    const q = term.toLowerCase();
    if (!q) return false;
    const nodes = [];
    (function walk(node) {
      if (node.nodeType === 3) nodes.push(node);
      else node.childNodes.forEach(walk);
    })(pt);
    let offset = 0, target = null;
    for (const node of nodes) {
      const t = node.nodeValue;
      const lower = t.toLowerCase();
      let from = 0;
      while (true) {
        const idx = lower.indexOf(q, from);
        if (idx === -1) break;
        if (occ === 0) { target = { node, idx }; break; }
        occ--;
        from = idx + q.length;
      }
      if (target) break;
      offset += t.length;
    }
    if (!target) return false;
    const parent = target.node.parentNode;
    const before = target.node.splitText(target.idx);
    const rest = before.splitText(q.length);
    const mark = document.createElement('mark');
    mark.className = 'mq-hl';
    parent.insertBefore(mark, before);
    mark.appendChild(before);
    // 不用 behavior:'smooth'：后台/隐藏标签页会跳过平滑滚动导致定位失效，auto 立即到位最可靠
    mark.scrollIntoView({ block: 'center' });
    return true;
  }

  /* ============================================================
     句子级 diff（全文对比用）：切句 + LCS + 回溯标记 新增/删除/相同
     ============================================================ */
  function sentenceDiff(oldText, newText) {
    const split = (t) => String(t || '').split(/(?=[。！？!?\n])/).map(s => s.trim()).filter(Boolean);
    const A = split(oldText);
    const B = split(newText);
    const n = A.length, m = B.length;
    // LCS DP
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    // 回溯
    const oldParts = [], newParts = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { oldParts.push({ t: A[i], d: 'same' }); newParts.push({ t: B[j], d: 'same' }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { oldParts.push({ t: A[i], d: 'del' }); i++; }
      else { newParts.push({ t: B[j], d: 'add' }); j++; }
    }
    while (i < n) { oldParts.push({ t: A[i], d: 'del' }); i++; }
    while (j < m) { newParts.push({ t: B[j], d: 'add' }); j++; }
    const stat = { add: newParts.filter(p => p.d === 'add').length, del: oldParts.filter(p => p.d === 'del').length, same: oldParts.filter(p => p.d === 'same').length };
    return { oldParts, newParts, stat };
  }

  /* ---- 一键导入到视频软件（桌面内嵌模式） ---- */
  function importToStudio(n) {
    if (!window.mochuanBridgeReady || !window.pyBridge) {
      toast('一键导入仅在桌面软件内嵌页可用，请改用「⬇️ 下载」导出后到软件里导入', 'warn');
      return;
    }
    const styleName = (n.styleId && MQ.Prose.getStyle) ? (MQ.Prose.getStyle(n.styleId).name || '') : '';
    const outline = [
      n.world ? '世界观：' + n.world : '',
      n.conflict ? '核心冲突：' + n.conflict : '',
    ].filter(Boolean).join('\n');
    const payload = {
      title: n.title,
      genre: n.genreName || '',
      style: styleName,
      outline: outline,
      chapters: (n.chapters || []).map(function (c) {
        return { title: c.title || '', text: c.text || '' };
      }),
    };
    try {
      window.pyBridge.importNovel(JSON.stringify(payload));
      toast('已一键导入到视频软件 📥', 'ok');
      closeModal();
    } catch (e) {
      toast('导入失败：' + (e && e.message ? e.message : e), 'err');
    }
  }

  /* ---------- AI 审稿报告弹窗 ---------- */
  async function openReviewReport(n, ci, text) {
    if (!MQ.AI.isConfigured()) { toast('请先在 AI 设置中配置接口', 'warn'); return; }
    if (!text || !text.trim()) { toast('暂无内容可供审稿', 'warn'); return; }

    const overlay = MQ.el('div', { class: 'modal-mask', id: 'active-modal' });
    const modal = MQ.el('div', { class: 'modal' });
    overlay.appendChild(modal);

    const head = MQ.el('div', { class: 'modal-head' }, [
      MQ.el('b', { text: `🤖 AI 审稿 · 第${MQ.cnNum(ci + 1)}章「${n.chapters[ci].title}」` }),
      MQ.el('button', { class: 'icon-btn modal-close', text: '✕', onclick: closeModal }),
    ]);
    modal.appendChild(head);

    const body = MQ.el('div', { class: 'modal-body review-body' });
    body.innerHTML = '<div class="rv-loading">🤖 AI 正在审稿…<br><span class="muted">正在通读本章、分析节奏与对话</span></div>';
    modal.appendChild(body);

    document.body.appendChild(overlay);

    const t0 = Date.now();
    try {
      const report = await MQ.AI.reviewChapterAI(n, ci);
      const elapsed = Math.round((Date.now() - t0) / 1000);

      const sections = [
        { icon: '🎵', label: '节奏分析', key: 'rhythm', cls: 'rv-rhythm' },
        { icon: '💬', label: '对话点评', key: 'dialogue', cls: 'rv-dialogue' },
        { icon: '🔮', label: '伏笔检测', key: 'foreshadow', cls: 'rv-foreshadow' },
        { icon: '✂️', label: '可删减段落', key: 'trim', cls: 'rv-trim' },
      ];

      body.innerHTML = '';
      sections.forEach(s => {
        const content = (report[s.key] || '').trim();
        if (!content) return;
        body.appendChild(MQ.el('div', { class: 'rv-section ' + s.cls }, [
          MQ.el('div', { class: 'rv-sec-head', text: s.icon + ' ' + s.label }),
          MQ.el('div', { class: 'rv-sec-body', text: content }),
        ]));
      });

      if (report.overall) {
        body.appendChild(MQ.el('div', { class: 'rv-overall' }, [
          MQ.el('div', { class: 'rv-sec-head', text: '📝 总评' }),
          MQ.el('div', { class: 'rv-sec-body', text: report.overall }),
        ]));
      }

      body.appendChild(MQ.el('div', { class: 'rv-ft', text: `审稿完成 · 耗时 ${elapsed}s` }));
    } catch (err) {
      body.innerHTML = '<div class="rv-loading rv-err">' +
        '✕ 审稿失败<br><span class="muted">' + MQ.esc(err.message) + '</span></div>';
    }
  }
  function init() {
    // 读取模块引擎偏好（默认：已配置 AI 则默认走 AI 深度创作）
    const s0 = MQ.Store.getSettings();
    const cfg0 = s0.ai || {};
    state.outlineEngine = s0.outlineEngine || (MQ.AI.isConfigured(cfg0) ? 'ai' : 'local');
    state.charEngine = s0.charEngine || (MQ.AI.isConfigured(cfg0) ? 'ai' : 'local');
    setPaperTheme(s0.paperTheme || 'rice');

    // 顶部导航
    $('btn-home').addEventListener('click', () => showView('shelf'));
    $('btn-shelf').addEventListener('click', () => showView('shelf'));
    $('btn-ai').addEventListener('click', openAiModal);
    // 主题切换
    const themeBtn = $('btn-theme');
    const savedTheme = MQ.Store.getSettings().theme || 'dark';
    if (savedTheme === 'light') document.body.classList.add('light');
    themeBtn.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('light');
      const s = MQ.Store.getSettings(); s.theme = isLight ? 'light' : 'dark'; MQ.Store.saveSettings(s);
      themeBtn.textContent = isLight ? '☀️' : '🌓';
    });
    $('btn-search').addEventListener('click', () => {
      if (!state.currentNovel) { toast('请先打开一本小说再查找', 'err'); return; }
      openFindModal(state.currentNovel);
    });
    $('btn-new-novel').addEventListener('click', () => showView('create'));
    $('btn-import-book').addEventListener('click', importBookJSON);
    $('btn-stats').addEventListener('click', () => showView('stats'));
    $('btn-back-shelf').addEventListener('click', () => showView('shelf'));
    $('btn-stats-export').addEventListener('click', exportStatsReport);
    $('btn-manage-styles').addEventListener('click', openCustomStyleModal);

    // Tabs
    document.querySelectorAll('.stab').forEach(b => {
      b.addEventListener('click', () => showTab(b.dataset.tab));
    });
    $('btn-inspire-new').addEventListener('click', () => {
      if (state.currentNovel) renderInspire(state.currentNovel);
    });

    // 写作台键盘快捷键：Ctrl+Enter 生成 / Ctrl+Shift+Enter 续写 / Ctrl+S 保存 / ←→ 切章
    // 仅在写作台视图、无弹窗、写作台标签激活时生效；←/→ 在焦点位于可编辑元素时不生效（避免吞掉光标移动）
    document.addEventListener('keydown', (e) => {
      // Esc：退出专注模式（无弹窗时）
      if (e.key === 'Escape' && document.body.classList.contains('focus-mode') && !document.getElementById('active-modal')) {
        setFocusMode(false);
        return;
      }
      // Ctrl+Shift+F：全文查找（任何视图可用，弹窗中不重复打开）
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f') && !document.getElementById('active-modal')) {
        e.preventDefault();
        if (state.currentNovel) openFindModal(state.currentNovel);
        else toast('请先打开一本小说再查找', 'err');
        return;
      }
      if (state.view !== 'studio' || document.getElementById('active-modal')) return;
      const tab = $('tab-writer');
      if (!tab || !tab.classList.contains('active')) return;
      const ws = writerShortcuts;
      if (!ws) return;

      const isEditable = (() => {
        const el = document.activeElement;
        if (!el) return false;
        const t = el.tagName;
        return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable;
      })();

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); // 阻止浏览器「保存页面」对话框
        ws.save();
        return;
      }
      // Ctrl+Z 撤销 / Ctrl+Y 重写
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z') && isEditable) {
        e.preventDefault(); undo(); return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'y' || e.key === 'Y') && isEditable) {
        e.preventDefault(); redo(); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) ws.cont(); else ws.generate();
        return;
      }
      if (!isEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); ws.prev(); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); ws.next(); return; }
      }
    });

    renderGenreChips();
    renderTemplateChips();
    bindCreateForm();
    updatePreview();
    showView('shelf');

    // 写作提醒：检查今日是否有写作，没有则提示
    setTimeout(() => {
      const novels = MQ.Store.getNovels();
      const today = new Date().toDateString();
      const wroteToday = novels.some(n => {
        const log = n.wcLog || [];
        return log.some(e => new Date(e.ts).toDateString() === today);
      });
      if (!wroteToday && novels.length > 0) {
        toast('📝 今天还没有写作哦，加油！', '');
      }
    }, 2000);

    // 欢迎提示
    setTimeout(() => {
      const settings = MQ.Store.getSettings();
      const cfg = settings.ai || {};
      if (!cfg.key) {
        toast('提示：可在右上角配置 AI 接口，或直接使用本地引擎');
      }
    }, 1200);
  }

  document.addEventListener('DOMContentLoaded', init);

})(window.MQ);
