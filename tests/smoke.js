/* ============================================================
   墨泉 · 全流程冒烟测试（端到端，Node 可跑）
   用法：node tests/smoke.js
   覆盖：创建设定 → 角色 → 大纲（4 模板）→ 全部正文 → 续写
        → 重写变体 → 伏笔追踪 → 错别字检查 → 持久化往返
   ============================================================ */
'use strict';

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push({ name, error: e.message }); }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ` expected ${b}, got ${a}`); }

// 模拟 window 环境 + localStorage
global.window = global;
const MQ = window.MQ = {};
MQ.now = () => new Date().toLocaleString('zh-CN', { hour12: false });
const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; },
};

require('../js/utils.js');
require('../js/store.js');
require('../js/content.js');
require('../js/prose.js');
require('../js/engine.js');
require('../js/ai.js');

console.log('\n🧪 全流程冒烟测试（端到端）');
console.log('──────────────────────────────────────');

/* ========== 1. 设定矩阵：11 题材 × 4 模板 × 6 文风 × 3 篇幅 ========== */
test('设定矩阵 11×4×6×3 全部可生成', () => {
  let count = 0;
  for (const g of MQ.Content.GENRES) {
    for (const t of MQ.Engine.TEMPLATES) {
      for (const s of Object.keys(MQ.Prose.STYLES)) {
        for (const len of ['short', 'medium', 'long']) {
          const n = MQ.Engine.generateSetup({ genre: g.id, template: t.id, style: s, length: len, seed: count++ });
          assert(n.id && n.title && n.hero && n.hero.name, `${g.id}/${t.id} 字段缺失`);
          assert(n.conflict && n.world, `${g.id} 世界观缺失`);
          assert(MQ.Engine.getTemplate(n.template).name, 'template id 有效');
        }
      }
    }
  }
  assertEq(count, 11 * 4 * 6 * 3, '组合总数');
});

/* ========== 2. 主流程：一本书从零到全部正文 ========== */
let book = null;
test('创建 → 角色 → 大纲 → 全部章节正文', () => {
  book = MQ.Engine.generateSetup({ genre: 'xianxia', template: 'hero-journey', style: 'lyric', length: 'medium', seed: 7, protagonist: '苏青' });
  assertEq(book.hero.name, '苏青', '主角名保留');
  MQ.Engine.generateCharacters(book);
  assertEq(book.characters.length, 5, '5 位角色');
  assert(book.characters.some(c => c.role === '主角') && book.characters.some(c => c.role === '对手'), '角色阵容齐全');

  MQ.Engine.generateOutline(book);
  assertEq(book.chapters.length, book.chapterCount, '大纲章节数');
  book.chapters.forEach((c, i) => {
    assert(c.title && c.summary && c.place && c.beat && c.act, `第${i}章字段齐全`);
  });

  book.chapters.forEach((c, i) => MQ.Engine.generateChapter(book, i));
  book.chapters.forEach((c, i) => {
    assert(c.text && c.wordCount > 100, `第${i}章正文为空`);
    assert(!c.text.includes('{') && !c.text.includes('}'), `第${i}章残留占位符`);
    assert(!/undefined|null/.test(c.text), `第${i}章残留 undefined`);
    // 相邻段落不重复
    const paras = c.text.split('\n').map(p => p.trim()).filter(Boolean);
    for (let k = 1; k < paras.length; k++) {
      assert(paras[k] !== paras[k - 1], `第${i}章第${k}段重复`);
    }
  });
  book.wordCount = book.chapters.reduce((s, c) => s + (c.wordCount || 0), 0);
  assert(book.wordCount > book.chapters.length * 500, '全书总字数达标');
});

/* ========== 3. 续写 ========== */
test('续写：文本增长且衔接原文', () => {
  const before = book.chapters[0].text;
  MQ.Engine.continueChapter(book, 0, before); // existingText 传当前全文，续写追加在末尾
  const after = book.chapters[0].text;
  assert(after.length > before.length + 50, '续写后增长');
  assert(after.startsWith(before.slice(0, 30)), '开头保持原文');
  assert(after.includes(before.slice(-40)), '末尾衔接原文');
});

/* ========== 4. 重写变体（换文风） ========== */
test('重写：换文风产出互异文本', () => {
  const orig = book.chapters[1].text;
  const rew = MQ.Engine.generateChapter(book, 1, 'fierce');
  assert(rew.text.length > 100, '重写稿非空');
  assert(rew.text !== orig, '重写稿与原文不同');
});

