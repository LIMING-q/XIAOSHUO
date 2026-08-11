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
  };

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
    ['shelf', 'create', 'studio'].forEach(v => $('view-' + v).classList.toggle('hidden', v !== name));
    if (name === 'shelf') renderShelf();
    if (name === 'studio' && state.currentNovel) renderStudio();
    window.scrollTo(0, 0);
  }

  /* ============================================================
     书架
     ============================================================ */
  function renderShelf() {
    const grid = $('shelf-grid');
    grid.innerHTML = '';
    const novels = MQ.Store.getNovels();

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
      const card = MQ.el('div', {
        class: 'novel-card card',
        onclick: () => openNovel(n.id),
      }, [
        MQ.el('div', { class: 'nc-title', text: n.title }),
        MQ.el('span', { class: 'nc-genre', text: `${n.genreIcon} ${n.genreName}` }),
        MQ.el('div', { class: 'nc-meta', text: `${MQ.countChars(n.chapters.map(c => c.text).join(''))} 字 · ${done}/${total} 章` }),
        MQ.el('div', { class: 'nc-progress' }, [MQ.el('i', { style: `width:${pct}%` })]),
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

  function openNovel(id) {
    const n = MQ.Store.getNovel(id);
    if (!n) { toast('未找到该小说', 'err'); return; }
    state.currentNovel = n;
    state.currentChapter = 0;
    showView('studio');
  }

  /* ============================================================
     创建向导
     ============================================================ */
  const draft = { genre: 'xuanhuan', title: '', protagonist: '', conflict: '', world: '', style: 'fierce', chapters: 16 };

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

  function bindCreateForm() {
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
    if (name === 'writer') renderWriterTab(state.currentNovel);
  }

  /* ---- 大纲页 ---- */
  function renderOutlineTab(n) {
    const tab = $('tab-outline');
    tab.innerHTML = '';

    const toolbar = MQ.el('div', { class: 'outline-toolbar' }, [
      enginePills(state.outlineEngine, (v) => { state.outlineEngine = v; saveModulePrefs(); renderOutlineTab(n); }),
      MQ.el('span', { class: 'hint muted', text: `共 ${n.chapters.length} 章 · 三幕结构` }),
      MQ.el('button', { class: 'btn btn-ghost btn-sm', id: 'btn-regen-outline', text: '⟳ 重新生成大纲', onclick: () => regenerateOutline(n) }),
      MQ.el('button', {
        class: 'btn btn-primary btn-sm', text: '✍️ 一键生成全部正文',
        onclick: () => generateAllChapters(n),
      }),
    ]);
    tab.appendChild(toolbar);

    const cards = MQ.el('div', { class: 'chapter-cards' });
    n.chapters.forEach((c, i) => {
      const actName = c.act === 1 ? '第一幕 · 起' : c.act === 2 ? '第二幕 · 承转' : '第三幕 · 合';
      const beatNames = { intro: '引子', daily: '日常', incite: '触发', depart: '启程', explore: '探索', meet: '相遇', trial: '试炼', approach: '逼近', low: '低谷', rally: '转机', climax: '决战', cost: '代价', resolve: '收束', after: '尾声' };
      const card = MQ.el('div', { class: 'chapter-card card' }, [
        MQ.el('div', { class: 'cc-num', text: String(i + 1) }),
        MQ.el('div', { class: 'cc-body' }, [
          MQ.el('div', { class: 'cc-title', text: `${MQ.cnNum(i + 1)} · ${c.title}` }),
          MQ.el('div', { class: 'cc-tags' }, [
            MQ.el('span', { class: `cc-tag act${c.act}`, text: actName }),
            MQ.el('span', { class: 'cc-tag', text: beatNames[c.beat] || c.beat }),
            MQ.el('span', { class: 'cc-tag', text: `📍${c.place}` }),
            c.foreshadow ? MQ.el('span', { class: 'cc-tag', text: '🔗 伏笔回收' }) : null,
            c.text ? MQ.el('span', { class: 'cc-tag', text: `已写 ${c.wordCount} 字` }) : null,
          ]),
          MQ.el('div', { class: 'cc-summary', text: c.summary }),
        ]),
        MQ.el('div', { class: 'cc-ops' }, [
          MQ.el('button', { class: 'icon-btn', title: '编辑', text: '✎', onclick: () => editChapterModal(n, i) }),
          MQ.el('button', { class: 'icon-btn', title: '生成正文', text: '✍️', onclick: () => { selectChapter(i); } }),
        ]),
      ]);
      cards.appendChild(card);
    });
    tab.appendChild(cards);
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
    ]);
    openModal('编辑章节', body, [
      { text: '取消', cls: 'btn-ghost', onclick: (m) => closeModal(m) },
      {
        text: '保存', cls: 'btn-primary', onclick: (m) => {
          c.title = $('ec-title').value.trim() || c.title;
          c.summary = $('ec-summary').value.trim() || c.summary;
          c.place = $('ec-place').value.trim() || c.place;
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

  /* ---- 角色页 ---- */
  function renderCharactersTab(n) {
    const tab = $('tab-characters');
    tab.innerHTML = '';
    const toolbar = MQ.el('div', { class: 'outline-toolbar' }, [
      enginePills(state.charEngine, (v) => { state.charEngine = v; saveModulePrefs(); renderCharactersTab(n); }),
      MQ.el('span', { class: 'hint muted', text: `${n.characters.length} 位角色 · 对话已按性格区分` }),
      MQ.el('button', { class: 'btn btn-ghost btn-sm', id: 'btn-regen-chars', text: '⟳ 重新生成角色', onclick: () => regenerateCharacters(n) }),
    ]);
    tab.appendChild(toolbar);
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
      MQ.Store.upsertNovel(n);
      renderCharactersTab(n);
      toast(usedAI ? (tries > 1 ? `AI 深度角色卡已生成（第 ${tries} 次尝试成功）🎉` : 'AI 深度角色卡已生成 🎉') : '角色卡已重新生成');
    } finally {
      state.generating = false;
      if (btn) { btn.disabled = false; btn.textContent = '⟳ 重新生成角色'; }
    }
  }

  /* ---- 写作台 ---- */
  function renderWriterTab(n) {
    const tab = $('tab-writer');
    const c = n.chapters[state.currentChapter];
    tab.innerHTML = '';

    const engine = MQ.AI.activeEngine();
    const isAI = engine === 'ai';

    const toolbar = MQ.el('div', { class: 'writer-toolbar' }, [
      MQ.el('button', { class: 'btn btn-primary', text: isAI ? '✨ AI 生成本章' : '🖋️ 生成本章', onclick: () => generateCurrent() }),
      MQ.el('button', { class: 'btn btn-ghost', text: '➕ 续写', onclick: () => continueCurrent() }),
      MQ.el('button', { class: 'btn btn-ghost', text: '✎ 重写本章', onclick: () => openRewriteModal(n) }),
      MQ.el('button', { class: 'btn btn-ghost', text: '🗑️ 清空', onclick: () => clearCurrent() }),
      MQ.el('button', {
        class: 'btn btn-ghost', text: '⬇️ 导出',
        onclick: () => openExportModal(n),
      }),
      MQ.el('span', {
        class: 'engine-badge ' + (isAI ? 'ai' : 'local'),
        html: `<span class="dot"></span>${isAI ? 'AI 引擎 · ' + MQ.AI.getConfig().model : '本地引擎'}`,
        title: isAI ? '已配置 AI 接口，生成走 AI' : '未配置 AI 或已切换本地，生成走本地引擎',
      }),
    ]);
    tab.appendChild(toolbar);

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

    const stat = MQ.el('div', { class: 'stat' });
    const actions = MQ.el('div', { class: 'writer-actions' }, [
      MQ.el('button', { class: 'btn btn-ghost btn-sm', text: '⟲ 上一章', onclick: () => { if (state.currentChapter > 0) selectChapter(state.currentChapter - 1); } }),
      MQ.el('button', { class: 'btn btn-ghost btn-sm', text: '⟳ 下一章', onclick: () => { if (state.currentChapter < n.chapters.length - 1) selectChapter(state.currentChapter + 1); } }),
      stat,
    ]);
    tab.appendChild(actions);

    // 绑定编辑器
    const pt = paper.querySelector('.paper-text');
    pt.textContent = state.compareMode === 'rew' && c.rewrite ? c.rewrite.text : (c.text || '');
    updateWriterStat();

    const save = MQ.debounce(() => {
      c.text = pt.innerText.trim();
      c.wordCount = MQ.countChars(c.text);
      updateWriterStat();
      MQ.Store.autoSave(n);
    }, 700);
    pt.addEventListener('input', save);
    pt.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '　　'); }
    });

    function updateWriterStat() {
      stat.innerHTML = `本章 <b>${MQ.countChars(pt.innerText)}</b> 字 · 全书 <b>${MQ.countChars(n.chapters.map(ch => ch.text).join(''))}</b> 字`;
    }

    async function generateCurrent() {
      if (state.generating) return;
      if (c.rewrite) { c.rewrite = null; state.compareMode = 'orig'; }
      state.generating = true;
      const words = ['凝神运笔', '斟酌字句', '铺陈情节', '伏笔渐显', '收束成章'];
      let ac = null;
      let localCancelled = false;
      const overlay = MQ.el('div', { class: 'generating-overlay' }, [
        MQ.el('div', { class: 'go-text', text: '…' + words[0] }),
        MQ.el('div', { class: 'go-retry', text: '' }),
        MQ.el('div', { class: 'go-time', text: '' }),
        MQ.el('button', {
          class: 'go-cancel', text: '✕ 取消',
          onclick: () => {
            if (ac) ac.abort();
            else localCancelled = true;
            const cb = overlay.querySelector('.go-cancel');
            if (cb) { cb.textContent = '取消中…'; cb.disabled = true; }
          },
        }),
      ]);
      let wi = 0;
      const t0 = Date.now();
      const wint = setInterval(() => {
        wi = (wi + 1) % words.length;
        overlay.querySelector('.go-text').textContent = '…' + words[wi];
        overlay.querySelector('.go-time').textContent = '已用 ' + Math.round((Date.now() - t0) / 1000) + 's';
      }, 500);
      paper.appendChild(overlay);
      pt.textContent = '';

      let tries = 1;
      try {
        if (MQ.AI.activeEngine() === 'ai') {
          ac = new AbortController();
          let acc = '';
          await MQ.AI.generateChapterAI(n, state.currentChapter, (delta) => {
            acc += delta;
            pt.textContent = acc;
            updateWriterStat();
          }, (a) => {
            tries = a;
            if (a > 1) {
              const gr = overlay.querySelector('.go-retry');
              if (gr) gr.textContent = '⚠ 生成中断，正在第 ' + a + ' 次尝试…';
            }
          }, ac.signal);
          c.text = pt.innerText;
        } else {
          const chapter = MQ.Engine.generateChapter(n, state.currentChapter);
          // 打字机逐段显示（本地生成同步完成，取消仅停止动画，保留已显示部分为草稿）
          const paras = chapter.text.split('\n\n');
          for (let i = 0; i < paras.length; i++) {
            if (localCancelled) break;
            pt.textContent = pt.textContent ? pt.textContent + '\n\n' + paras[i] : paras[i];
            updateWriterStat();
            await sleep(55 + Math.random() * 60);
          }
          c.text = pt.innerText;
        }
        MQ.Store.upsertNovel(n);
        renderSidebar(n);
        renderOutlineTab(n);
        toast(localCancelled ? '已取消生成，已保留部分内容' : (tries > 1 ? `本章完成（第 ${tries} 次尝试成功）✍️` : '本章完成 ✍️'), localCancelled ? '' : 'ok');
      } catch (err) {
        // 遮罩上直接显示失败/取消原因并停留 1.6s，避免请求秒败时「没反应」的错觉
        overlay.classList.add('failed');
        const gt = overlay.querySelector('.go-text');
        if (gt) {
          gt.textContent = MQ.AI.isAbort(err) ? '✕ 已取消生成' : '✕ 生成失败：' + err.message;
          gt.style.fontSize = '14px';
          gt.style.color = '#9c2f1d';
        }
        const gc = overlay.querySelector('.go-cancel');
        if (gc) gc.remove();
        // 生成失败或用户取消：把已生成的部分文本保留为草稿，避免白写
        const partial = pt.innerText.trim();
        if (MQ.AI.isAbort(err)) {
          if (partial && !c.text) {
            c.text = partial;
            c.wordCount = MQ.countChars(c.text);
            MQ.Store.upsertNovel(n);
            toast('已取消生成，已保留部分内容', 'err');
          } else {
            if (c.text) pt.textContent = c.text; // 章节原有旧文时（无论是否生成了部分文本），显示回退到已保存内容
            toast('已取消生成');
          }
        } else if (partial && !c.text) {
          c.text = partial;
          c.wordCount = MQ.countChars(c.text);
          MQ.Store.upsertNovel(n);
          toast('生成失败，已保留部分内容：' + err.message, 'err');
        } else {
          if (partial && c.text) pt.textContent = c.text; // 章节原有旧文时，显示回退到已保存内容
          toast('生成失败：' + err.message, 'err');
        }
      } finally {
        clearInterval(wint);
        state.generating = false;
        updateWriterStat();
        if (overlay.classList.contains('failed')) setTimeout(() => overlay.remove(), 1600);
        else overlay.remove();
      }
    }

    async function continueCurrent() {
      if (state.generating) return;
      if (c.rewrite) { c.rewrite = null; state.compareMode = 'orig'; }
      state.generating = true;
      let ac = null;
      let localCancelled = false;
      const overlay = MQ.el('div', { class: 'generating-overlay' }, [
        MQ.el('div', { class: 'go-text', text: '…续写中' }),
        MQ.el('div', { class: 'go-retry', text: '' }),
        MQ.el('div', { class: 'go-time', text: '' }),
        MQ.el('button', {
          class: 'go-cancel', text: '✕ 取消',
          onclick: () => {
            if (ac) ac.abort();
            else localCancelled = true;
            const cb = overlay.querySelector('.go-cancel');
            if (cb) { cb.textContent = '取消中…'; cb.disabled = true; }
          },
        }),
      ]);
      const t0 = Date.now();
      const tint = setInterval(() => {
        overlay.querySelector('.go-time').textContent = '已用 ' + Math.round((Date.now() - t0) / 1000) + 's';
      }, 500);
      paper.appendChild(overlay);
      let tries = 1;
      try {
        const existing = pt.innerText.trim();
        if (MQ.AI.activeEngine() === 'ai') {
          ac = new AbortController();
          let acc = existing;
          await MQ.AI.continueChapterAI(n, state.currentChapter, existing, (delta) => {
            acc += delta;
            pt.textContent = acc;
            updateWriterStat();
          }, (a) => {
            tries = a;
            if (a > 1) {
              const gr = overlay.querySelector('.go-retry');
              if (gr) gr.textContent = '⚠ 续写中断，正在第 ' + a + ' 次尝试…';
            }
          }, ac.signal);
        } else {
          const chapter = MQ.Engine.continueChapter(n, state.currentChapter, existing);
          const newPart = chapter.text.slice(existing.length).split('\n\n');
          for (const para of newPart) {
            if (localCancelled) break;
            if (!para.trim()) continue;
            pt.textContent = pt.textContent ? pt.textContent + '\n\n' + para : para;
            updateWriterStat();
            await sleep(40);
          }
        }
        if (localCancelled) { c.text = pt.innerText; c.wordCount = MQ.countChars(c.text); } // 本地续写被取消：保留已显示部分
        MQ.Store.upsertNovel(n);
        renderSidebar(n);
        toast(localCancelled ? '已取消续写，已保留部分内容' : (tries > 1 ? `续写完成（第 ${tries} 次尝试成功）✍️` : '续写完成 ✍️'), localCancelled ? '' : 'ok');
      } catch (err) {
        // 遮罩上直接显示失败/取消原因并停留 1.6s
        overlay.classList.add('failed');
        const gt = overlay.querySelector('.go-text');
        if (gt) {
          gt.textContent = MQ.AI.isAbort(err) ? '✕ 已取消续写' : '✕ 续写失败：' + err.message;
          gt.style.fontSize = '14px';
          gt.style.color = '#9c2f1d';
        }
        const gc = overlay.querySelector('.go-cancel');
        if (gc) gc.remove();
        // 失败或取消：保留已续写部分（含原有文本），避免白写
        const partial = pt.innerText.trim();
        if (MQ.AI.isAbort(err)) {
          if (partial) {
            c.text = partial;
            c.wordCount = MQ.countChars(c.text);
            MQ.Store.upsertNovel(n);
            toast('已取消续写，已保留部分内容', 'err');
          } else {
            toast('已取消续写');
          }
        } else {
          if (partial) {
            c.text = partial;
            c.wordCount = MQ.countChars(c.text);
            MQ.Store.upsertNovel(n);
          }
          toast('续写失败：' + err.message, 'err');
        }
      } finally {
        clearInterval(tint);
        state.generating = false;
        updateWriterStat();
        if (overlay.classList.contains('failed')) setTimeout(() => overlay.remove(), 1600);
        else overlay.remove();
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
      renderSidebar(n);
      renderOutlineTab(n);
    }
  }

  /* ---- 灵感面板 ---- */
  function renderInspire(n) {
    const body = $('inspire-body');
    const cards = [];
    for (let i = 0; i < 3; i++) {
      const card = MQ.Engine.randomInspire(n);
      cards.push(MQ.el('div', { class: 'inspire-card' + (i === 0 ? ' hot' : '') }, [
        MQ.el('b', { text: '✦ ' + card.tag }),
        MQ.el('div', { text: card.text }),
      ]));
    }
    body.innerHTML = '';
    cards.forEach(c => body.appendChild(c));
  }

  /* ============================================================
     弹窗
     ============================================================ */
  function openModal(title, body, buttons) {
    closeModal();
    const mask = MQ.el('div', { class: 'modal-mask', id: 'active-modal' });
    const modal = MQ.el('div', { class: 'modal' }, [
      MQ.el('div', { class: 'modal-head' }, [
        MQ.el('h3', { text: title }),
        MQ.el('button', { class: 'icon-btn', text: '✕', onclick: () => closeModal() }),
      ]),
      MQ.el('div', { class: 'modal-body' }, [body]),
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
    const styles = Object.values(MQ.Prose.STYLES);
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
          '<br>生成后可在写作台对比「原稿 / 重写版」，再决定是否采用。'
        : '将使用 <b>本地引擎</b> 重写（未配置 AI 或当前选了本地生成）。' +
          '<br>生成后可在写作台对比「原稿 / 重写版」，再决定是否采用。' }),
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
    const paperEl = document.querySelector('#tab-writer .paper');
    const isAI = MQ.AI.activeEngine() === 'ai';
    let prog = null;
    const overlay = MQ.el('div', { class: 'generating-overlay' }, [
      MQ.el('div', { class: 'go-text', text: isAI ? '…AI 重写中' : '…重写中' }),
      MQ.el('div', { class: 'go-time', text: '' }),
    ]);
    if (paperEl) paperEl.appendChild(overlay);
    const t0 = Date.now();
    const tint = setInterval(() => {
      overlay.querySelector('.go-time').textContent = '已用 ' + Math.round((Date.now() - t0) / 1000) + 's';
    }, 500);
    try {
      let result;
      if (isAI) {
        const ac = new AbortController();
        prog = progressOverlay(['正在通读本章', '正在转换文风', '正在逐段重写', '正在润色收束'], () => { ac.abort(); prog.cancelling(); });
        try {
          result = await MQ.AI.rewriteChapterAI(n, state.currentChapter, styleId, ac.signal);
          prog.finish('重写完成');
        } catch (err) {
          if (prog) prog.fail(MQ.AI.isAbort(err) ? '已取消' : '重写失败：' + err.message);
          throw err;
        }
      } else {
        const ch = MQ.Engine.generateChapter(n, state.currentChapter, styleId);
        result = { text: ch.text, styleId, styleName: MQ.Prose.getStyle(styleId).name, wordCount: MQ.countChars(ch.text) };
        // 本地生成会直接覆盖 chapter.text，这里还原原稿，等待用户决定是否采用
        c.text = original;
        c.wordCount = MQ.countChars(original);
        n.wordCount = n.chapters.reduce((s, x) => s + (x.wordCount || 0), 0);
      }
      if (!result.text || MQ.countChars(result.text) < 40) throw new Error('生成内容为空');
      c.rewrite = result;
      state.compareMode = 'rew';
      MQ.Store.upsertNovel(n);
      renderWriterTab(n);
      toast('重写完成，可在写作台对比查看 ✨', 'ok');
    } catch (err) {
      if (prog) prog.remove();
      c.text = original;
      c.wordCount = MQ.countChars(original);
      n.wordCount = n.chapters.reduce((s, x) => s + (x.wordCount || 0), 0);
      renderWriterTab(n);
      toast(MQ.AI.isAbort(err) ? '已取消重写' : '重写失败：' + err.message, 'err');
    } finally {
      clearInterval(tint);
      if (overlay.parentNode) overlay.remove();
      state.generating = false;
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
          exportNovel(n, range, format);
          closeModal(m);
          toast('已导出 📥', 'ok');
        },
      },
    ]);
  }

  function exportNovel(n, range, format) {
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
      lines.push(`${MQ.cnNum(i + 1)}. ${c.title}`);
    });
    lines.push('');

    // 正文
    n.chapters.forEach((c, i) => {
      if (range === 'written' && !c.text) return;
      if (range === 'current' && i !== state.currentChapter) return;
      lines.push('');
      lines.push(isMd ? `## 第${MQ.cnNum(i + 1)}章 ${c.title}` : `第${MQ.cnNum(i + 1)}章 ${c.title}`);
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

  /* ============================================================
     初始化
     ============================================================ */
  function init() {
    // 读取模块引擎偏好（默认：已配置 AI 则默认走 AI 深度创作）
    const s0 = MQ.Store.getSettings();
    const cfg0 = s0.ai || {};
    state.outlineEngine = s0.outlineEngine || (MQ.AI.isConfigured(cfg0) ? 'ai' : 'local');
    state.charEngine = s0.charEngine || (MQ.AI.isConfigured(cfg0) ? 'ai' : 'local');

    // 顶部导航
    $('btn-home').addEventListener('click', () => showView('shelf'));
    $('btn-shelf').addEventListener('click', () => showView('shelf'));
    $('btn-ai').addEventListener('click', openAiModal);
    $('btn-new-novel').addEventListener('click', () => showView('create'));

    // Tabs
    document.querySelectorAll('.stab').forEach(b => {
      b.addEventListener('click', () => showTab(b.dataset.tab));
    });
    $('btn-inspire-new').addEventListener('click', () => {
      if (state.currentNovel) renderInspire(state.currentNovel);
    });

    renderGenreChips();
    bindCreateForm();
    updatePreview();
    showView('shelf');

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
