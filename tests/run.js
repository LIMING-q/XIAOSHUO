/* ============================================================
   墨泉 · 回归测试套件（Node.js）
   用法：node tests/run.js
   ============================================================ */
'use strict';

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push({ name, error: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ` expected ${b}, got ${a}`); }

// 模拟 window 环境
global.window = global;
const MQ = window.MQ = {};
MQ.now = () => new Date().toLocaleString('zh-CN', { hour12: false });

// ===== 加载模块 =====
require('../js/utils.js');
require('../js/store.js');
require('../js/content.js');
require('../js/prose.js');
require('../js/engine.js');
require('../js/ai.js');

// ===== utils.js =====
console.log('\n📦 utils.js');
test('makeRng deterministic', () => {
  const r1 = MQ.makeRng(42);
  const r2 = MQ.makeRng(42);
  assertEq(r1.int(0, 100), r2.int(0, 100), 'same seed => same output');
});
test('cnNum 1-10', () => { assertEq(MQ.cnNum(1), '一'); assertEq(MQ.cnNum(10), '十'); });
test('fill template', () => { assertEq(MQ.fill('{hero}在{place}', { hero: '叶尘', place: '山门' }), '叶尘在山门'); });
test('dedupeText adjacent', () => { assertEq(MQ.dedupeText('你好\n你好\n再见'), '你好\n再见'); });
test('polish trim', () => { assertEq(MQ.polish('  你好  '), '你好'); });
test('countChars', () => { assertEq(MQ.countChars('你好世界'), 4); assertEq(MQ.countChars('a b c'), 3); });
test('truncate', () => { assertEq(MQ.truncate('1234567890', 5), '12345…'); });
test('uid unique', () => { assert(MQ.uid('x') !== MQ.uid('x')); });
test('hashSeed stable', () => { assertEq(typeof MQ.hashSeed('test'), 'number'); });

// ===== content.js =====
console.log('\n📦 content.js');
test('11 genres', () => { assertEq(MQ.Content.GENRES.length, 11); });
test('getGenre by id', () => { assertEq(MQ.Content.getGenre('xuanhuan').name, '玄幻'); });
test('getGenre fallback', () => { assertEq(MQ.Content.getGenre('nope').name, '玄幻'); });
test('genTitle non-empty', () => {
  const g = MQ.Content.getGenre('xuanhuan');
  const rng = MQ.makeRng(1);
  assert(MQ.Content.genTitle(rng, g).length > 1);
});
test('genName in pool', () => {
  const g = MQ.Content.getGenre('wuxia');
  const rng = MQ.makeRng(2);
  assert(g.names.includes(MQ.Content.genName(rng, g)));
});
test('SCENE.open non-empty', () => {
  const g = MQ.Content.getGenre('xuanhuan');
  const rng = MQ.makeRng(3);
  assert(MQ.Content.SCENE.open(rng, g.flavor, '山门', { heroName: '叶尘' }).length > 10);
});
test('INSPIRE 22 cards', () => { assertEq(MQ.Content.INSPIRE.length, 22); });
test('INSPIRE all have beats', () => {
  MQ.Content.INSPIRE.forEach(c => assert(Array.isArray(c.beats) && c.beats.length > 0, c.tag + ' missing beats'));
});

// ===== prose.js =====
console.log('\n📦 prose.js');
test('6 built-in styles', () => { assertEq(Object.keys(MQ.Prose.STYLES).length, 6); });
test('getStyle returns object', () => { assert(MQ.Prose.getStyle('ancient').name === '古风典雅'); });
test('getStyle fallback', () => { assert(MQ.Prose.getStyle('nope').id === 'fierce'); });
test('listStyles includes builtins', () => { assert(MQ.Prose.listStyles().length >= 6); });
test('applyStyle replaces words', () => {
  const s = MQ.Prose.getStyle('ancient');
  const rng = MQ.makeRng(0);
  const t = MQ.Prose.applyStyle(s, '他看到然后离开', 'ambient', rng);
  assert(!t.includes('然后'), 'should replace 然后');
});
test('SPEECH_PROFILES 12 profiles', () => { assert(Object.keys(MQ.Prose.SPEECH_PROFILES).length >= 12); });
test('speechProfile returns profile', () => { assert(MQ.Prose.speechProfile('沉默寡言').short === 0.7); });
test('personalizeLine modifies text', () => {
  const rng = MQ.makeRng(10);
  const p = MQ.Prose.speechProfile('沉默寡言');
  const line = '叶尘：「我们走吧。」';
  const result = MQ.Prose.personalizeLine(line, p, rng);
  assert(result.length > 0);
});
test('CHAPTER_PATTERNS 14 beats', () => { assertEq(Object.keys(MQ.Prose.CHAPTER_PATTERNS).length, 14); });
test('POOL has all required', () => {
  ['acts','microActs','sensorySight','sensorySound','sensorySmell','sensoryTouch','similes',
   'innerTension','innerResolve','innerSorrow','innerFear','innerHope','innerRegret',
   'eventBeats','reveals','hooks','transitions','atmosphere'].forEach(k => {
    assert(Array.isArray(MQ.Prose.POOL[k]) && MQ.Prose.POOL[k].length > 0, 'POOL.' + k);
  });
});
test('DIALOGUES 12 scene types', () => {
  ['confront','threat','plea','confess','quarrel','comfort','banter','lastWords','reveal','silence','sideGlance'].forEach(k => {
    assert(Array.isArray(MQ.Prose.DIALOGUES[k]), 'DIALOGUES.' + k);
  });
});