/* ========== 5. 多版本生成本章（variant 0/1/2） ========== */
test('多版本：3 个候选互不相同', () => {
  const v0 = MQ.Engine.generateChapter(book, 2, null, 0).text;
  const v1 = MQ.Engine.generateChapter(book, 2, null, 1).text;
  const v2 = MQ.Engine.generateChapter(book, 2, null, 2).text;
  assert(v0 !== v1 && v1 !== v2 && v0 !== v2, '三候选互异');
});

/* ========== 6. 伏笔追踪 ========== */
test('伏笔追踪：生成 → 手动 → 拖拽重排全链路', () => {
  const flagged = book.chapters.filter(c => c.foreshadow).length;
  assert(flagged > 0, '大纲已埋伏笔');
  assertEq(book.foreshadows.length, flagged, '追踪表与标记一致');
  book.foreshadows.forEach(f => {
    assert(f.plantIdx >= 0 && f.plantIdx < f.payoffIdx && f.payoffIdx < book.chapters.length, '索引有效');
    assert(f.desc && f.desc.length > 3, '描述非空');
  });
  // 手动埋设 + 重同步保留
  book.foreshadows.push({ id: 'fs-m-x', plantIdx: 0, payoffIdx: book.chapters.length - 1, desc: '手动伏笔' });
  MQ.Engine.syncForeshadows(book);
  assert(book.foreshadows.some(f => f.id === 'fs-m-x'), '手动条目保留');
  // 模拟拖拽重排第 0 章 → 第 3 章
  const [moved] = book.chapters.splice(0, 1);
  book.chapters.splice(3, 0, moved);
  MQ.Engine.remapForeshadows(book, 0, 3);
  book.foreshadows.forEach(f => {
    assert(f.plantIdx >= 0 && f.payoffIdx < book.chapters.length, '重排后索引仍在界内');
  });
});

/* ========== 7. 错别字检查 ========== */
test('错别字检查：对生成正文运行，偏移有效', () => {
  book.chapters.forEach((c, i) => {
    const issues = MQ.Typo.check(c.text);
    issues.forEach(x => {
      assert(x.start >= 0 && x.start + x.len <= c.text.length, `第${i}章偏移越界`);
      assert(c.text.slice(x.start, x.start + x.len) === x.word, `第${i}章命中文本一致`);
    });
  });
});

/* ========== 8. 持久化往返 ========== */
test('store：保存 → 读取 → 删除 往返一致', () => {
  MQ.Store.upsertNovel(book);
  const list = MQ.Store.getNovels();
  assert(list.some(n => n.id === book.id), '保存成功');
  const loaded = list.find(n => n.id === book.id);
  assertEq(loaded.chapters.length, book.chapters.length, '章节数一致');
  assertEq(loaded.chapters[0].text, book.chapters[0].text, '正文一致');
  assertEq(loaded.foreshadows.length, book.foreshadows.length, '伏笔表一致');
  MQ.Store.deleteNovel(book.id);
  assert(!MQ.Store.getNovels().some(n => n.id === book.id), '删除成功');
});

/* ========== 9. 自定义文风 & 字数目标 ========== */
test('自定义文风 + 每章字数目标', () => {
  const custom = { id: 'my-style', name: '暗黑流', phrases: ['夜色像泼墨。'], words: ['诡谲', '阴冷'], replace: { '非常': '贼' } };
  const n = MQ.Engine.generateSetup({ genre: 'mystery', template: 'seven-point', style: 'my-style', length: 'short', seed: 3 });
  n.customStyles = [custom];
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  n.chapters[0].targetWc = 300;
  const ch = MQ.Engine.generateChapter(n, 0, 'my-style');
  assert(ch && ch.wordCount >= 250, '自定义文风 + 目标字数生效');
});

/* ========== 10. 压力冒烟：10 题材 × 4 模板全流程 ========== */
test('冒烟压力：10 题材 × 4 模板 全流程 40 部', () => {
  let ok = 0;
  for (const g of MQ.Content.GENRES.slice(0, 10)) {
    for (const t of MQ.Engine.TEMPLATES) {
      const n = MQ.Engine.generateSetup({ genre: g.id, template: t.id, style: 'epic', length: 'short', seed: Math.floor(Math.random() * 99999) });
      MQ.Engine.generateCharacters(n);
      MQ.Engine.generateOutline(n);
      MQ.Engine.generateChapter(n, 0);
      assert(n.chapters[0].text && n.chapters[0].text.length > 100, `${g.id}/${t.id} 首章失败`);
      ok++;
    }
  }
  assertEq(ok, 40, '全部通过');
});

/* ========== 总结 ========== */
console.log('──────────────────────────────────────');
console.log(`  ✅ ${passed} passed  ❌ ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✕ ${f.name}: ${f.error}`));
  process.exitCode = 1;
}
console.log('');
