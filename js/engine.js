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
      template: opts.template || 'three-act',
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
     大纲生成（4 套叙事模板）
     ============================================================ */
  /* 模板定义：每套模板有 3 幕的 beat 序列（按章节数成比例填充）
     proportions 控制每幕占比，beat 池通过循环填充分配 */
  const TEMPLATES = [
    {
      id: 'three-act', name: '三幕结构', icon: '🎬',
      desc: '经典起承转合：铺垫→冲突→高潮→收束',
      proportions: [0.25, 0.50, 0.25],
      beats: [
        ['intro','daily','incite','depart'],
        ['explore','meet','trial','approach','low','rally','explore','approach'],
        ['climax','cost','resolve','after'],
      ],
    },
    {
      id: 'hero-journey', name: '英雄之旅', icon: '🗺️',
      desc: 'Campbell 12 阶段：平凡→召唤→试炼→回归',
      proportions: [0.22, 0.48, 0.30],
      beats: [
        ['ordWorld','call','refusal','mentor','crossing'],
        ['tests','approach','ordeal','reward','approach','tests'],
        ['roadBack','resurrect','elixir','after'],
      ],
    },
    {
      id: 'seven-point', name: '七点式', icon: '⚡',
      desc: 'Dan Wells 7 点：钩子→转折→中点→低谷→冲刺→结局',
      proportions: [0.20, 0.55, 0.25],
      beats: [
        ['hook','plotTurn1'],
        ['trigger','midpoint','trigger','pinch','trigger','approach'],
        ['plotTurn2','climax','resolve','after'],
      ],
    },
    {
      id: 'save-cat', name: '救猫咪', icon: '🐱',
      desc: 'Blake Snyder 15 节拍：开场画面→催化剂→中点→一无所有→终场',
      proportions: [0.22, 0.53, 0.25],
      beats: [
        ['opening','theme','setup','catalyst','debate'],
        ['break2','bStory','fun','midpoint','badGuys','allLost','darkNight','break3'],
        ['finale','finalImg','after'],
      ],
    },
  ];

  function getTemplate(id) {
    return TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
  }

  const BEAT_TITLES = {
    // 三幕结构
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
    // 英雄之旅
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
    // 英雄之旅
    ordWorld: ['平凡世界', '日常', '日复一日'],
    call:     ['冒险召唤', '不速之信', '命运的敲门声'],
    refusal:  ['拒绝召唤', '迟疑', '退缩的理由'],
    mentor:   ['遇见导师', '引路之人', '一句话改变了方向'],
    crossing: ['跨越门槛', '踏入未知', '回不去了'],
    tests:    ['试炼之路', '盟友与敌人', '在磨砺中成长'],
    ordeal:   ['核心考验', '深渊', '直面最大的恐惧'],
    reward:   ['获得奖赏', '拨云见日', '值得一切代价'],
    roadBack: ['返回之路', '归途', '最后的阻碍'],
    resurrect:['复活', '浴火重生', '真正蜕变'],
    elixir:   ['带回灵药', '归来', '满载而归'],
    // 七点式
    hook:     ['钩子', '开场', '第一印象'],
    plotTurn1:['第一个转折', '风向变了', '出人意料'],
    trigger:  ['触发事件', '连锁反应', '一石激起千层浪'],
    midpoint: ['中点', '中场转折', '一切都不一样了'],
    pinch:    ['一蹶不振', '至暗时刻', '跌到谷底'],
    plotTurn2:['第二个转折', '觉醒', '最后的底牌'],
    // 救猫咪
    opening:  ['开场画面', '第一幕', '最初的模样'],
    theme:    ['主题呈现', '潜台词', '有人说了那句关键的话'],
    setup:    ['铺垫', '设局', '暴风雨前的平静'],
    catalyst: ['催化剂', '爆炸点', '一切都变了'],
    debate:   ['内心挣扎', '犹豫', '去还是不去'],
    break2:   ['进入第二幕', '跨越', '做出选择'],
    bStory:   ['B 故事', '支线', '另一道光'],
    fun:      ['游戏时间', '欢乐', '承诺的兑现'],
    badGuys:  ['反派逼近', '阴影', '敌人步步紧逼'],
    allLost:  ['一无所有', '万念俱灰', '最黑暗的时刻'],
    darkNight:['灵魂暗夜', '黑夜', '只有他自己'],
    break3:   ['进入第三幕', '破晓', '新的觉悟'],
    finale:   ['终场', '结局', '最终对决'],
    finalImg: ['终场画面', '最后一瞥', '与开场呼应'],
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
    // 英雄之旅
    ordWorld: '{hero}在{place}过着平凡的生活。一切看起来普普通通，但命运已经在暗中布好了棋局。',
    call:     '变故突如其来。{event}，有人告诉{hero}：你不能再呆在这里了。',
    refusal:  '{hero}本能地拒绝了那个召唤。他不相信，也不愿意——直到那个无论如何都无法回避的时刻到来。',
    mentor:   '在{place}，{hero}遇见了改变他一生的那个人。{ally}说了一些话，很长一段时间后，他依然记得每一个字。',
    crossing: '{hero}跨过那道门槛，真正踏入了一个完全陌生的世界。从这一刻起，他再也回不去了。',
    tests:    '新的世界露出了它的獠牙。{hero}历经考验，结识了伙伴，也树下了敌人，在一次次碰撞中变得更强大。',
    approach: '{hero}离真相越来越近了。{place}的每一个角落都在传来危险的信号，但他已无法回头。',
    ordeal:   '最大的考验降临。{hero}直面内心最深的恐惧——如果失败了，一切就真的结束了。',
    reward:   '{hero}赢得了奖赏。不只是外力——更重要的是他终于明白了一些事，那是通往最终答案的钥匙。',
    roadBack: '归途从不是坦途。{hero}一路往回赶，身后是追兵，前方是未知，而他的肩上压着从未有过的重量。',
    resurrect:'绝境之中，{hero}经历了真正的蜕变。他不再是出发时的那个人——那个旧的自己，已经死了。',
    elixir:   '他带着答案归来。那些伤、那些痛、那些走丢的人，都变成了一种力量——不是去征服世界，是去守护曾经的世界。',
    // 七点式
    hook:     '{hero}不知道，这个寻常的日子，将成为一切的开端。{event}——命运的钩子，已然落下。',
    plotTurn1:'第一个转折砸了下来。{hero}的世界观出现了裂缝，他所相信的一切都变得不可靠。',
    trigger:  '{event}。没有退路了。{hero}意识到，如果什么都不做，失去的将远超想象。',
    midpoint: '中场时分，{hero}获得了一个至关重要的信息。从这一刻起，猎人与猎物的关系——彻底颠倒。',
    pinch:    '一切都在崩塌。{hero}跌入谷底，那些支撑他的东西被一件件拿走，他甚至开始怀疑最初的选择。',
    plotTurn2:'在最低处，{hero}发现了最后的底牌。不是力量，不是外援——而是一个从始至终被忽略的答案。',
    // 救猫咪
    opening:  '{hero}的日常在{place}展开。一个微小的细节——一项习惯、一句口头禅——暗示着这个人与众不同的另一面。',
    theme:    '在某段不经意的对话中，有人提出了一个看似简单的问题。这个问题，将如影随形地跟{hero}到最后。',
    setup:    '{hero}的生活仍在继续。但那些不起眼的线索——一段对话、一件旧物、一个没说完的名字——正悄然编织着风暴。',
    catalyst: '{event}！一切都被打碎了。{hero}的世界不再是原来的世界，而他的反应，定义了接下来所有的故事。',
    debate:   '{hero}在犹豫。去还是不去？行动的代价太大了，可不行动的代价——他还没完全看清。',
    break2:   '{hero}做出了选择。他推开了那扇门，踏入了全然不同的世界。不能再假装一切如常了。',
    bStory:   '在这片混沌中，{hero}意外地找到了一个支点——一个人、一段温暖、或一个简单的理由——让他还记得自己为什么在坚持。',
    fun:      '{hero}终于摸到了节奏。他在{place}里游刃有余地行动，兑现了那个让所有人期待已久的承诺。',
    badGuys:  '阴影从四面八方围拢。{hero}发现，敌人远比他想象的多——有些在明处，更多的在暗处，而时间正在耗尽。',
    allLost:  '最坏的事情发生了。{hero}失去了最重要的东西——盟友、信念、或支撑他的最后一根稻草。此刻，他什么都没有了。',
    darkNight:'黑暗最深处的时刻。{hero}独自一人，面对着虚无和绝望。他问自己：还值得吗？然后他在寂静中听见了回答。',
    break3:   '答案浮现了。{hero}抓住了黑暗中唯一的光——不是新的力量，而是一种新的理解。他知道该怎么做了。',
    finale:   '终局。{hero}用一路走来所学会的一切，迎战那个从一开始就在等待的结局。不是完美的——但它是他的。',
    finalImg: '最后的画面。与开篇遥相呼应——还是{place}，还是那个人，可一切已经不一样了。故事走到这里，成了一面镜子。',
  };

  function generateOutline(novel) {
    const rng = MQ.makeRng(novel.seed + 202);
    const genre = C().getGenre(novel.genreId);
    const total = resolveChapterCount(novel);

    // 选取叙事模板
    const tmpl = getTemplate(novel.template || 'three-act');
    const [p1, p2, p3] = tmpl.proportions;
    let act1n = Math.max(1, Math.round(total * p1));
    let act3n = Math.max(1, Math.round(total * p3));
    let act2n = Math.max(1, total - act1n - act3n);
    if (act1n + act2n + act3n > total) act1n -= (act1n + act2n + act3n - total);

    const actBeats = tmpl.beats;
    const fill = (pool, n) => {
      const out = [];
      for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
      return out;
    };

    const skeleton = [];
    skeleton.push(...fill(actBeats[0], act1n));
    skeleton.push(...fill(actBeats[1], act2n));
    skeleton.push(...fill(actBeats[2], act3n));
    // 保证首尾为模板的固定节拍
    skeleton[0] = actBeats[0][0];
    skeleton[skeleton.length - 1] = actBeats[2][actBeats[2].length - 1];
    if (skeleton.length > 2) skeleton[skeleton.length - 2] = actBeats[2][Math.max(0, actBeats[2].length - 2)];
    if (skeleton.length > 3 && actBeats[2].length > 2) skeleton[skeleton.length - 3] = actBeats[2][Math.max(0, actBeats[2].length - 3)];

    // 伏笔：中段埋 2 个，尾段回收
    const mid = Math.floor(skeleton.length / 2);
    const foreshadowIdx = [];
    for (let i = 3; i < Math.min(mid, skeleton.length - 4); i++) {
      if (foreshadowIdx.length < 2 && rng.chance(0.55)) foreshadowIdx.push(i);
    }
    if (foreshadowIdx.length === 0 && skeleton.length > 6) foreshadowIdx.push(4);

    // 地点池：优先使用用户自定义的地点，其次用题材内置地点
    const placePool = (novel.places && novel.places.length >= 2) ? novel.places.map(p => p.name) : genre.places;
    const placeTrack = [placePool[0], rng.pick(placePool), rng.pick(placePool)];
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
    syncForeshadows(novel); // 同步伏笔追踪表
    return chapters;
  }

  /* ============================================================
     伏笔追踪
     ============================================================ */
  // 伏笔描述素材池（通用悬念种子，不绑定具体题材）
  const FS_SEEDS = [
    '来历成谜的信物，牵出一段被刻意掩埋的往事',
    '故人留下的旧物，看似寻常却暗藏玄机',
    '一句被所有人回避的往事，无人敢提起',
    '深夜传来的奇异声响，来源始终是个谜',
    '反复出现的梦境碎片，醒来后只剩下一个名字',
    '一封没有署名的信，字迹却莫名熟悉',
    '旧伤疤背后的真相，远比表面复杂',
    '路人欲言又止的眼神，仿佛知道什么',
    '一个被禁提的名字，提起便会招来祸端',
    '尘封多年的密档，落款日期藏着秘密',
    '一道来历不明的伤口，愈合后仍隐隐作痛',
    '始终缺席的人物，每次都被刻意绕开',
  ];

  // 从章节的 foreshadow 标记重建 novel.foreshadows 追踪表（保留手动埋设的条目）
  function syncForeshadows(n) {
    if (!n || !Array.isArray(n.chapters)) return [];
    const old = (n.foreshadows || []).filter(f => f && typeof f.plantIdx === 'number');
    const rng = MQ.makeRng((n.seed || 7) + 404);
    const generated = [];
    n.chapters.forEach((c, i) => {
      if (!c.foreshadow || i < 1) return;
      const plantIdx = i - 1;
      const prev = old.find(f => f.plantIdx === plantIdx && f.payoffIdx === i);
      generated.push({
        id: prev ? prev.id : 'fs-' + i,
        plantIdx,
        payoffIdx: i,
        desc: (prev && prev.desc) ? prev.desc : rng.pick(FS_SEEDS),
      });
    });
    // 保留手动埋设的伏笔（不与任何章节标记对应的旧条目）
    const manual = old.filter(f => !generated.some(g => g.plantIdx === f.plantIdx && g.payoffIdx === f.payoffIdx));
    n.foreshadows = generated.concat(manual);
    return n.foreshadows;
  }

  // 章节拖拽重排后：更新伏笔的埋设/回收索引（与 lastChapter 同款位移规则）
  function remapForeshadows(n, from, target) {
    if (!n || !Array.isArray(n.foreshadows)) return;
    const shift = (x) => {
      if (x === from) return target;
      if (from < x && target >= x) return x - 1;
      if (from > x && target <= x) return x + 1;
      return x;
    };
    n.foreshadows.forEach(f => {
      f.plantIdx = shift(f.plantIdx);
      f.payoffIdx = shift(f.payoffIdx);
    });
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
  function generateChapter(novel, idx, styleId, variant) {
    const chapter = novel.chapters[idx];
    if (!chapter) return null;

    // variant（0/1/2…）用于多版本生成本章：不同 seed 走不同的情节组合，产出互异的整章候选
    const rng = MQ.makeRng(novel.seed + 300 + idx * 17 + (variant || 0) * 777);
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
      place: chapter.place || (novel.places && novel.places.length ? rng.pick(novel.places.map(p => p.name)) : rng.pick(genre.places)),
      lastEvent: chapter.event,
      // 关系上下文：用于对话/冲突描写中体现角色间的关系张力
      relType: (() => { const r = (novel.relations || []).find(rr => (rr.from === novel.hero.name && rr.to === (other ? other.name : '')) || (rr.to === novel.hero.name && rr.from === (other ? other.name : ''))); return r ? r.type : ''; })(),
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
        const polished = P().applyStyle(style, MQ.polish(out), name, rng);
        if (addPara(polished)) {
          // 伏笔回收：在揭示型段落后插入真相段
          if (chapter.foreshadow && !foreshadowUsed && (name === 'reveal' || name === 'event' || name === 'climax')) {
            const foreshadowText = [
              `谜底揭开的那一刻，{hero}忽然想起很久以前的一个细节——那个一直被忽略的画面，此刻清晰地浮现在眼前。原来所有的伏笔，从那时起就已经埋下。`.replace('{hero}', state.hero),
              `许多往事在脑中轰然贯通。{hero}终于明白，这一路走来所遇见的每一个人、每一件事，都在指向同一个答案。`.replace('{hero}', state.hero),
            ];
            if (addPara(P().applyStyle(style, MQ.polish(rng.pick(foreshadowText)), '', rng))) {
              foreshadowUsed = true;
            }
          }
        }
      }
    }

    // 收尾钩子
    addPara(P().applyStyle(style, MQ.polish(P().PRODUCERS.close({ rng, state })), '', rng));

    // 自定义文风：特色句式独立成段，随机穿插（1–2 段，复用去重机制）
    if (style.phrases && style.phrases.length) {
      const n = Math.min(2, 1 + rng.int(0, 1));
      for (let i = 0; i < n; i++) {
        const ph = MQ.fill(rng.pick(style.phrases), {
          hero: state.hero,
          place: state.place || '',
          ally: state.otherName || '故人',
        });
        addPara(P().applyStyle(style, MQ.polish(ph), '', rng), rng.int(0, paragraphs.length));
      }
    }

    // 长度保险：正文不足目标字数时补段（每章可独立设定 targetWc，默认 800）
    const targetWc = chapter.targetWc || 800;
    const fillers = ['ambient', 'slice', 'inner', 'event'];
    let safety = 0;
    let blocked = 0;
    while (MQ.countChars(paragraphs.join('\n\n')) < targetWc && safety < 24) {
      const f = fillers[safety % fillers.length]; // 轮换填充，避免随机反复命中同一模板
      const fctx = { rng, novel, genre, state };
      let extra = '';
      if (f === 'inner') extra = P().PRODUCERS.inner(fctx, rng.pick(['', '', 'resolve', 'sorrow']));
      else extra = P().PRODUCERS[f](fctx);
      if (extra) {
        extra = P().applyStyle(style, MQ.polish(extra), f, rng);
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
  function continueChapter(novel, idx, existingText, styleId, variant, mood) {
    const chapter = novel.chapters[idx];
    // variant（0/1/2…）用于多版本续写：不同 seed 走不同的情节组合，产出互异的候选
    const rng = MQ.makeRng(novel.seed + 500 + idx * 29 + (existingText ? MQ.countChars(existingText) : 1) + (variant || 0) * 777 + (mood ? MQ.hashSeed(mood) : 0));
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

    // 灵感驱动：按 tag 偏重不同生产者
    const MOOD_MAP = {
      '战斗描写': ['fight:lose', 'inner:resolve', 'close'],
      '如何写对峙': ['atmosphere', 'dialogue:confront', 'close'],
      '对话金句': ['dialogue:confront', 'inner', 'close'],
      '心理描写': ['micro', 'inner:tension', 'atmosphere', 'close'],
      '心理·决心': ['inner:resolve', 'event', 'close'],
      '环境叙事': ['sensory', 'atmosphere', 'slice', 'close'],
      '日常质感': ['slice', 'micro', 'dialogue:banter', 'close'],
      '温情时刻': ['atmosphere', 'dialogue:comfort', 'inner:resolve', 'close'],
      '悬念': ['event', 'inner:tension', 'reveal', 'close'],
      '悬念·日常': ['sensory', 'atmosphere', 'inner:tension', 'close'],
      '伏笔': ['slice', 'event', 'inner', 'close'],
      '伏笔回收': ['reveal', 'inner', 'close'],
      '名场面': ['atmosphere', 'event', 'fight:win', 'close'],
      '名场面·离别': ['atmosphere', 'dialogue:lastWords', 'inner:sorrow', 'close'],
      '反转': ['event', 'dialogue:reveal', 'reveal', 'close'],
      '开篇技巧': ['open', 'sensory', 'inner', 'close'],
      '角色弧光': ['inner:sorrow', 'inner:resolve', 'event', 'close'],
      '反派塑造': ['event', 'dialogue:threat', 'inner', 'close'],
      '喜剧节奏': ['dialogue:banter', 'slice', 'close'],
    };
    const altBeats = (mood && MOOD_MAP[mood]) ? MOOD_MAP[mood] : null;

    const bits = [];
    if (altBeats) {
      // 灵感模式：直接按 mood map 打段
      for (const step of altBeats) {
        const [name, arg] = step.split(':');
        if (name === 'event') bits.push(P().PRODUCERS.event({ rng, genre, state }));
        else if (name === 'dialogue') bits.push(P().PRODUCERS.dialogue({ rng, state }, arg));
        else if (name === 'fight') bits.push(P().PRODUCERS.fight({ rng, state }, arg));
        else if (name === 'inner') bits.push(P().PRODUCERS.inner({ rng, state }, arg));
        else if (P().PRODUCERS[name]) bits.push(P().PRODUCERS[name]({ rng, state, genre }));
      }
    } else {
      bits.push(P().PRODUCERS.event({ rng, genre, state }));
      if (rng.chance(0.6)) {
        const sceneKey = rng.pick(['confront', 'reveal', 'plea', 'banter']);
        bits.push(P().PRODUCERS.dialogue({ rng, state }, sceneKey));
      }
      bits.push(P().PRODUCERS.inner({ rng, state }, 'resolve'));
      bits.push(P().PRODUCERS.close({ rng, state }));
    }

    // 自定义文风：续写同样穿插特色句式
    if (style.phrases && style.phrases.length && rng.chance(0.7)) {
      const ph = MQ.fill(rng.pick(style.phrases), {
        hero: state.hero,
        place: state.place || '',
        ally: state.otherName || '故人',
      });
      bits.splice(Math.max(1, rng.int(1, bits.length)), 0, P().applyStyle(style, MQ.polish(ph), '', rng));
    }

    const extra = MQ.polish(MQ.dedupeText(bits.map(b => P().applyStyle(style, MQ.polish(b), '', rng)).join('\n\n')));
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

  /* 上下文感知灵感：优先选取与当前章 beat 匹配的卡片，不足时随机补 */
  function contextAwareInspire(novel, beatType, count) {
    const pool = C().INSPIRE;
    count = count || 3;
    // 匹配当前 beat 的卡片
    const matching = pool.filter(c => c.beats && c.beats.includes(beatType));
    const rest = pool.filter(c => !matching.includes(c));
    const rng = MQ.makeRng(Date.now() + Math.floor(Math.random() * 99999));
    const result = [];
    // 优先匹配，最多占 2/3
    const maxMatch = Math.min(matching.length, Math.ceil(count * 2 / 3));
    const shuffled = rng.shuffle(matching);
    for (let i = 0; i < maxMatch; i++) result.push(shuffled[i]);
    // 不足时从其余池随机补
    if (result.length < count && rest.length) {
      const restShuffled = rng.shuffle(rest);
      for (let i = 0; i < restShuffled.length && result.length < count; i++) {
        result.push(restShuffled[i]);
      }
    }
    // 仍不足时从匹配池循环补（理论不会发生，但兜底）
    while (result.length < count) {
      result.push(shuffled[result.length % shuffled.length]);
    }
    return rng.shuffle(result); // 打乱顺序，不让两条同类的挨着
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
      chapters: rng.int(6, 30),
      template: TEMPLATES[rng.int(0, TEMPLATES.length - 1)].id,
    };
  }

  MQ.Engine = {
    TEMPLATES,
    getTemplate,
    generateSetup,
    generateCharacters,
    generateOutline,
    generateChapter,
    continueChapter,
    randomInspire,
    contextAwareInspire,
    randomSetupPrefill,
    syncForeshadows,
    remapForeshadows,
    FS_SEEDS,
    resolveChapterCount,
    MIN_CHAPTERS,
    MAX_CHAPTERS,
  };

})(window.MQ);