// ===== engine.js =====
console.log('\n📦 engine.js');
const opts = { genre: 'xuanhuan', style: 'fierce', length: 'medium', seed: 42 };

test('generateSetup creates novel', () => {
  const n = MQ.Engine.generateSetup(opts);
  assert(n.id && n.title && n.hero && n.hero.name);
  assertEq(n.genreId, 'xuanhuan');
  assertEq(typeof n.chapterCount, 'number');
  assert(n.chapterCount >= 5);
});
test('generateCharacters 5 roles', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  assertEq(n.characters.length, 5);
  assert(n.characters.some(c => c.role === '主角'));
  assert(n.characters.some(c => c.role === '对手'));
  assert(n.characters.some(c => c.role === '引路人'));
});
test('generateOutline correct count', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  assertEq(n.chapters.length, n.chapterCount);
});
test('generateChapter produces text', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  const ch = MQ.Engine.generateChapter(n, 0);
  assert(ch && ch.text && ch.text.length > 100, 'chapter text too short');
  assert(ch.wordCount > 200, 'word count too low');
});
test('generateChapter respects targetWc', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  n.chapters[0].targetWc = 500;
  const ch = MQ.Engine.generateChapter(n, 0);
  assert(ch.wordCount >= 400, 'targetWc 500 => minimally 400 chars');
});
test('continueChapter appends', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  MQ.Engine.generateChapter(n, 0);
  const before = n.chapters[0].text;
  MQ.Engine.continueChapter(n, 0, before);
  assert(n.chapters[0].text.length > before.length + 50);
});
test('continueChapter with mood', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  MQ.Engine.generateChapter(n, 0);
  const before = n.chapters[0].text;
  MQ.Engine.continueChapter(n, 0, before, null, 0, '心理描写');
  assert(n.chapters[0].text.length > before.length + 30);
});
test('randomInspire returns card', () => {
  const n = MQ.Engine.generateSetup(opts);
  const card = MQ.Engine.randomInspire(n);
  assert(card.tag && card.text);
});
test('contextAwareInspire filters by beat', () => {
  const n = MQ.Engine.generateSetup(opts);
  const cards = MQ.Engine.contextAwareInspire(n, 'climax', 3);
  assertEq(cards.length, 3);
});
test('contextAwareInspire no beat = still 3', () => {
  const n = MQ.Engine.generateSetup(opts);
  const cards = MQ.Engine.contextAwareInspire(n, null, 3);
  assertEq(cards.length, 3);
});
test('syncForeshadows builds from chapter flags', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  const flagged = n.chapters.filter(c => c.foreshadow).length;
  assert(flagged > 0, 'outline should plant foreshadows');
  assertEq(n.foreshadows.length, flagged, 'one tracking entry per flagged chapter');
  n.foreshadows.forEach(f => {
    assert(f.plantIdx >= 0 && f.plantIdx < f.payoffIdx, 'plant must precede payoff');
    assert(f.desc && f.desc.length > 3, 'desc present');
  });
});
test('syncForeshadows preserves manual entries', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  const before = n.foreshadows.length;
  n.foreshadows.push({ id: 'fs-m-1', plantIdx: 0, payoffIdx: n.chapters.length - 1, desc: '手动埋设' });
  MQ.Engine.syncForeshadows(n);
  assert(n.foreshadows.some(f => f.id === 'fs-m-1'), 'manual entry survives sync');
  assertEq(n.foreshadows.length, before + 1);
});
test('syncForeshadows keeps desc on re-sync', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  const first = n.foreshadows[0];
  first.desc = '定制的伏笔描述';
  MQ.Engine.syncForeshadows(n);
  const again = n.foreshadows.find(f => f.plantIdx === first.plantIdx && f.payoffIdx === first.payoffIdx);
  assertEq(again.desc, '定制的伏笔描述');
});
test('remapForeshadows shifts indices after drag', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  const fs = n.foreshadows;
  // 模拟拖拽：第 1 章移到第 5 章（from=1, target=5，同 app.js 的 splice 后目标计算）
  const from = 1, target = 5;
  const [moved] = n.chapters.splice(from, 1);
  n.chapters.splice(target, 0, moved);
  const shift = (x) => {
    if (x === from) return target;
    if (from < x && target >= x) return x - 1;
    if (from > x && target <= x) return x + 1;
    return x;
  };
  const orig = fs.map(f => ({ plantIdx: f.plantIdx, payoffIdx: f.payoffIdx }));
  MQ.Engine.remapForeshadows(n, from, target);
  fs.forEach((f, i) => {
    assertEq(f.plantIdx, shift(orig[i].plantIdx), 'plantIdx remapped');
    assertEq(f.payoffIdx, shift(orig[i].payoffIdx), 'payoffIdx remapped');
  });
  // 章节索引仍有效
  fs.forEach(f => {
    assert(f.plantIdx >= 0 && f.payoffIdx < n.chapters.length, 'indices in range');
  });
});

