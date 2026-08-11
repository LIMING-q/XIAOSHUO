/* ============================================================
   墨泉 · 本地智能生成引擎
   设定 / 角色 / 大纲 / 正文 / 续写
   ============================================================ */
(function (MQ) {
  'use strict';

  const C = () => MQ.Content;
  const P = () => MQ.Prose;

  const MIN_CHAPTERS = 5;
  const MAX_CHAPTERS = 9999;

  // 解析目标章节数：显式 chapterCount 优先，否则按旧 length 字段换算（兼容存量数据）
  function resolveChapterCount(novel) {
    const n = parseInt(novel.chapterCount, 10);
    if (Number.isFinite(n)) return Math.max(MIN_CHAPTERS, Math.min(MAX_CHAPTERS, n));
    return novel.length === 'short' ? 9 : novel.length === 'long' ? 26 : 16;
  }

  /* ============================================================
     人物素材库
     ============================================================ */
  const PERSONAS = [
    { outer: '沉默寡言', inner: '外冷内热', say: '话不多，但每一句都落在点子上。' },
    { outer: '锋芒毕露', inner: '心思缜密', say: '嘴上不饶人，心里却比谁都清醒。' },
    { outer: '温和宽厚', inner: '外柔内刚', say: '总替别人着想，可一旦决定，九头牛也拉不回。' },
    { outer: '玩世不恭', inner: '重情重义', say: '看着没个正形，关键时刻却最靠得住。' },
    { outer: '孤僻冷傲', inner: '柔软敏感', say: '习惯与人保持距离，其实比谁都害怕失去。' },
    { outer: '机灵圆滑', inner: '极有主见', say: '见人说人话，可从不违背自己的底线。' },
    { outer: '莽撞冲动', inner: '赤诚坦荡', say: '容易上头，但从不背后捅刀。' },
    { outer: '冷静克制', inner: '暗藏锋芒', say: '习惯把情绪压进心底，动手时毫不留情。' },
  ];

  const HERO_ARCS = [
    { flaw: '遇事总想独自扛，把亲近的人推得越来越远', turn: '在失去重要之物后第一次学会求助', end: '明白了并肩同行远比孤身奋战更有力量' },
    { flaw: '生性怯懦，习惯逆来顺受', turn: '在触及底线的那一刻，第一次选择反抗', end: '不再是那个任人拿捏的人，成了他人的依靠' },
    { flaw: '天真单纯，轻信每一个人', turn: '被最信任的人背叛后，变得草木皆兵', end: '在仇恨与信任之间找回平衡，学会分辨真心' },
    { flaw: '执拗认死理，不懂变通', turn: '撞了南墙，险些万劫不复', end: '终于明白真正的坚持不是蛮干，而是守住本心的迂回' },
    { flaw: '心高气傲，看不起不如自己的人', turn: '在一次惨败中被最看不起的人所救', end: '懂得了敬畏，也放下了身段' },
    { flaw: '优柔寡断，关键时刻总是迟疑', turn: '因一次迟疑酿成大错', end: '学会了在恰当的时候，果断做出选择' },
  ];

  const ALLY_ARCS = [
    '起初只是利益同盟，后来成了过命的交情',
    '藏着一个秘密，直到最后关头才坦白',
    '从看笑话到真心相待，见证彼此成长',
    '有过一次误会与决裂，最终冰释前嫌',
  ];

  const FOE_ARCS = [
    '恩怨源于上一辈，本无对错，只是立场不同',
    '曾经是并肩的人，因一次抉择分道扬镳',
    '看似冷酷无情，内心却藏着无法言说的执念',
    '步步为营，算尽人心，最终败在自己的算盘上',
  ];

  const BODY = [
    '身形修长，目光沉静', '眉眼锋利，气势迫人', '面容清俊，常带三分笑意',
    '身材魁梧，站在那里像一堵墙', '身形单薄，却透着股韧劲', '五官深邃，周身气息很冷',
    '一双眼睛极亮，像藏着光', '旧衣洗得发白，腰杆却挺得笔直', '额角有一道旧疤，举止从容',
  ];

  const APPEARANCE_DETAIL = [
    '腰间挂着一把旧剑，剑鞘磨得发亮', '手上总有洗不掉的墨迹', '掌心的老茧厚实，是常年练功留下的',
    '衣领下藏着一枚褪色的护身符', '随身带着一方旧手帕，边角绣着一个字', '习惯性地摩挲着腕上的旧绳结',
    '肩上总挎着个旧包袱，从不离身', '笑起来时，眼角的纹路很深', '走路很轻，落地几乎没有声音',
  ];

  const GOALS = [
    '找出当年那件事的真相', '守护身后在乎的人', '洗清背负的冤屈', '完成先人未竟的遗愿',
    '在乱世中活下去，并让身边人也活下去', '向曾经伤害过自己的人讨一个公道', '证明自己走过的路没有错',
  ];

  /* ============================================================
     生成小说设定
     ============================================================ */
  function generateSetup(opts) {
    const genre = C().getGenre(opts.genre);
    const rng = MQ.makeRng(opts.seed || Date.now());
    const protagonist = (opts.protagonist || '').trim() || C().genName(rng, genre);
    const title = (opts.title || '').trim() || C().genTitle(rng, genre);
    const conflict = (opts.conflict || '').trim() || rng.pick(genre.conflicts);
    const world = (opts.world || '').trim() || rng.pick(genre.worlds);
    const identity = rng.pick(genre.identities);
    const persona = rng.pick(PERSONAS);
    // 章节数：显式传入优先；否则按旧篇幅字段换算，保证老调用行为不变
    const chaptersNum = (() => {
      const v = parseInt(opts.chapters, 10);
      if (Number.isFinite(v)) return Math.max(MIN_CHAPTERS, Math.min(MAX_CHAPTERS, v));
      return resolveChapterCount(opts);
    })();

    const hero = {
      id: 'hero',
      name: protagonist,
      role: '主角',
      identity,
      personaOuter: persona.outer,
      personaInner: persona.inner,
      personaSay: persona.say,
      body: rng.pick(BODY) + '，' + rng.pick(APPEARANCE_DETAIL),
      backstory: backstoryFor(rng, genre, identity, world),
      goal: rng.pick(GOALS),
      flaw: rng.pick(HERO_ARCS).flaw,
      arc: rng.pick(HERO_ARCS),
      side: 'hero',
    };

    return {
      id: MQ.uid('novel'),
      title,
      genreId: genre.id,
      genreName: genre.name,
      genreIcon: genre.icon,
      styleId: opts.style || 'fierce',
      length: opts.length || 'medium', // 旧字段，兼容存量数据
      chapterCount: chaptersNum,
      seed: opts.seed || Date.now(),
      protagonist,
      identity,
      conflict,
      world,
      hero,
      createdAt: MQ.now(),
      updatedAt: MQ.now(),
      chapters: [],
      characters: [],
      wordCount: 0,
      placeholder: null, // AI 设定生成的占位（由 ai.js 填充）
    };
  }

  function backstoryFor(rng, genre, identity, world) {
    const w = (world || '').split('。')[0];
    const pieces = [
      `${identity}出身卑微，在「${w}」的时代里，本不该有任何波澜。然而命运偏偏选中了他。`,
      `作为${identity}，他本可以安于一隅。可那个秘密，像一根刺，扎在心里许多年，怎么也拔不出来。`,
      `没有人知道，这个不起眼的${identity}，身上背负着怎样沉重的过往。`,
    ];
    return rng.pick(pieces);
  }

  /* ============================================================
     生成角色卡（主角团 + 对手 + 导师）
     ============================================================ */
  function generateCharacters(novel) {
    const rng = MQ.makeRng(novel.seed + 101);
    const genre = C().getGenre(novel.genreId);
    const chars = [novel.hero];

    // 2 个盟友
    const allyNames = [];
    for (let i = 0; i < 2; i++) {
      const name = uniqueName(rng, genre, allyNames);
      allyNames.push(name);
      const allyType = rng.pick(genre.sideKicks);
      const persona = rng.pick(PERSONAS);
      chars.push({
        id: MQ.uid('ch'),
        name,
        role: i === 0 ? '主盟友' : '盟友',
        identity: allyType,
        personaOuter: persona.outer,
        personaInner: persona.inner,
        personaSay: persona.say,
        body: rng.pick(BODY) + '，' + rng.pick(APPEARANCE_DETAIL),
        backstory: `他是${allyType}，与${novel.hero.name}相识于微末，一路互相扶持。`,
        goal: rng.pick(GOALS),
        flaw: rng.pick(HERO_ARCS).flaw,
        arc: rng.pick(ALLY_ARCS),
        side: 'ally',
      });
    }

    // 1 个对手
    {
      const name = uniqueName(rng, genre, allyNames);
      allyNames.push(name);
      const foeType = rng.pick(genre.foes);
      const persona = rng.pick(PERSONAS);
      chars.push({
        id: MQ.uid('ch'),
        name,
        role: '对手',
        identity: foeType,
        personaOuter: persona.outer,
        personaInner: persona.inner,
        personaSay: persona.say,
        body: rng.pick(BODY) + '，' + rng.pick(APPEARANCE_DETAIL),
        backstory: `他是${foeType}，与${novel.hero.name}站在了命运的两端。`,
        goal: rng.pick(GOALS),
        flaw: rng.pick(HERO_ARCS).flaw,
        arc: rng.pick(FOE_ARCS),
        side: 'foe',
      });
    }

    // 1 位导师/长者
    {
      const name = uniqueName(rng, genre, allyNames);
      const persona = rng.pick(PERSONAS);
      chars.push({
        id: MQ.uid('ch'),
        name,
        role: '引路人',
        identity: rng.pick(['看破红尘的长者', '守口如瓶的老者', '云游四方的怪人', '掌管旧案的人']),
        personaOuter: persona.outer,
        personaInner: persona.inner,
        personaSay: persona.say,
        body: rng.pick(BODY) + '，' + rng.pick(APPEARANCE_DETAIL),
        backstory: `他知道很多秘密，却总说「时候未到」。${novel.hero.name}的许多疑问，只有他能解答。`,
        goal: '守护那个藏了很多年的秘密',
        flaw: '太过谨慎，错过了最好的时机',
        arc: '从旁观者到入局者，最终为真相点燃了那盏灯',
        side: 'ally',
      });
    }

    novel.characters = chars;
    return chars;
  }

  function uniqueName(rng, genre, used) {
    let name;
    let guard = 0;
    do {
      name = C().genName(rng, genre);
      guard++;
    } while (used.includes(name) && guard < 30);
    return name;
  }

  /* ============================================================
     大纲生成（三幕结构）
     ============================================================ */
  const BEAT_TITLES = {
    intro:    ['风起', '序章 · {place}', '一粒尘埃'],
    daily:    ['旧日', '寻常一日', '暗流'],
    incite:   ['惊变', '夜半钟声', '裂痕'],
    depart:   ['启程', '背水一战', '离开{place}'],
    explore:  ['试水', '初窥门径', '{place}见闻'],
    meet:     ['相识', '并肩', '{ally}出现'],
    trial:    ['试炼', '命悬一线', '第一次失败'],
    approach: ['逼近', '{place}的秘密', '线索'],
    low:      ['绝境', '至暗时刻', '一无所有'],
    rally:    ['转机', '重整旗鼓', '雪中送炭'],
    climax:   ['决战', '终局之战', '最后一搏'],
    cost:     ['代价', '牺牲', '告别'],
    resolve:  ['尘埃落定', '真相大白', '还愿'],
    after:    ['尾声', '来日方长', '新生'],
  };

  const BEAT_SUMMARIES = {
    intro:    '{hero}在{place}过着看似平静的日子。直到某个寻常的午后，{event}，命运的齿轮悄然转动。',
    daily:    '平静的表象之下暗流涌动。{hero}察觉到一些反常之处，而身边人似乎都有所隐瞒。',
    incite:   '{event}。{hero}被迫卷入漩涡中心，过去的安稳一去不返，他第一次正视自己将要面对的东西。',
    depart:   '{hero}做出抉择，离开熟悉的{place}。前路未卜，但他已没有回头路可走。',
    explore:  '新的天地向{hero}敞开。在{place}，他见识了前所未见的事物，也第一次触碰到了真相的边缘。',
    meet:     '{hero}与{ally}相遇。亦敌亦友的关系就此展开，而{ally}身上，藏着解开谜题的关键。',
    trial:    '一场硬仗摆在眼前。{hero}全力以赴，却仍是败下阵来——这让他看清了自己与目标之间的差距。',
    approach: '线索指向{place}。{hero}循着蛛丝马迹步步紧逼，真相的轮廓越来越清晰，危险也随之迫近。',
    low:      '最坏的事情发生了。{hero}失去了最重要的倚仗，跌入谷底。那些一直支撑着他的信念，开始动摇。',
    rally:    '绝境之中，一线生机乍现。{hero}收拾起破碎的意志，找到了新的力量，也重新找回了方向。',
    climax:   '所有的恩怨与真相，在{place}汇聚成一场终局。{hero}赌上一切，迎战最后的敌人。',
    cost:     '胜利的代价终于显现。{hero}得到了他想要的答案，却也失去了无法挽回的东西。',
    resolve:  '尘埃落定。真相大白于天下，{hero}与所有人完成了和解，也完成了与自己的和解。',
    after:    '风波过后，生活归于平静。{hero}回首来路，那些痛过的、笑过的日子，都成了岁月里最亮的光。',
  };

  function generateOutline(novel) {
    const rng = MQ.makeRng(novel.seed + 202);
    const genre = C().getGenre(novel.genreId);
    const total = resolveChapterCount(novel);

    // 骨架 beat 序列（三幕比例 ~ 25% / 50% / 25%，每幕至少 1 章）
    const skeleton = [];
    let act1n = Math.max(1, Math.round(total * 0.25));
    let act3n = Math.max(1, Math.round(total * 0.25));
    let act2n = Math.max(1, total - act1n - act3n);
    if (act1n + act2n + act3n > total) act1n -= (act1n + act2n + act3n - total);

    const act1Beats = ['intro', 'daily', 'incite', 'depart'];
    const act2Beats = ['explore', 'meet', 'trial', 'approach', 'low', 'rally', 'explore', 'approach'];
    const act3Beats = ['climax', 'cost', 'resolve', 'after'];

    const fill = (pool, n) => {
      const out = [];
      for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
      return out;
    };

    skeleton.push(...fill(act1Beats, act1n));
    skeleton.push(...fill(act2Beats, act2n));
    skeleton.push(...fill(act3Beats, act3n));
    // 保证首尾正确
    skeleton[0] = 'intro';
    skeleton[skeleton.length - 1] = 'after';
    if (skeleton.length > 2) skeleton[skeleton.length - 2] = 'resolve';
    if (skeleton.length > 3) skeleton[skeleton.length - 3] = 'cost';

    // 伏笔：中段埋 2 个，尾段回收
    const mid = Math.floor(skeleton.length / 2);
    const foreshadowIdx = [];
    for (let i = 3; i < Math.min(mid, skeleton.length - 4); i++) {
      if (foreshadowIdx.length < 2 && rng.chance(0.55)) foreshadowIdx.push(i);
    }
    if (foreshadowIdx.length === 0 && skeleton.length > 6) foreshadowIdx.push(4);

    const placeTrack = [genre.places[0], rng.pick(genre.places), rng.pick(genre.places)];
    let placeIdx = 0;
    const usedEvents = new Set();

    const chapters = skeleton.map((beat, i) => {
      const event = pickEvent(rng, genre, usedEvents);
      placeIdx = (i > 0 && (beat === 'explore' || beat === 'approach' || beat === 'climax' || beat === 'depart'))
        ? Math.min(placeIdx + (rng.chance(0.6) ? 1 : 0), placeTrack.length - 1) : placeIdx;
      const place = placeTrack[placeIdx];
      const isPayoff = foreshadowIdx.includes(i - 1);
      const title = MQ.fill(rng.pick(BEAT_TITLES[beat]), {
        place,
        ally: novel.characters[1] ? novel.characters[1].name : '故人',
      });
      const summary = MQ.fill(BEAT_SUMMARIES[beat], {
        hero: novel.hero.name,
        place,
        event,
        ally: novel.characters[1] ? novel.characters[1].name : '一位故人',
      });
      const act = i < Math.round(total * 0.25) ? 1 : i < Math.round(total * 0.75) ? 2 : 3;
      return {
        idx: i,
        beat,
        act,
        title,
        summary,
        event,
        place,
        foreshadow: isPayoff,
        text: '',
        wordCount: 0,
      };
    });

    novel.chapters = chapters;
    novel.wordCount = 0;
    return chapters;
  }

  function pickEvent(rng, genre, usedEvents) {
    const pool = genre.events.filter(e => !usedEvents.has(e));
    const ev = (pool.length ? pool : genre.events)[rng.int(0, (pool.length || genre.events.length) - 1)];
    usedEvents.add(ev);
    return ev;
  }

  /* ============================================================
     正文生成（状态机 + 段落生产器）
     ============================================================ */
  function generateChapter(novel, idx, styleId) {
    const chapter = novel.chapters[idx];
    if (!chapter) return null;

    const rng = MQ.makeRng(novel.seed + 300 + idx * 17);
    const genre = C().getGenre(novel.genreId);
    const style = P().getStyle(styleId || novel.styleId);

    // 状态（携带角色对象，供性格化台词使用）
    const others = novel.characters.filter(c => c.id !== 'hero');
    const other = others.length ? others[rng.int(0, others.length - 1)] : null;
    const state = {
      hero: novel.hero.name,
      heroChar: novel.hero || null,
      otherName: other ? other.name : '对方',
      otherChar: other || null,
      place: chapter.place || rng.pick(genre.places),
      lastEvent: chapter.event,
    };

    const pattern = P().CHAPTER_PATTERNS[chapter.beat] || P().CHAPTER_PATTERNS.daily;
    const paragraphs = [];
    const usedKeys = new Set();
    state.usedEvents = new Set([chapter.event]);
    let foreshadowUsed = false;

    // 段落唯一性检查：段内每一句（按换行拆分）记录前 12 字指纹，命中即视为重复
    function addPara(text, at) {
      const keys = text.split('\n').filter(Boolean).map(s => s.slice(0, 12));
      if (keys.some(k => usedKeys.has(k))) return false;
      keys.forEach(k => usedKeys.add(k));
      if (at == null) paragraphs.push(text);
      else paragraphs.splice(at, 0, text);
      return true;
    }

    for (const step of pattern) {
      const [name, arg] = step.split(':');
      let out = '';
      if (name === 'inner') out = P().PRODUCERS.inner({ rng, state }, arg);
      else if (name === 'dialogue') out = P().PRODUCERS.dialogue({ rng, state }, arg);
      else if (name === 'fight') out = P().PRODUCERS.fight({ rng, state }, arg);
      else out = P().PRODUCERS[name]({ rng, novel, genre, state });

      if (out) {
        const polished = P().applyStyle(style, MQ.polish(out));
        if (addPara(polished)) {
          // 伏笔回收：在揭示型段落后插入真相段
          if (chapter.foreshadow && !foreshadowUsed && (name === 'reveal' || name === 'event' || name === 'climax')) {
            const foreshadowText = [
              `谜底揭开的那一刻，{hero}忽然想起很久以前的一个细节——那个一直被忽略的画面，此刻清晰地浮现在眼前。原来所有的伏笔，从那时起就已经埋下。`.replace('{hero}', state.hero),
              `许多往事在脑中轰然贯通。{hero}终于明白，这一路走来所遇见的每一个人、每一件事，都在指向同一个答案。`.replace('{hero}', state.hero),
            ];
            if (addPara(P().applyStyle(style, MQ.polish(rng.pick(foreshadowText))))) {
              foreshadowUsed = true;
            }
          }
        }
      }
    }

    // 收尾钩子
    addPara(P().applyStyle(style, MQ.polish(P().PRODUCERS.close({ rng, state }))));

    // 长度保险：正文不足 750 字时，中段补充氛围/日常/心理/事件段（去重后仍不足则继续）
    const fillers = ['ambient', 'slice', 'inner', 'event'];
    let safety = 0;
    let blocked = 0;
    while (MQ.countChars(paragraphs.join('\n\n')) < 750 && safety < 24) {
      const f = fillers[safety % fillers.length]; // 轮换填充，避免随机反复命中同一模板
      const fctx = { rng, novel, genre, state };
      let extra = '';
      if (f === 'inner') extra = P().PRODUCERS.inner(fctx, rng.pick(['', '', 'resolve', 'sorrow']));
      else extra = P().PRODUCERS[f](fctx);
      if (extra) {
        extra = P().applyStyle(style, MQ.polish(extra));
        const at = Math.max(1, Math.min(paragraphs.length - 1, 3 + rng.int(0, 2)));
        if (!addPara(extra, at)) {
          // 连续碰撞（素材池去重命中）时强制补段，保证章节达到目标字数
          blocked++;
          if (blocked >= fillers.length) { paragraphs.splice(at, 0, extra); blocked = 0; }
        } else {
          blocked = 0;
        }
      }
      safety++;
    }

    let text = MQ.dedupeText(paragraphs.join('\n\n'));
    text = MQ.polish(text);
    text = text.replace(/。\n/g, '。\n\n');

    chapter.text = text;
    chapter.wordCount = MQ.countChars(text);
    chapter.updatedAt = MQ.now();
    novel.updatedAt = MQ.now();
    novel.wordCount = novel.chapters.reduce((s, c) => s + (c.wordCount || 0), 0);
    return chapter;
  }

  /* ============================================================
     续写本章（在现有文本末尾追加 2-3 段）
     ============================================================ */
  function continueChapter(novel, idx, existingText, styleId) {
    const chapter = novel.chapters[idx];
    const rng = MQ.makeRng(novel.seed + 500 + idx * 29 + (existingText ? MQ.countChars(existingText) : 1));
    const genre = C().getGenre(novel.genreId);
    const style = P().getStyle(styleId || novel.styleId);
    const state = {
      hero: novel.hero.name,
      heroChar: novel.hero || null,
      otherName: novel.characters.length > 1 ? novel.characters[1].name : '对方',
      otherChar: novel.characters.length > 1 ? novel.characters[1] : null,
      place: chapter.place,
    };

    // 续写时避免与本章已有内容的事件重复
    state.usedEvents = new Set([chapter.event]);
    if (existingText) {
      for (const ev of genre.events) {
        if (existingText.includes(ev)) state.usedEvents.add(ev);
      }
    }

    const bits = [];
    bits.push(P().PRODUCERS.event({ rng, genre, state }));
    if (rng.chance(0.6)) {
      const sceneKey = rng.pick(['confront', 'reveal', 'plea', 'banter']);
      bits.push(P().PRODUCERS.dialogue({ rng, state }, sceneKey));
    }
    bits.push(P().PRODUCERS.inner({ rng, state }, 'resolve'));
    bits.push(P().PRODUCERS.close({ rng, state }));

    const extra = MQ.polish(MQ.dedupeText(bits.map(b => P().applyStyle(style, MQ.polish(b))).join('\n\n')));
    chapter.text = existingText ? MQ.polish(existingText + '\n\n' + extra) : extra;
    chapter.wordCount = MQ.countChars(chapter.text);
    novel.wordCount = novel.chapters.reduce((s, c) => s + (c.wordCount || 0), 0);
    novel.updatedAt = MQ.now();
    return chapter;
  }

  /* ============================================================
     随机灵感
     ============================================================ */
  function randomInspire(novel) {
    const rng = MQ.makeRng(Date.now() + Math.floor(Math.random() * 99999));
    const card = rng.pick(C().INSPIRE);
    return card;
  }

  /* ============================================================
     随机一套设定（一键随机）
     ============================================================ */
  function randomSetupPrefill() {
    const genre = C().GENRES[Math.floor(Math.random() * C().GENRES.length)];
    const rng = MQ.makeRng(Date.now() % 1000000);
    return {
      genre: genre.id,
      title: C().genTitle(rng, genre),
      protagonist: C().genName(rng, genre),
      conflict: rng.pick(genre.conflicts),
      world: rng.pick(genre.worlds),
      style: ['ancient', 'fierce', 'mystery', 'lyric', 'humor', 'epic'][rng.int(0, 5)],
      chapters: rng.int(6, 30), // 随机章节数
    };
  }

  MQ.Engine = {
    generateSetup,
    generateCharacters,
    generateOutline,
    generateChapter,
    continueChapter,
    randomInspire,
    randomSetupPrefill,
    resolveChapterCount,
    MIN_CHAPTERS,
    MAX_CHAPTERS,
  };

})(window.MQ);
