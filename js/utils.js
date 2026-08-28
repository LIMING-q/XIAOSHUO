/* ============================================================
   墨泉 · 工具层（全局命名空间 MQ）
   ============================================================ */
window.MQ = window.MQ || {};

(function (MQ) {
  'use strict';

  /* ---------- 种子随机数 ---------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 从种子字符串生成哈希种子
  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // 可复现随机上下文
  function makeRng(seed) {
    const rand = mulberry32(typeof seed === 'number' ? seed : hashSeed(String(seed)));
    return {
      next: rand,
      int: (min, max) => Math.floor(rand() * (max - min + 1)) + min,
      pick: (arr) => arr[Math.floor(rand() * arr.length)],
      pickWeighted: function (arr, weightFn) {
        const total = arr.reduce((s, it) => s + weightFn(it), 0);
        let r = rand() * total;
        for (const it of arr) {
          r -= weightFn(it);
          if (r <= 0) return it;
        }
        return arr[arr.length - 1];
      },
      shuffle: function (arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      },
      chance: (p) => rand() < p,
      chanceFrom: (arr) => arr[Math.floor(rand() * arr.length)],
      float: rand,
    };
  }

  /* ---------- 文本工具 ---------- */
  const CN_NUMS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '二十一', '二十二', '二十三', '二十四', '二十五', '二十六', '二十七', '二十八', '二十九', '三十'];

  function cnNum(n) { return CN_NUMS[n] || String(n); }

  // 替换模板中的 {var} 占位符
  function fill(tpl, vars) {
    return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
  }

  // 简单去重相邻重复句
  function dedupeText(text) {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter((line, i, arr) => {
        if (!line) return false;
        if (i > 0 && arr[i - 1] === line) return false;
        return true;
      })
      .join('\n');
  }

  // 去掉句子开头的"了""的"等病句残余
  function polish(text) {
    let t = text.trim();
    t = t.replace(/^[，。、的了么呢吧]/g, '');
    t = t.replace(/，[，。]+/g, '，');
    t = t.replace(/[。]{3,}/g, '……');
    t = t.replace(/[！]{2,}/g, '！');
    t = t.replace(/[？]{2,}/g, '？');
    t = t.replace(/([，；：])\s+/g, '$1');
    t = t.replace(/[ ]{2,}/g, ' ');
    // 文风替换后可能残留的不自然搭配：形容词 + 的 + 动词 → 尽量保留
    t = t.replace(/([的]) ([的了么呢])/g, '$1$2');
    return t.trim();
  }

  function countChars(text) {
    if (!text) return 0;
    return text.replace(/\s/g, '').length;
  }

  function truncate(text, n) {
    if (!text) return '';
    return text.length > n ? text.slice(0, n) + '…' : text;
  }

  /* ---------- DOM 帮助 ---------- */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style') node.style.cssText = v;
        else if (k === 'selected' || k === 'checked' || k === 'value') node[k] = v; // 属性赋值：setAttribute('selected', false) 会因属性存在而全选
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    if (children) {
      const list = Array.isArray(children) ? children : [children];
      for (const c of list) {
        if (c == null) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str == null ? '' : str);
    return d.innerHTML;
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function uid(prefix) {
    return (prefix || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- 时间 ---------- */
  function now() { return new Date().toLocaleString('zh-CN', { hour12: false }); }

  /* ============================================================
     本地错别字 / 重复词检查（纯规则，无 AI）
     返回 [{ type, kind, start, len, word, hint, fix }]
     type: 'dede' 的地得误用（可能）· 'repeat' 相邻重复
     注意：规则是启发式的，结果均为「疑似」，需用户自行判断
     ============================================================ */
  MQ.Typo = (() => {
    const VERBS = '跑走说道问答看望瞧盯听闻想笑哭喊叫骂打拍抓拉推拖拽跳蹦爬滚飞游唱画写读讲谈论聊劝哄逗骗吓惊怕爱恨喜怒忧愁叹点头摇头转身回头抬头低头弯腰站立坐下起身离开冲扑撞碰踢踩踏揉搓捏掐拧撕扯举抬放拿提背抱扛'.split('');
    const ADV_AFTER = ['很', '真', '太', '十分', '非常', '特别', '格外', '极', '有点', '有些', '愈发', '更加', '越来越'];
    const PRONOUNS = ['我', '你', '他', '她', '它', '我们', '你们', '他们', '她们', '它们', '咱们'];
    // 得 后接这些动词时多为「必须/能够」义（我得走了），不算误用
    const DE_VERBS = ['走', '去', '来', '说', '看', '想', '做', '干', '写', '读', '学', '练', '睡', '吃', '喝', '玩', '买', '卖', '换', '改', '修', '查', '找', '问', '答', '帮', '救', '管', '教', '训', '赶', '回', '等', '先', '再', '不', '把', '被', '跟', '和'];
    // 合法叠词 / 动词重叠白名单（相邻同字但不算错）
    const LEGIT = new Set([
      '慢慢', '渐渐', '悄悄', '轻轻', '缓缓', '紧紧', '狠狠', '明明', '偏偏', '往往', '常常', '时时', '处处', '人人', '年年', '天天', '顿顿', '步步', '层层', '阵阵', '声声', '样样', '件件', '个个', '条条', '块块', '张张', '页页', '本本', '只只', '头头', '等等', '刚刚', '仅仅',
      '白白', '黑黑', '红红', '绿绿', '蓝蓝', '黄黄', '灰灰', '高高', '低低', '长长', '短短', '远远', '近近', '深深', '浅浅', '厚厚', '薄薄', '宽宽', '窄窄', '大大', '小小', '多多', '少少', '早早', '晚晚', '快快', '好好', '坏坏', '热热', '冷冷', '暖暖', '凉凉', '甜甜', '苦苦', '酸酸', '辣辣', '香香', '臭臭', '干干', '湿湿', '软软', '硬硬', '胖胖', '瘦瘦', '稳稳', '实实', '足足', '满满', '整整', '齐齐', '短短',
      '走走', '看看', '想想', '问问', '等等', '说说', '聊聊', '听听', '读读', '写写', '画画', '唱唱', '跳跳', '拍拍', '打打', '敲敲', '点点', '摇摇', '摆摆', '晃晃', '荡荡', '念念', '叨叨', '试试', '尝尝', '摸摸', '碰碰', '歇歇', '坐坐', '站站', '躺躺', '睡睡', '逛逛', '溜溜', '转转', '瞧瞧', '瞅瞅', '望望', '嗅嗅', '舔舔', '抿抿', '眨眨', '皱皱', '搓搓', '揉揉', '拍拍', '捋捋', '擦擦', '扫扫', '拖拖', '洗洗', '涮涮', '刷刷', '浇浇', '晒晒', '收收', '理理', '整整', '补补', '钉钉', '缝缝', '绣绣', '剪剪', '削削', '切切', '炒炒', '煮煮', '炖炖', '蒸蒸', '烤烤', '煎煎', '炸炸', '拌拌', '调调', '搅搅', '倒倒', '盛盛', '端端', '递递', '传传', '抬抬', '搬搬', '挪挪', '移移', '推推', '拉拉', '拽拽', '拖拖', '抱抱', '亲亲', '搂搂', '吻吻', '掂掂', '称称', '量量', '算算', '数数', '记记', '背背', '念念', '练练', '学学', '教教', '讲讲', '演演', '练练', '跑跑', '走走', '跳跳', '蹦蹦', '游游', '飞飞', '爬爬', '滚滚', '翻翻', '转转', '绕绕', '逛逛', '遛遛',
      '哈哈', '呵呵', '嘿嘿', '嘻嘻', '嘿嘿', '哼哼', '啧啧', '嘘嘘', '呼呼', '咚咚', '叮叮', '当当', '砰砰', '啪啪', '嗒嗒', '沙沙', '哗哗', '淅淅', '沥沥', '簌簌', '嗖嗖', '嗡嗡', '隆隆', '轰轰', '哗哗', '潺潺', '汩汩', '淙淙', '啾啾', '唧唧', '呱呱', '汪汪', '喵喵', '咩咩', '哞哞', '喔喔', '咯咯', '咕咕', '嘎嘎',
    ]);

    function check(text) {
      const issues = [];
      const T = String(text || '');
      if (!T) return issues;

      /* ---- 1. 的地得误用（启发式，均为「可能」） ---- */
      for (let i = 0; i < T.length; i++) {
        const ch = T[i];
        const prev = i > 0 ? T[i - 1] : '';
        const next = i + 1 < T.length ? T[i + 1] : '';
        if (ch === '的') {
          // 的→地：后接动词，且「的」前不是动词（排除「来的人」「走的路」这类定语从句）
          if (next && VERBS.includes(next) && !(prev && VERBS.includes(prev))) {
            issues.push({ type: 'dede', kind: '的→地', start: i, len: 1, word: ch, hint: `「的」后接动词「${next}」，疑为状语误用`, fix: '地' });
          }
          // 的→得：后接程度副词（跑的真快 → 跑得真快）
          else if (next && ADV_AFTER.includes(next)) {
            issues.push({ type: 'dede', kind: '的→得', start: i, len: 1, word: ch, hint: `「的」后接程度副词「${next}」，疑为补语误用`, fix: '得' });
          }
        } else if (ch === '得') {
          // 得→的：人称代词 + 得 + 名词性内容（我得书 → 我的书），排除「我得走了」等
          if (prev && PRONOUNS.includes(prev) && next && /[\u4e00-\u9fff]/.test(next) && !DE_VERBS.includes(next) && !ADV_AFTER.includes(next)) {
            issues.push({ type: 'dede', kind: '得→的', start: i, len: 1, word: ch, hint: `「${prev}得」后接非动词，疑为「的」`, fix: '的' });
          }
        } else if (ch === '地') {
          // 地→的：人称代词 + 地 + 汉字（我地朋友 → 我的朋友）
          if (prev && PRONOUNS.includes(prev) && next && /[\u4e00-\u9fff]/.test(next)) {
            issues.push({ type: 'dede', kind: '地→的', start: i, len: 1, word: ch, hint: `「${prev}地」疑为「的」`, fix: '的' });
          }
        }
      }

      /* ---- 2. 相邻重复 ---- */
      // 2a. 单字相邻重复（长度恰为 2 的连续同字，且不在白名单）
      for (let i = 0; i < T.length - 1; i++) {
        const a = T[i], b = T[i + 1];
        if (a !== b || !/[\u4e00-\u9fff]/.test(a)) continue;
        if (T[i + 2] === a) continue; // 三连及以上（哈哈哈/好好好）视为口语叠词，跳过
        if (LEGIT.has(a + b)) continue;
        issues.push({ type: 'repeat', kind: '单字重复', start: i, len: 2, word: a + b, hint: `相邻重复「${a}${b}」，疑为手误`, fix: a });
      }
      // 2b. 双字词组重复（我们我们 / 知道知道）
      for (let i = 0; i < T.length - 3; i++) {
        const w = T.slice(i, i + 2);
        if (w !== T.slice(i + 2, i + 4)) continue;
        if (!/[\u4e00-\u9fff]/.test(w[0]) || !/[\u4e00-\u9fff]/.test(w[1])) continue;
        issues.push({ type: 'repeat', kind: '词组重复', start: i, len: 4, word: w + w, hint: `词组重复「${w}${w}」，疑为手误`, fix: w });
      }

      return issues;
    }

    return { check };
  })();

  MQ.mulberry32 = mulberry32;
  MQ.hashSeed = hashSeed;
  MQ.makeRng = makeRng;
  MQ.cnNum = cnNum;
  MQ.fill = fill;
  MQ.dedupeText = dedupeText;
  MQ.polish = polish;
  MQ.countChars = countChars;
  MQ.truncate = truncate;
  MQ.el = el;
  MQ.esc = esc;
  MQ.debounce = debounce;
  MQ.uid = uid;
  MQ.now = now;

})(window.MQ);