test('remapForeshadows no-ops without list', () => {
  const n = MQ.Engine.generateSetup(opts);
  n.foreshadows = undefined;
  MQ.Engine.remapForeshadows(n, 0, 1);
  assert(true);
});
test('resolveChapterCount', () => {
  assertEq(MQ.Engine.generateSetup({ ...opts, chapters: '20' }).chapterCount, 20);
});

// ===== typo 检查（utils.js）=====
console.log('\n🔍 typo check');
test('typo 的→地 (高兴的笑了)', () => {
  const r = MQ.Typo.check('他高兴的笑了');
  assert(r.some(x => x.type === 'dede' && x.kind === '的→地' && x.fix === '地'), '的+动词 flagged');
});
test('typo 的→得 (跑的真快)', () => {
  const r = MQ.Typo.check('他跑的真快');
  assert(r.some(x => x.type === 'dede' && x.kind === '的→得' && x.fix === '得'), '的+程度副词 flagged');
});
test('typo 得→的 (我得书)', () => {
  const r = MQ.Typo.check('我得书丢了');
  assert(r.some(x => x.type === 'dede' && x.kind === '得→的'), '人称+得+名词 flagged');
});
test('typo 不误报 我得走了', () => {
  const r = MQ.Typo.check('我得走了');
  assert(!r.some(x => x.type === 'dede' && x.kind === '得→的'), '得+动词不误报');
});
test('typo 地→的 (我地朋友)', () => {
  const r = MQ.Typo.check('我地朋友来了');
  assert(r.some(x => x.type === 'dede' && x.kind === '地→的'), '人称+地 flagged');
});
test('typo 相邻单字重复', () => {
  const r = MQ.Typo.check('他他走了');
  assert(r.some(x => x.type === 'repeat' && x.word === '他他'), 'adjacent dup flagged');
});
test('typo 不误报叠词 (慢慢)', () => {
  const r = MQ.Typo.check('他慢慢走过去');
  assert(!r.some(x => x.type === 'repeat' && x.word === '慢慢'), 'legit 叠词 not flagged');
});
test('typo 三连不误报 (哈哈哈)', () => {
  const r = MQ.Typo.check('哈哈哈');
  assert(!r.some(x => x.type === 'repeat'), 'laugh reduplication not flagged');
});
test('typo 双字词组重复 (我们我们)', () => {
  const r = MQ.Typo.check('我们我们一起去');
  assert(r.some(x => x.type === 'repeat' && x.kind === '词组重复' && x.word === '我们我们'), 'word-pair dup flagged');
});
test('typo 干净文本无命中', () => {
  const r = MQ.Typo.check('他慢慢地走过长街，心里想着明天。');
  assert(r.length === 0, 'clean text has no issues');
});

// ===== ai.js =====
console.log('\n🤖 ai.js');
test('extractJSON object (with array value)', () => {
  const r = MQ.AI.extractJSON('{"summary":"好","issues":[{"type":"时间线","severity":"高"}]}');
  assert(r && r.summary === '好' && Array.isArray(r.issues) && r.issues[0].type === '时间线', 'object parsed whole, array value intact');
});
test('extractJSON array', () => {
  const r = MQ.AI.extractJSON('[{"a":1},{"a":2}]');
  assert(Array.isArray(r) && r.length === 2, 'array parsed');
});
test('extractJSON leading prose + code fence', () => {
  const r = MQ.AI.extractJSON('以下是结果：\n```json\n{"rhythm":"好","dialogue":"妙"}\n```\n以上。');
  assert(r && r.rhythm === '好', 'object with prose and fence parsed');
});
test('extractJSON garbage returns null', () => {
  assert(MQ.AI.extractJSON('这里没有 JSON') === null, 'null on garbage');
});

