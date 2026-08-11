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
    t = t.replace(/^[，。、的了么呢]/g, '');
    t = t.replace(/，[，。]+/g, '，');
    t = t.replace(/[。]{3,}/g, '……');
    t = t.replace(/([，；：])\s+/g, '$1');
    t = t.replace(/[ ]{2,}/g, ' ');
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
