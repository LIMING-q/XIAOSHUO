/* ============================================================
   墨泉 · AI 接入层
   OpenAI 兼容接口：chat/completions（流式 SSE）+ 连接检测
   ============================================================ */
(function (MQ) {
  'use strict';

  const DEFAULT_BASE = 'https://api.openai.com/v1';
  const DEFAULT_MODEL = 'gpt-4o-mini';

  const PROVIDERS = [
    { name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { name: 'DeepSeek', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { name: 'Moonshot', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { name: '通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { name: '自定义', base: '', model: '' },
  ];

  function getConfig() {
    const settings = (MQ.Store && MQ.Store.getSettings) ? MQ.Store.getSettings() : {};
    const saved = (settings && settings.ai) || {};
    return {
      base: saved.base || '',
      key: saved.key || '',
      model: saved.model || '',
      temperature: saved.temperature != null ? saved.temperature : 0.8,
      engineMode: saved.engineMode || 'auto',
      retries: saved.retries != null ? saved.retries : 1,
    };
  }

  // 失败自动重试次数（0/1/2，来自 AI 设置）
  function retrySetting() {
    const r = parseInt(getConfig().retries, 10);
    return Number.isFinite(r) ? Math.max(0, Math.min(2, r)) : 1;
  }

  function isConfigured(cfg) {
    cfg = cfg || getConfig();
    return !!(cfg.base && cfg.key && cfg.model);
  }

  // 当前实际使用哪个引擎：'ai' | 'local'
  function activeEngine(cfg) {
    cfg = cfg || getConfig();
    if (cfg.engineMode === 'local') return 'local';
    if (cfg.engineMode === 'ai') return isConfigured(cfg) ? 'ai' : 'local';
    // auto
    return isConfigured(cfg) ? 'ai' : 'local';
  }

  async function testConnection(cfg) {
    cfg = cfg || getConfig();
    if (!cfg.base || !cfg.key) {
      throw new Error('请先填写 Base URL 与 API Key');
    }
    const base = cfg.base.replace(/\/+$/, '');
    if (!/^https?:\/\//.test(base)) {
      throw new Error('Base URL 格式不对：应以 http:// 或 https:// 开头');
    }
    // 先试 GET /models（多数平台支持）；部分平台不提供该端点，降级用最小 chat 请求验证
    try {
      const res = await fetch(base + '/models', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
      });
      if (res.ok) return true;
    } catch (e) { /* 网络/CORS 错误也走降级，由 chat 请求给出最终结论 */ }
    // 降级：发一个最小 chat/completions 请求（max_tokens=1），能通即连接正常
    try {
      const res2 = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        }),
      });
      if (res2.ok) return true;
      const body = await res2.text().catch(() => '');
      throw new Error(`连接失败（HTTP ${res2.status}）${body ? '：' + body.slice(0, 140) : ''}`);
    } catch (e) {
      if (e && e.message && e.message.indexOf('连接失败（HTTP') === 0) throw e;
      throw new Error('连接失败：' + (e && e.message ? e.message : e) +
        '。请检查：1) Base URL 是否以 /v1 结尾且可访问；2) API Key 是否正确（含空格？）；3) 模型名是否正确；4) 网络/代理/CORS 是否允许浏览器直接访问该接口');
    }
  }

  // 读取服务商支持的模型列表（GET /models），兼容 data.data / data.models / 纯数组三种响应格式
  async function listModels(cfg) {
    cfg = cfg || getConfig();
    if (!cfg.base || !cfg.key) {
      throw new Error('请先填写 Base URL 与 API Key');
    }
    const url = cfg.base.replace(/\/+$/, '') + '/models';
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + cfg.key,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`读取模型失败（HTTP ${res.status}）${body ? '：' + body.slice(0, 140) : ''}`);
    }
    const data = await res.json().catch(() => ({}));
    const ids = [];
    if (Array.isArray(data.data)) ids.push(...data.data.map(m => (m && m.id) || m));
    else if (Array.isArray(data.models)) ids.push(...data.models.map(m => (m && m.id) || m));
    else if (Array.isArray(data)) ids.push(...data.map(m => (m && m.id) || m));
    return ids.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
  }

  /* ---------- chat（流式 SSE / 非流式 JSON） ---------- */
  async function chat(messages, opts) {
    const cfg = getConfig();
    const base = (opts.base || cfg.base).replace(/\/+$/, '');
    const stream = opts.stream !== false;
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + (opts.key || cfg.key),
        'Content-Type': 'application/json',
      },
      signal: opts.signal, // 用户点击取消时中断请求
      body: JSON.stringify({
        model: opts.model || cfg.model,
        messages,
        temperature: opts.temperature != null ? opts.temperature : cfg.temperature,
        stream,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`AI 请求失败（HTTP ${res.status}）${body ? '：' + body.slice(0, 160) : ''}`);
    }

    // 非流式：一次返回完整 JSON
    if (!stream) {
      const data = await res.json().catch(() => ({}));
      const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      if (opts.onDelta && content) opts.onDelta(content);
      return { content: content.trim(), usage: { prompt: 0, completion: MQ.countChars(content) } };
    }

    if (!res.body) throw new Error('当前环境不支持流式响应');

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let full = '';
    const onDelta = opts.onDelta;

    const finish = (content) => ({
      content: (content || '').trim(),
      usage: { prompt: 0, completion: MQ.countChars(content || '') },
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        let line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') { buffer = ''; break; }
        try {
          const json = JSON.parse(payload);
          const delta = json.choices && json.choices[0] && json.choices[0].delta;
          const piece = delta && delta.content ? delta.content : '';
          if (piece) {
            full += piece;
            if (onDelta) onDelta(piece);
          }
        } catch (e) { /* 忽略无法解析的行 */ }
      }
    }
    return finish(full);
  }

  /* ---------- 构建创作提示词 ---------- */
  function buildMessages(novel, chapter, recentText, styleOverride) {
    const genre = MQ.Content.getGenre(novel.genreId);
    const style = styleOverride ? MQ.Prose.getStyle(styleOverride) : MQ.Prose.getStyle(novel.styleId);

    const charLines = novel.characters.map(c =>
      `- ${c.name}（${c.role}，${c.identity}）：性格${c.personaOuter}、${c.personaInner}。背景：${c.backstory}`
    ).join('\n');

    const system = [
      '你是一位资深中文小说作家，文笔老练，擅长网文与严肃文学之间的叙事。',
      `当前作品题材：${novel.genreName}（${genre.desc}）。`,
      `全书文风要求：${style.name}——${style.desc}`,
      '写作要求：',
      '1. 只输出小说正文，不要输出章节标题、不要输出任何解释、不要用 markdown 标题。',
      '2. 用中文第三人称写作，围绕主角展开。',
      '3. 段落分明，对话符合人物性格，适当加入环境与心理描写。',
      '4. 本章字数控制在 1100–1600 字。',
      '5. 保持前后文连贯，注意承接上一章结尾的悬念。',
      '6. 结尾留一个自然的悬念或余韵。',
    ].join('\n');

    const user = [
      `《${novel.title}》（${novel.genreName}）`,
      `世界观：${novel.world}`,
      `核心冲突：${novel.conflict}`,
      `主角：${novel.hero.name}（${novel.identity}，性格：${novel.hero.personaOuter}、${novel.hero.personaInner}。背景：${novel.hero.backstory}）`,
      `主要角色：\n${charLines}`,
      '',
      `【本章任务】第 ${novel.chapters.indexOf(chapter) + 1} 章「${chapter.title}」`,
      `本章定位（${['引子', '日常', '触发', '启程', '探索', '相遇', '试炼', '逼近', '低谷', '转机', '决战', '代价', '收束', '尾声'][{intro:0,daily:1,incite:2,depart:3,explore:4,meet:5,trial:6,approach:7,low:8,rally:9,climax:10,cost:11,resolve:12,after:13}[chapter.beat] || 0]}）`,
      `本章剧情：${chapter.summary}`,
      `本章发生地点：${chapter.place}`,
      recentText ? `【前文】上一章结尾：\n${recentText.slice(-400)}` : '【前文】这是第一章，请自然开篇。',
    ].join('\n');

    return [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }

  /* ---------- 用 AI 生成一章（流式回调 onDelta，中断自动重试并保留已生成部分） ---------- */
  async function generateChapterAI(novel, idx, onDelta, onAttempt, signal) {
    const chapter = novel.chapters[idx];
    const prev = idx > 0 && novel.chapters[idx - 1] ? novel.chapters[idx - 1].text : '';
    const baseMessages = buildMessages(novel, chapter, prev);
    const text = await withRetryStream(async (partial, emit, sig) => {
      const messages = baseMessages.slice();
      if (partial) {
        messages.push({
          role: 'user',
          content: '【中断续写】本章在生成过程中被打断，请从上面引文的结尾处直接继续往下写，不要重复引文中的任何内容，保持人物与语气完全一致：\n' + partial.slice(-240),
        });
      }
      await chat(messages, { onDelta: emit, signal: sig });
    }, { onDelta, onAttempt, retries: retrySetting(), signal });
    chapter.text = text;
    chapter.wordCount = MQ.countChars(chapter.text);
    chapter.updatedAt = MQ.now();
    novel.wordCount = novel.chapters.reduce((s, c) => s + (c.wordCount || 0), 0);
    novel.updatedAt = MQ.now();
    return chapter;
  }

  /* ---------- 用 AI 续写本章（流式回调 onDelta，中断自动重试并保留已生成部分） ---------- */
  async function continueChapterAI(novel, idx, existingText, onDelta, onAttempt, signal) {
    const chapter = novel.chapters[idx];
    const baseMessages = buildMessages(novel, chapter, existingText);
    baseMessages.push({
      role: 'user',
      content: '请直接续写当前章节，从【前文】结束的地方继续往下写，约 400–700 字，保持人物与语气完全一致。',
    });
    const text = await withRetryStream(async (partial, emit, sig) => {
      const messages = baseMessages.slice();
      if (partial) {
        messages.push({
          role: 'user',
          content: '【中断续写】续写在生成过程中被打断，请从上面引文的结尾处直接继续往下写，不要重复引文中的任何内容，保持人物与语气完全一致：\n' + partial.slice(-240),
        });
      }
      await chat(messages, { onDelta: emit, signal: sig });
    }, { onDelta, onAttempt, retries: retrySetting(), signal });
    chapter.text = existingText ? MQ.polish(existingText + '\n\n' + text) : text;
    chapter.wordCount = MQ.countChars(chapter.text);
    novel.wordCount = novel.chapters.reduce((s, c) => s + (c.wordCount || 0), 0);
    novel.updatedAt = MQ.now();
    return chapter;
  }

  /* ============================================================
     AI 深度创作：大纲 / 角色 / 重写（非流式 + JSON 提取）
     ============================================================ */

  // 构造标准取消错误（AbortError）
  function abortError(msg) {
    const e = new Error(msg || '已取消');
    e.name = 'AbortError';
    return e;
  }

  // 判断是否为用户主动取消（fetch 中断抛 DOMException 'AbortError'，内部统一用 name 标记）
  function isAbort(err) {
    return !!(err && (err.name === 'AbortError' || /abort/i.test(err.message || '')));
  }

  // 可中断延时：signal 触发时立即以 AbortError 拒绝
  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) { reject(abortError()); return; }
      const t = setTimeout(() => { cleanup(); resolve(); }, ms);
      const onAbort = () => { clearTimeout(t); cleanup(); reject(abortError()); };
      function cleanup() { if (signal) signal.removeEventListener('abort', onAbort); }
      if (signal) signal.addEventListener('abort', onAbort);
    });
  }

  // HTTP 4xx（401 密钥错误 / 403 无权限等）重试无意义，直接放弃重试
  function isAuthError(err) {
    return /HTTP 4\d\d/.test((err && err.message) ? err.message : '');
  }

  // 流式自动重试：生成中断时最多重试 retries 次（默认 1），保留已生成部分从断点续写
  // fn(partialText, emit) —— partialText 为已生成文本，emit(piece) 推送新增量（自动累积到 acc）
  const MAX_OVERLAP = 300; // 重试衔接处最大去重长度（防止模型回声锚点文本）

  // 计算 text 中与 tail 尾部重叠（作为前缀）的最长长度
  function overlapLen(tail, text) {
    const max = Math.min(tail.length, text.length, MAX_OVERLAP);
    let best = 0;
    for (let k = 1; k <= max; k++) {
      if (tail.endsWith(text.slice(0, k))) best = k;
    }
    return best;
  }

  // 把缓冲中的新文本去重叠后返回可并入 acc 的部分（收尾与失败路径共用）
  function commitBuf(base, newBuf, stripped) {
    return newBuf.slice(stripped ? 0 : overlapLen(base, newBuf));
  }

  async function withRetryStream(fn, opts) {
    const retries = (opts && opts.retries != null) ? opts.retries : 1;
    const onAttempt = opts && opts.onAttempt;
    const onDelta = opts && opts.onDelta;
    const signal = opts && opts.signal;
    const total = retries + 1;
    let acc = '';
    let lastErr;
    for (let i = 1; i <= total; i++) {
      if (signal && signal.aborted) throw abortError(); // 已取消：直接中断
      if (onAttempt) onAttempt(i, total);
      const base = acc; // 本尝试开始前已有的文本
      let newBuf = '';   // 未定稿的新内容缓冲（去重前不推送 UI）
      let stripped = false;
      try {
        await fn(base, (piece) => {
          newBuf += piece;
          if (base.length === 0) { // 首次尝试：无重叠可言，直接输出
            stripped = true;
            acc += newBuf;
            if (onDelta) onDelta(newBuf);
            newBuf = '';
          } else if (!stripped) {
            // 缓冲到能确定重叠为止：重叠不可能超过 min(base, MAX_OVERLAP)
            const limit = Math.min(base.length, MAX_OVERLAP);
            if (newBuf.length >= limit) {
              stripped = true;
              const rest = newBuf.slice(overlapLen(base, newBuf));
              acc += rest;
              if (rest && onDelta) onDelta(rest);
              newBuf = '';
            }
          } else {
            acc += piece;
            if (onDelta) onDelta(piece);
          }
        }, signal); // 把 signal 传给 fn（内部传给 chat 实现中断）
        // 收尾：输出短于重叠判定阈值时，把缓冲中的新文本去重叠后并入
        if (newBuf) {
          const rest = commitBuf(base, newBuf, stripped);
          acc += rest;
          if (rest && onDelta) onDelta(rest);
          newBuf = '';
        }
        return acc;
      } catch (e) {
        // 尝试失败：把缓冲中的新文本去重叠后并入 acc（保留已生成部分）
        if (!stripped && newBuf) {
          const rest = commitBuf(base, newBuf, false);
          acc += rest;
          if (rest && onDelta) onDelta(rest);
        }
        lastErr = e;
        if (isAbort(e)) break; // 用户取消：保留已生成部分，立即终止不再重试
        if (isAuthError(e) || i >= total) break; // 4xx 或最后一次：不再重试
        await sleep(800, signal); // 重试间隔（可中断）
      }
    }
    throw lastErr;
  }

  // 自动重试：网络抖动 / 解析失败时最多重试 retries 次（默认 1，即共尝试 2 次）
  async function withRetry(fn, opts) {
    const retries = (opts && opts.retries != null) ? opts.retries : 1;
    const onAttempt = opts && opts.onAttempt;
    const signal = opts && opts.signal;
    const total = retries + 1;
    let lastErr;
    for (let i = 1; i <= total; i++) {
      if (signal && signal.aborted) throw abortError(); // 已取消：直接中断
      if (onAttempt) onAttempt(i, total);
      try {
        return await fn(signal);
      } catch (e) {
        lastErr = e;
        if (isAbort(e)) break; // 用户取消：不再重试
        if (isAuthError(e) || i >= total) break; // 4xx 或最后一次：不再重试
        await sleep(800, signal); // 重试间隔（可中断）
      }
    }
    throw lastErr;
  }

  // 从模型输出中稳健提取 JSON 数组（容忍代码块 / 前后说明文字 / 尾部含 ] 的补充句）
  function extractJSON(text) {
    let t = String(text || '').trim();
    t = t.replace(/```json/gi, '').replace(/```/g, '');
    const start = t.indexOf('[');
    if (start < 0) return null;
    // 从末尾的每个 ] 往前试解析，避免尾部补充文字里的括号干扰
    for (let end = t.length; end > start; end--) {
      if (t[end - 1] === ']') {
        try { return JSON.parse(t.slice(start, end)); } catch (e) { /* 继续往前找 */ }
      }
    }
    return null;
  }

  const ACT1_BEATS = ['intro', 'daily', 'incite', 'depart'];
  const ACT3_BEATS = ['climax', 'cost', 'resolve', 'after'];
  const ALL_BEATS = ACT1_BEATS.concat(['explore', 'meet', 'trial', 'approach', 'low', 'rally'], ACT3_BEATS);

  function actOfBeat(beat) {
    if (ACT1_BEATS.includes(beat)) return 1;
    if (ACT3_BEATS.includes(beat)) return 3;
    return 2;
  }

  // AI 深度大纲：返回章节数组（不写回 novel，由 app 层合并保留正文）
  // 失败自动重试（次数来自 AI 设置，网络 / 解析失败时），onAttempt(attempt, total) 可用于进度显示
  async function generateOutlineAI(novel, onAttempt, signal) {
    const genre = MQ.Content.getGenre(novel.genreId);
    const total = MQ.Engine.resolveChapterCount(novel);
    const system = [
      '你是一位资深中文小说大纲策划师，深谙网文三幕结构与「起承转合」节奏。',
      `题材：${novel.genreName}（${genre.desc}）。全书文风：${MQ.Prose.getStyle(novel.styleId).name}。`,
      '输出要求：',
      '1. 只输出一个 JSON 数组，不要任何多余文字、注释或代码块标记。',
      `2. 数组共 ${total} 个元素，每个元素为：{"title":"章节标题","summary":"一章剧情完整摘要(40-80字)","place":"发生地点","beat":"结构标记"}。`,
      `3. beat 只能取：${ALL_BEATS.join('、')}。`,
      '4. 按三幕结构排列：第一幕（引子→启程）约占 25%，第二幕（探索→转机）约占 50%，第三幕（决战→尾声）约占 25%，最后一章为尾声。',
      '5. 标题要有网文味道、带悬念与画面感，不要用「第一章」「第二章」这类命名。',
      '6. 中段埋设 2 处伏笔，尾段对应回收。',
    ].join('\n');
    const user = [
      `《${novel.title}》`,
      `世界观：${novel.world}`,
      `核心冲突：${novel.conflict}`,
      `主角：${novel.hero.name}（${novel.identity}）`,
      `主要角色：${novel.characters.map(c => `${c.name}（${c.identity}）`).join('、')}`,
    ].join('\n');
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    return withRetry(async (sig) => {
      const res = await chat(messages, { stream: false, temperature: 0.95, signal: sig });
      const arr = extractJSON(res.content);
      if (!Array.isArray(arr) || arr.length < 6) throw new Error('AI 返回的大纲格式无法解析');
      const rng = MQ.makeRng((Date.now() % 1000000) + 7);
      const chapters = arr.slice(0, total);
      // 伏笔标记：中段埋 2 处，下一章回收（与本地引擎一致，保证正文生成会插入揭示段）
      const foreshadowIdx = [];
      const mid = Math.floor(chapters.length / 2);
      for (let i = 3; i < Math.min(mid, chapters.length - 4); i++) {
        if (foreshadowIdx.length < 2 && rng.chance(0.55)) foreshadowIdx.push(i);
      }
      if (!foreshadowIdx.length && chapters.length > 6) foreshadowIdx.push(4);
      return chapters.map((raw, i) => {
      const beat = ALL_BEATS.includes(raw.beat)
        ? raw.beat
        : (i < chapters.length * 0.25 ? 'daily' : i < chapters.length * 0.75 ? 'explore' : 'resolve');
      return {
        idx: i,
        beat,
        act: actOfBeat(beat),
        title: String(raw.title || '').trim() || `第${MQ.cnNum(i + 1)}章`,
        summary: String(raw.summary || '').trim(),
        event: '',
        place: String(raw.place || '').trim() || rng.pick(genre.places),
        foreshadow: foreshadowIdx.includes(i - 1),
        text: '',
        wordCount: 0,
      };
      });
    }, { onAttempt, retries: retrySetting(), signal });
  }

  // AI 深度角色：返回角色数组（主角严格保留给定名字与身份）
  // 失败自动重试（次数来自 AI 设置，网络 / 解析失败时），onAttempt(attempt, total) 可用于进度显示
  async function generateCharactersAI(novel, onAttempt, signal) {
    const system = [
      '你是一位资深小说人物设计师，擅长塑造有血有肉、性格鲜明的人物。',
      `题材：${novel.genreName}。世界观：${novel.world}。核心冲突：${novel.conflict}。`,
      '输出要求：',
      '1. 只输出一个 JSON 数组，不要任何多余文字、注释或代码块标记。',
      '2. 数组共 5 个元素：主角 + 2 个盟友 + 1 个对手 + 1 个引路人。',
      '3. 每个元素：{"name":"姓名","role":"主角|主盟友|盟友|对手|引路人","identity":"身份","personaOuter":"外在性格","personaInner":"内在性格","personaSay":"性格概述(一句话)","body":"样貌(一句)","backstory":"背景故事(一句)","goal":"目标","flaw":"缺陷","arc":"成长弧光(一句话)"}。',
      `4. 主角的 name 必须严格等于「${novel.hero.name}」，identity 必须等于「${novel.identity}」。`,
      '5. 五个角色的性格要差异明显（如外冷内热、话痨、阴鸷、宽厚、跳脱），方便后续对话区分风格。',
      '6. 对手要有压迫感与动机合理性。',
    ].join('\n');
    const user = `请为《${novel.title}》设计完整的角色阵容。`;
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    return withRetry(async (sig) => {
      const res = await chat(messages, { stream: false, temperature: 0.95, signal: sig });
      const arr = extractJSON(res.content);
      if (!Array.isArray(arr) || arr.length < 4) throw new Error('AI 返回的角色格式无法解析');

    const hero = novel.hero;
    const out = [];
    let heroSeen = false;
    const usedNames = new Set();
    for (const raw of arr) {
      const role = String(raw.role || '').trim();
      const name = String(raw.name || '').trim();
      if (role === '主角' && heroSeen) continue; // 防重复主角条目
      if (role === '主角') {
        heroSeen = true;
        out.push({
          id: 'hero',
          name: hero.name,
          role: '主角',
          identity: hero.identity,
          personaOuter: String(raw.personaOuter || hero.personaOuter).trim(),
          personaInner: String(raw.personaInner || hero.personaInner).trim(),
          personaSay: String(raw.personaSay || hero.personaSay).trim(),
          body: String(raw.body || hero.body).trim(),
          backstory: String(raw.backstory || hero.backstory).trim(),
          goal: String(raw.goal || hero.goal).trim(),
          flaw: String(raw.flaw || hero.flaw).trim(),
          arc: raw.arc || hero.arc,
          side: 'hero',
        });
      } else if (name && !usedNames.has(name) && ['主盟友', '盟友', '对手', '引路人'].includes(role)) {
        usedNames.add(name);
        out.push({
          id: MQ.uid('ch'),
          name,
          role,
          identity: String(raw.identity || '神秘之人').trim(),
          personaOuter: String(raw.personaOuter || '沉默寡言').trim(),
          personaInner: String(raw.personaInner || '外冷内热').trim(),
          personaSay: String(raw.personaSay || '').trim(),
          body: String(raw.body || '').trim(),
          backstory: String(raw.backstory || '').trim(),
          goal: String(raw.goal || '').trim(),
          flaw: String(raw.flaw || '').trim(),
          arc: String(raw.arc || '').trim(),
          side: role === '对手' ? 'foe' : 'ally',
        });
      }
    }
      if (!heroSeen) out.unshift(Object.assign({}, hero, { side: 'hero' }));
      if (out.length < 4) throw new Error('AI 返回的角色数量不足');
      return out;
    }, { onAttempt, retries: retrySetting(), signal });
  }

  // AI 换文风重写本章：不写回 novel，返回 { text, styleId, styleName, wordCount }
  async function rewriteChapterAI(novel, idx, styleId, signal) {
    const chapter = novel.chapters[idx];
    const style = MQ.Prose.getStyle(styleId);
    const messages = buildMessages(novel, chapter, chapter.text, styleId);
    messages.push({
      role: 'user',
      content: `请以「${style.name}」文风完整重写本章：${style.desc}。保留原有剧情走向与人物关系，但句式、用词、节奏全面改用该文风，约 1000–1400 字。只输出正文。`,
    });
    const res = await chat(messages, { stream: false, signal });
    return { text: res.content, styleId, styleName: style.name, wordCount: MQ.countChars(res.content) };
  }

  MQ.AI = {
    PROVIDERS,
    DEFAULT_BASE,
    DEFAULT_MODEL,
    getConfig,
    isConfigured,
    activeEngine,
    testConnection,
    listModels,
    chat,
    buildMessages,
    generateChapterAI,
    continueChapterAI,
    extractJSON,
    withRetry,
    withRetryStream,
    retrySetting,
    isAbort,
    generateOutlineAI,
    generateCharactersAI,
    rewriteChapterAI,
  };

})(window.MQ);