// ===== 边界场景 =====
console.log('\n🧱 边界场景');

// --- utils.js 边界 ---
test('countChars empty/null', () => {
  assertEq(MQ.countChars(''), 0);
  assertEq(MQ.countChars(null), 0);
  assertEq(MQ.countChars(undefined), 0);
});
test('cnNum 0-30 Chinese, beyond digits', () => {
  assertEq(MQ.cnNum(0), '零');
  assertEq(MQ.cnNum(11), '十一');
  assertEq(MQ.cnNum(20), '二十');
  assertEq(MQ.cnNum(30), '三十');
  // 31+ 回退为阿拉伯数字（覆盖表限定 0-30，属设计行为）
  assertEq(MQ.cnNum(31), '31');
  assertEq(MQ.cnNum(100), '100');
});
test('dedupeText no dups unchanged', () => {
  const t = '一行\n二行\n三行';
  assertEq(MQ.dedupeText(t), t);
});
test('fill missing key leaves placeholder', () => {
  assertEq(MQ.fill('{hero}在{place}', { hero: '叶尘' }), '叶尘在{place}');
});
test('makeRng bounds min==max', () => {
  const rng = MQ.makeRng(1);
  assertEq(rng.int(7, 7), 7);
});
test('truncate shorter than limit unchanged', () => {
  assertEq(MQ.truncate('短', 10), '短');
  assertEq(MQ.truncate('', 3), '');
});

// --- engine.js 边界 ---
test('resolveChapterCount clamps to [5, 9999]', () => {
  assertEq(MQ.Engine.resolveChapterCount({ chapterCount: '0' }), 5);
  assertEq(MQ.Engine.resolveChapterCount({ chapterCount: '-3' }), 5);
  assertEq(MQ.Engine.resolveChapterCount({ chapterCount: '99999' }), 9999);
  assertEq(MQ.Engine.resolveChapterCount({ chapterCount: 'abc' }), 16);
  assertEq(MQ.Engine.resolveChapterCount({ length: 'short' }), 9);
  assertEq(MQ.Engine.resolveChapterCount({ length: 'long' }), 26);
  assertEq(MQ.Engine.resolveChapterCount({ length: 'medium' }), 16);
});
test('generateSetup chapters=5 (MIN) works', () => {
  const n = MQ.Engine.generateSetup({ ...opts, chapters: '5' });
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  assertEq(n.chapters.length, 5);
});
test('generateSetup chapters=9999 outline no crash', () => {
  const n = MQ.Engine.generateSetup({ ...opts, chapters: '9999' });
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  assertEq(n.chapters.length, 9999);
  assert(n.chapters[0].title.length > 0);
  assert(n.chapters[9998].title.length > 0);
});
test('generateChapter out-of-range returns null', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  assert(MQ.Engine.generateChapter(n, 999) === null);
  assert(MQ.Engine.generateChapter(n, -1) === null);
});
test('generateChapter invalid style falls back', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  const ch = MQ.Engine.generateChapter(n, 0, 'no-such-style');
  assert(ch && ch.text && ch.text.length > 100, 'fallback style still generates');
});
test('generateChapter regenerates over empty text', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  n.chapters[0].text = '';
  const ch = MQ.Engine.generateChapter(n, 0);
  assert(ch.text.length > 100);
});
test('multi-version variants differ', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateOutline(n);
  const a = MQ.Engine.generateChapter(n, 0, null, 0).text;
  const b = MQ.Engine.generateChapter(n, 0, null, 1).text;
  const c = MQ.Engine.generateChapter(n, 0, null, 2).text;
  assert(a !== b && b !== c && a !== c, 'three variants distinct');
});
test('generateCharacters idempotent twice', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  MQ.Engine.generateCharacters(n);
  assertEq(n.characters.length, 5);
});
test('all 4 narrative templates generate valid outline', () => {
  ['three-act', 'hero-journey', 'seven-point', 'save-cat'].forEach(tid => {
    const n = MQ.Engine.generateSetup({ ...opts, template: tid });
    MQ.Engine.generateCharacters(n);
    MQ.Engine.generateOutline(n);
    assertEq(n.chapters.length, n.chapterCount, tid + ' count');
    n.chapters.forEach((c, i) => {
      assert(c.title && c.summary && c.beat, tid + ' ch' + i + ' fields');
    });
  });
});
test('randomSetupPrefill returns valid ids', () => {
  const p = MQ.Engine.randomSetupPrefill();
  assert(MQ.Content.getGenre(p.genre).name.length > 0);
  assert(MQ.Prose.getStyle(p.style).name.length > 0);
  assert(MQ.Engine.TEMPLATES.some(t => t.id === p.template));
  assert(p.chapters >= 6 && p.chapters <= 30);
});
test('custom places pool used by outline', () => {
  const n = MQ.Engine.generateSetup(opts);
  MQ.Engine.generateCharacters(n);
  n.places = [{ name: '甲地' }, { name: '乙地' }, { name: '丙地' }];
  MQ.Engine.generateOutline(n);
  n.chapters.forEach(c => assert(['甲地', '乙地', '丙地'].includes(c.place), 'place from custom pool'));
});
test('syncForeshadows on empty chapters safe', () => {
  const n = MQ.Engine.generateSetup(opts);
  n.chapters = [];
  const r = MQ.Engine.syncForeshadows(n);
  assert(Array.isArray(r) && r.length === 0);
  n.chapters = null;
  assert(Array.isArray(MQ.Engine.syncForeshadows(n)));
});
test('contextAwareInspire unknown beat falls back', () => {
  const n = MQ.Engine.generateSetup(opts);
  assertEq(MQ.Engine.contextAwareInspire(n, 'no-such-beat', 3).length, 3);
});

// --- prose.js 边界 ---
test('all 6 styles have phrases', () => {
  Object.entries(MQ.Prose.STYLES).forEach(([id, s]) => {
    assert(Array.isArray(s.phrases) && s.phrases.length > 0, id + ' phrases');
  });
});
test('all 11 dialogue scenes have scripts', () => {
  Object.entries(MQ.Prose.DIALOGUES).forEach(([scene, scripts]) => {
    assert(Array.isArray(scripts) && scripts.length > 0, scene + ' scripts');
  });
});

// --- typo 边界 ---
test('typo check empty/null safe', () => {
  assertEq(MQ.Typo.check('').length, 0);
  assertEq(MQ.Typo.check(null).length, 0);
  assertEq(MQ.Typo.check('abc 123 !!!').length, 0);
});
test('typo 的地得 at string start', () => {
  const r = MQ.Typo.check('的笑了');
  assert(r.some(x => x.type === 'dede'), 'leading 的 flagged');
});

// --- ai.js 边界 ---
test('extractJSON empty/garbage', () => {
  assert(MQ.AI.extractJSON('') === null);
  assert(MQ.AI.extractJSON(null) === null);
  assert(MQ.AI.extractJSON('[]') !== null && MQ.AI.extractJSON('[]').length === 0, 'empty array');
  assert(MQ.AI.extractJSON('{}') !== null, 'empty object');
});
test('extractJSON object before stray brackets', () => {
  const r = MQ.AI.extractJSON('{"issues":[{"a":1}],"x":"[注]"}');
  assert(r && Array.isArray(r.issues) && r.issues[0].a === 1, 'whole object with array values');
});

// ===== 压力测试：10题材 × 6文风 × 3长度 = 180组合，各生成1章 =====
console.log('\n🔥 压力测试 (10 genres × 6 styles × 3 lengths)');
const genres = MQ.Content.GENRES.map(g => g.id).slice(0, 10);
const styles = Object.keys(MQ.Prose.STYLES);
const lengths = ['short', 'medium', 'long'];
let stressFail = 0;

for (const genre of genres) {
  for (const style of styles) {
    for (const length of lengths) {
      try {
        const n = MQ.Engine.generateSetup({ genre, style, length, seed: Date.now() % 99999 });
        MQ.Engine.generateCharacters(n);
        MQ.Engine.generateOutline(n);
        MQ.Engine.generateChapter(n, 0);
        if (!n.chapters[0].text || n.chapters[0].wordCount < 100) {
          stressFail++;
          console.log(`  FAIL: ${genre}/${style}/${length} wordCount=${n.chapters[0].wordCount}`);
        }
      } catch (e) {
        stressFail++;
        console.log(`  CRASH: ${genre}/${style}/${length}: ${e.message}`);
      }
    }
  }
}
test(`pressure 180 combos`, () => { assertEq(stressFail, 0); });

// ===== 总结 =====
console.log(`\n${'='.repeat(50)}`);
console.log(`  ✅ ${passed} passed  ❌ ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✕ ${f.name}: ${f.error}`));
}
console.log(`${'='.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
