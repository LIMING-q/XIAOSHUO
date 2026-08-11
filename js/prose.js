/* ============================================================
   墨泉 · 正文生产器 —— 文风预设 + 段落生产器
   ============================================================ */
(function (MQ) {
  'use strict';

  /* ============================================================
     文风预设
     ============================================================ */
  const STYLES = {
    ancient: {
      id: 'ancient', name: '古风典雅',
      replaces: [['然后', '旋即'], ['但是', '然而'], ['可是', '然则'], ['突然', '倏然'], ['马上', '即刻'],
        ['非常', '甚'], ['因为', '缘因'], ['所以', '故而'], ['已经', '已然'], ['离开', '离去'],
        ['看到', '望见'], ['想到', '思及'], ['走来', '行来'], ['说话', '言语'], ['知道', '知晓'],
        ['觉得', '只觉'], ['好像', '仿佛'], ['也许', '或许']],
      openers: ['却说', '且说', '这一日', '彼时'],
      closers: ['罢了', '便是', '也自无妨', '原是如此'],
      shortRate: 0.45,
      desc: '辞藻清雅，句式舒展，读来如临水墨长卷。',
    },
    fierce: {
      id: 'fierce', name: '热血激昂',
      replaces: [['他慢慢', '他猛地'], ['一点一点', '一寸一寸'], ['尽力', '拼尽全力'], ['害怕', '绝不退缩'],
        ['平静', '滚烫'], ['小心', '悍然'], ['后退', '不退反进']],
      openers: ['来了——', '就是现在！', '一口气提到胸口，'],
      closers: ['这一战，不死不休！', '他，绝不认输。', '血还在烧。'],
      shortRate: 0.7,
      desc: '短句如刀，节奏如鼓，读来热血沸腾。',
    },
    mystery: {
      id: 'mystery', name: '冷峻悬疑',
      replaces: [['但是', '然而'], ['突然', '忽然'], ['发现', '觉察'], ['想', '思忖'], ['原来', '竟'],
        ['大声', '低声'], ['害怕', '不安'], ['很多', '诸多']],
      openers: ['起初，', '没有人注意到', '那是个再寻常不过的'],
      closers: ['事情，远没有结束。', '而答案，还藏在黑暗里。', '真相，才刚刚露出一个角。'],
      shortRate: 0.68,
      desc: '克制留白，字字机锋，寒气从纸面渗出来。',
    },
    lyric: {
      id: 'lyric', name: '细腻文艺',
      replaces: [['然后', '而后'], ['但是', '只是'], ['突然', '骤然'], ['非常', '格外'], ['很多', '许多'],
        ['看到', '望见'], ['想到', '想起'], ['也许', '或许'], ['高兴', '欢喜']],
      openers: ['那天的风很轻，', '回忆像潮水，', '有些事，注定要落在心上'],
      closers: ['像一页翻过去的书，轻轻合上。', '而风继续吹着，吹过很多年。', '他把那些话，慢慢咽了回去。'],
      shortRate: 0.4,
      desc: '长句如丝，意象细腻，情感在字缝里流淌。',
    },
    humor: {
      id: 'humor', name: '诙谐轻快',
      replaces: [['慢慢', '磨磨蹭蹭地'], ['非常', '贼'], ['走', '溜'], ['看', '瞅'], ['说', '嘀咕'],
        ['害怕', '怂'], ['漂亮', '顶好看'], ['生气', '炸毛']],
      openers: ['要说这事，还得从头讲起——', '说出来你可能不信，', '那天的剧本，写满了「意外」两个字'],
      closers: ['当然，这是后话。', '日子嘛，总得笑着过。', '他后来回忆说：值了。'],
      shortRate: 0.55,
      desc: '插科打诨，节奏轻快，读来会心一笑。',
    },
    epic: {
      id: 'epic', name: '史诗宏阔',
      replaces: [['很大', '辽阔'], ['很多', '万千'], ['重要', '关乎苍生'], ['前进', '奔赴'], ['国家', '山河'],
        ['决定', '抉择'], ['战斗', '征战'], ['开始', '序幕拉开']],
      openers: ['百年之后，史书会这样记载——', '大幕，在这一刻拉开。', '风起于青萍之末，终成席卷之势。'],
      closers: ['而这，仅仅是开始。', '时代的车轮，碾过每一个人的命运。', '他的名字，将被写入这段历史。'],
      shortRate: 0.5,
      desc: '视野开阔，气吞山河，字句间皆是时代重量。',
    },
  };

  /* ============================================================
     文风修饰器
     ============================================================ */
  function applyStyle(style, text) {
    let t = text;
    // 词汇替换
    for (const [from, to] of style.replaces) {
      t = t.split(from).join(to);
    }
    return t;
  }

  /* ============================================================
     素材池
     ============================================================ */
  const POOL = {
    // 动作/神态（用于对话轮与行动段）
    acts: [
      '皱了皱眉', '握紧了拳', '目光一沉', '轻轻叹了口气', '眼神闪烁了一下', '嘴角勾起一丝弧度',
      '瞳孔骤然一缩', '垂下眼帘', '声音放低了几分', '脚步微顿', '指尖微微发颤', '抬起头，直视',
      '冷笑一声', '深吸一口气', '缓缓开口', '喉结滚动了一下', '手按上了兵器', '脊背挺得笔直',
    ],
    innerTension: [
      '{hero}的心跳快了半拍。有些话堵在喉咙口，说不出来，也咽不下去。',
      '{hero}意识到，从这一刻起，有些东西已经不一样了。就像一扇门被推开，再也没法假装它关着。',
      '恐惧像潮水一样漫上来，但{hero}没有退。退了，就什么都没有了。',
      '{hero}忽然明白，这就是他一直等着的时刻。他等了很多年，久到几乎忘了自己为什么在等。',
    ],
    innerResolve: [
      '{hero}深吸一口气。既然没有退路，那就往前走——哪怕前面是刀山火海。',
      '那一瞬间，{hero}心里所有的犹豫都落定了。答案早就在那里，只是他一直没有承认。',
      '{hero}抬起头，眼底燃起一点光。这条路很难，但他偏要走到底。',
      '有些账，总要有人来算；有些事，总要有人来做。{hero}决定，这个人是他。',
    ],
    innerSorrow: [
      '回忆涌上来，像一根根细针，扎得{hero}眼眶发酸。他咬住牙，不让任何东西掉下来。',
      '{hero}沉默了很久。有些话，说出来太轻，咽下去太重。',
      '夜色落在{hero}肩上。他忽然觉得，一个人走夜路，原来是这样冷的。',
    ],
    actionHits: [
      '身形一闪，抢先一步出手。',
      '没有多余的废话，两人几乎同时动了。',
      '一拳砸出，带着风声，直取要害。',
      '侧身避开锋芒，反手一击，又快又狠。',
    ],
    fightExchanges: [
      '你来我往，短短几个呼吸间，已交手数招。',
      '兵器碰撞的声响在空气里炸开，火星四溅。',
      '这一击快若惊雷，却在最后一寸堪堪停住——两个人都没有真的下死手。',
      '一方攻势如潮，一方守得密不透风。僵持之际，谁先露出破绽，谁就输了。',
    ],
    fightResultWin: [
      '尘埃落定。{hero}喘息着站定，抹了一把嘴角的血，眼底却亮得惊人。',
      '当最后一声闷响落地，胜负已分。{hero}赢了，赢得并不轻松。',
      '对方踉跄后退，再没能站起来。{hero}收了势，没有追击。',
    ],
    fightResultLose: [
      '这一战，{hero}败了。败得彻彻底底，连反击的力气都没剩下。',
      '剧痛袭来，{hero}单膝跪地。他输了，输掉了最后的筹码。',
      '{hero}被击倒在地，眼前一片模糊。世界在旋转，而败局，已经尘埃落定。',
    ],
    // 危机/事件推进段
    eventBeats: [
      '变故来得毫无预兆。{event}。所有人还没反应过来，局势已经彻底变了。',
      '就在这时，{event}。整个场面，瞬间安静了下来。',
      '谁也没有料到，{event}。空气仿佛凝滞了一瞬，然后轰然炸开。',
      '{event}。这句话落在每个人耳中，分量重得让人喘不过气。',
    ],
    reveals: [
      '真相揭开的瞬间，{hero}反而平静了下来。原来如此——所有的疑点，在这一刻串成了一条线。',
      '那封泛黄的旧信，终于被摊开在灯下。{hero}读着读着，手指开始发颤：这一切，从一开始就是个局。',
      '他忽然想通了。许多年前的那个雨夜，那些被忽略的细节，此刻全都有了答案。',
      '秘密像一堵墙，此刻轰然倒塌。墙后站着的人，让{hero}整个人僵在了原地。',
    ],
    // 章末钩子
    hooks: [
      '而在很远的地方，有人睁开了眼睛。',
      '他不知道的是，这只是开始。',
      '那一夜的雨，下了很久很久。久到许多年后，{hero}依然记得这夜的潮湿。',
      '黑暗中，传来一声极轻的叹息。像叹息，又像——呼唤。',
      '而他不知道，明天等待他的，将是一个完全不同的答案。',
      '门在身后合上。故事，才刚刚开始。',
    ],
  };

  /* ============================================================
     性格台词风格库
     依据角色的 personaOuter 套用专属台词风格：
     同一场景中性格不同的角色，语气、用词、长短句会明显区分。
     ============================================================ */
  const SPEECH_PROFILES = {
    '沉默寡言': {
      short: 0.7, // 截短长句概率
      catch: ['嗯。', '知道了。', '……好。', '随你。', '走吧。'],
      suffix: ['……', '……', '。'],
      action: ['他说完便不再开口。', '话不多，每个字却都落在点上。'],
    },
    '锋芒毕露': {
      sharp: 0.45,
      catch: ['呵，就凭你？', '有意思。', '废话少说。'],
      suffix: ['。', '！', '。'],
      action: ['他抬眼，目光里全是锋芒。', '话说得冲，却没有半点虚的。'],
    },
    '温和宽厚': {
      soft: ['吧', '呢', '呀'],
      catch: ['别担心，有我在。', '慢慢来，不急。'],
      suffix: ['。', '。', '。'],
      action: ['他说得很轻，语气却让人安心。', '话里带着笑意，暖得很。'],
    },
    '玩世不恭': {
      quip: ['哎哟', '啧啧', '行行行'],
      catch: ['行吧行吧，都依你。', '你说了算～'],
      suffix: ['～', '嘛', '～'],
      action: ['他笑嘻嘻地补了一句。', '明明在说正事，语气却跟闹着玩似的。'],
    },
    '孤僻冷傲': {
      short: 0.6,
      catch: ['……与你无关。', '少来烦我。', '……随你。'],
      suffix: ['……', '。'],
      action: ['他说完，眼睫垂了下来，疏离得很。', '语气冷得像隔着层冰。'],
    },
    '机灵圆滑': {
      soft: ['呢', '嘛'],
      catch: ['您说笑了，我哪敢呀。', '那是自然，包在我身上。'],
      suffix: ['呢', '嘛', '。'],
      action: ['他眼珠一转，话里带着七分周到。', '话说得滴水不漏，让人挑不出毛病。'],
    },
    '莽撞冲动': {
      exclaim: 0.6,
      suffix: ['！', '！！', '！'],
      catch: ['管他呢，干就完了！', '怕什么，上！'],
      action: ['他急吼吼地嚷了一嗓子。', '话说得又冲又直，半点弯都不拐。'],
    },
    '冷静克制': {
      short: 0.4,
      catch: ['说重点。', '我自有分寸。', '急什么。'],
      suffix: ['。', '。', '。'],
      action: ['他语气平稳，听不出情绪。', '每个字都斟酌过，冷而笃定。'],
    },
    // AI 生成的角色常见性格，也纳入风格库
    '话痨': {
      quip: ['我跟你说', '你听我说'],
      soft: ['啦', '嘛'],
      suffix: ['啦', '！', '嘛'],
      action: ['他话匣子一开，就收不住了。'],
    },
    '活泼开朗': {
      quip: ['嘿嘿', '好呀好呀'],
      soft: ['啦', '呀'],
      suffix: ['呀', '！', '啦'],
      action: ['她眉眼弯弯，语气轻快得很。'],
    },
    '高冷': {
      short: 0.7,
      catch: ['……嗯。', '与我无关。'],
      suffix: ['……', '。'],
      action: ['他淡淡扫了一眼，没多说什么。'],
    },
    '阴鸷': {
      short: 0.5,
      catch: ['……会付出代价的。', '你逃不掉。'],
      suffix: ['……', '。'],
      action: ['他声音又低又沉，像毒蛇吐信。'],
    },
  };

  function speechProfile(persona) {
    return SPEECH_PROFILES[persona] || null;
  }

  // 依性格改写一句台词（只动引号内内容，动作/旁白行可补神态）
  function personalizeLine(line, profile, rng) {
    if (!profile) return line;
    const m = line.match(/[「“]([^」”]*)[」”]/);
    if (!m) {
      if (profile.action && rng.chance(0.5)) return line + rng.pick(profile.action);
      return line;
    }
    const open = m[0][0];
    const close = m[0][m[0].length - 1];
    let q = m[1];
    if (profile.catch && rng.chance(0.32)) {
      q = rng.pick(profile.catch);
    } else {
      if (profile.short && q.length > 7 && rng.chance(profile.short)) {
        const cut = q.split(/[，、；：]/)[0];
        if (cut && cut.length < q.length) q = cut.replace(/[。！？…~]+$/, '') + '……';
      }
      if (profile.quip && rng.chance(0.55)) q = rng.pick(profile.quip) + '，' + q;
      if (profile.sharp && rng.chance(0.45)) q = rng.pick(['呵，', '啧，']) + q;
      if (profile.exclaim && rng.chance(profile.exclaim)) q = q.replace(/[。！？…~]+$/, '') + '！';
      if (profile.soft && rng.chance(0.45)) {
        q = q.replace(/[。！？…~，]+$/, '') + rng.pick(profile.soft);
      } else if (profile.suffix && rng.chance(0.5)) {
        q = q.replace(/[。！？…~]+$/, '') + rng.pick(profile.suffix);
      }
    }
    return line.replace(m[0], open + q + close);
  }

  /* ============================================================
     对话情境库：每套脚本 [ {s:'a'|'b', t:台词模板} ]
     a = 主角, b = 对手/对方, c = 第三者
     ============================================================ */
  const DIALOGUES = {
    confront: [
      [
        { s: 'b', t: '{b}冷笑一声：「我早该料到是你。」' },
        { s: 'a', t: '{hero}没有反驳：「彼此彼此。」' },
        { s: 'b', t: '「你以为你能改变什么？」' },
        { s: 'a', t: '「总得有人试试。」' },
      ],
      [
        { s: 'b', t: '「收手吧，现在回头还来得及。」' },
        { s: 'a', t: '「从我决定走这条路的那天起，就没有回头路了。」' },
        { s: 'b', t: '「那就别怪我不念旧情。」' },
        { s: 'a', t: '「我也一样。」' },
      ],
    ],
    threat: [
      [
        { s: 'b', t: '{b}压低声音：「交出东西，我留你一命。」' },
        { s: 'a', t: '{hero}迎上他的目光：「你大可以试试。」' },
        { s: 'b', t: '「敬酒不吃吃罚酒。」' },
      ],
      [
        { s: 'b', t: '「你知道的太多了。」' },
        { s: 'a', t: '「巧了，我觉得我知道得还不够多。」' },
        { s: 'b', t: '「那就去地狱里，继续找你的答案吧。」' },
      ],
    ],
    plea: [
      [
        { s: 'b', t: '「求求你……求求你救救他，你要什么我都给你。」' },
        { s: 'a', t: '{hero}没有答应，也没有拒绝。他只是握紧了手。' },
      ],
      [
        { s: 'b', t: '「这件事，只有你能做了。」' },
        { s: 'a', t: '{hero}沉默了很久：「……我知道了。」' },
      ],
    ],
    confess: [
      [
        { s: 'a', t: '「有件事，我一直没有告诉你。」' },
        { s: 'b', t: '{b}停下脚步，回头看着他。' },
        { s: 'a', t: '「其实那晚……我看见了。」' },
        { s: 'b', t: '空气骤然安静。{b}的瞳孔，微微收缩了一下。' },
      ],
    ],
    quarrel: [
      [
        { s: 'b', t: '「你从来就只想着你自己！」' },
        { s: 'a', t: '{hero}的声音也冷了下来：「你又何曾替我想过？」' },
        { s: 'b', t: '「好，好得很。从今往后，我们各走各的路。」' },
      ],
      [
        { s: 'a', t: '「为什么不告诉我？」' },
        { s: 'b', t: '{b}偏过头：「告诉你又能怎样？」' },
        { s: 'a', t: '「至少……至少我不会让你一个人扛。」' },
      ],
    ],
    comfort: [
      [
        { s: 'b', t: '「别怕。」' },
        { s: 'a', t: '{hero}怔了怔：「我不怕。」' },
        { s: 'b', t: '{b}笑了笑：「嗯，我知道。你只是嘴硬。」' },
      ],
      [
        { s: 'a', t: '「会好起来的，对吧？」' },
        { s: 'b', t: '{b}没有回答，只是轻轻拍了拍他的肩。' },
      ],
    ],
    banter: [
      [
        { s: 'b', t: '「喂，你还欠我一顿饭呢。」' },
        { s: 'a', t: '{hero}挑眉：「记着呢。等事情了了，请你吃顿好的。」' },
        { s: 'b', t: '「那可说好了，别赖账。」' },
      ],
    ],
    lastWords: [
      [
        { s: 'b', t: '「替我……照顾好她。」' },
        { s: 'a', t: '{hero}点头，喉头发紧：「你放心。」' },
        { s: 'b', t: '{b}露出一个释然的笑，缓缓合上了眼。' },
      ],
    ],
    reveal: [
      [
        { s: 'a', t: '「其实，我知道你是谁。」' },
        { s: 'b', t: '{b}的动作顿住了。' },
        { s: 'a', t: '「我一直在等你自己说出来。可惜，你让我失望了。」' },
      ],
    ],
  };

  /* ============================================================
     段落生产器：每个返回一段（或多段，用 \n\n 分隔）
     ctx: { rng, novel, chapter, state, style, genre, flavor }
     ============================================================ */
  const PRODUCERS = {
    // 开篇
    open(ctx) {
      const { rng, genre, state } = ctx;
      const place = state.place || rng.pick(genre.places);
      const flavor = genre.flavor;
      return MQ.Content.SCENE.open(rng, flavor, place, { heroName: state.hero });
    },

    // 氛围
    ambient(ctx) {
      const { rng, genre, state } = ctx;
      return MQ.Content.SCENE.ambient(rng, genre.flavor, state.place || rng.pick(genre.places));
    },

    // 事件推进（从题材事件池取，本章内不重复）
    event(ctx) {
      const { rng, genre, state } = ctx;
      const used = state.usedEvents || (state.usedEvents = new Set());
      let pool = genre.events.filter(e => !used.has(e));
      if (!pool.length) { used.clear(); pool = genre.events; }
      const ev = pool[rng.int(0, pool.length - 1)];
      used.add(ev);
      state.lastEvent = ev;
      const tpl = rng.pick(POOL.eventBeats);
      return MQ.fill(tpl, { event: ev, hero: state.hero });
    },

    // 心理
    inner(ctx, kind) {
      const { rng, state } = ctx;
      const pool = kind === 'resolve' ? POOL.innerResolve
        : kind === 'sorrow' ? POOL.innerSorrow
        : POOL.innerTension;
      return MQ.fill(rng.pick(pool), { hero: state.hero });
    },

    // 对话（自动套用说话人的性格台词风格）
    dialogue(ctx, sceneKey) {
      const { rng, state } = ctx;
      const scripts = DIALOGUES[sceneKey] || DIALOGUES.confront;
      const script = rng.pick(scripts);
      const lines = [];
      const other = state.otherName || '对方';
      const heroChar = state.heroChar || {};
      const otherChar = state.otherChar || {};
      for (const turn of script) {
        const isHero = turn.s === 'a';
        const who = isHero ? state.hero : other;
        const profile = speechProfile(isHero ? heroChar.personaOuter : otherChar.personaOuter);
        const t = MQ.fill(turn.t, { hero: state.hero, b: other });
        let line;
        // 模板已自带说话人或动作 → 直接输出
        if (t.includes(who)) {
          line = t;
        } else if (t.startsWith('「') || t.startsWith('“')) {
          // 纯台词 → 补说话人（带动作概率）
          if (rng.chance(0.45)) line = who + rng.pick(POOL.acts) + '，' + t;
          else line = who + '：' + t;
        } else {
          line = who + rng.pick(POOL.acts) + '，' + t;
        }
        lines.push(personalizeLine(line, profile, rng));
      }
      return lines.join('\n');
    },

    // 战斗
    fight(ctx, outcome) {
      const { rng, state } = ctx;
      const parts = [];
      parts.push(rng.pick(POOL.actionHits));
      parts.push(rng.pick(POOL.fightExchanges));
      parts.push(MQ.fill(outcome === 'win' ? rng.pick(POOL.fightResultWin) : rng.pick(POOL.fightResultLose), { hero: state.hero }));
      return parts.join('\n');
    },

    // 转折/真相
    reveal(ctx) {
      const { rng, state } = ctx;
      return MQ.fill(rng.pick(POOL.reveals), { hero: state.hero });
    },

    // 日常/铺垫（输出两句，更充实）
    slice(ctx) {
      const { rng, state, genre } = ctx;
      const pieces = [
        `${state.hero}在${state.place || '这里'}待了许久，想了很多事。远处的${rng.pick(genre.flavor.nouns)}起伏着，像一页没写完的稿纸。`,
        `这些天来，${state.hero}把前前后后的事在脑子里过了无数遍。${state.place || '此地'}的日头照常升起，可有些东西，再也回不去了。`,
        `日子流水一样过去。${state.hero}心里那根弦，却一天比一天绷得紧。每一声寻常的响动，都能让他停下手里的活，侧耳听上许久。`,
        `${state.hero}把那件事在心头翻来覆去地掂量。有些答案明明近在眼前，可一伸手，又像雾一样散开了。`,
      ];
      const p = rng.shuffle(pieces);
      return p.slice(0, rng.chance(0.5) ? 2 : 1).join('\n');
    },

    // 收尾钩子
    close(ctx) {
      const { rng, state } = ctx;
      return MQ.fill(rng.pick(POOL.hooks), { hero: state.hero });
    },
  };

  /* ============================================================
     章节结构模板：按大纲 beat 类型映射段落生产器序列
     ============================================================ */
  // 注意：收尾钩子由引擎统一在章节末尾追加，pattern 中不再包含 close
  const CHAPTER_PATTERNS = {
    intro:   ['open', 'ambient', 'inner', 'slice', 'dialogue:comfort', 'event'],
    daily:   ['open', 'slice', 'dialogue:banter', 'inner', 'slice', 'event'],
    incite:  ['open', 'slice', 'event', 'inner:tension', 'dialogue:confront', 'event'],
    depart:  ['open', 'inner:resolve', 'event', 'dialogue:plea', 'slice', 'event'],
    explore: ['open', 'ambient', 'event', 'dialogue:banter', 'event', 'inner'],
    meet:    ['open', 'event', 'dialogue:comfort', 'inner', 'event', 'dialogue:confront'],
    trial:   ['open', 'event', 'fight:lose', 'inner:sorrow', 'dialogue:plea', 'inner:resolve'],
    approach:['open', 'event', 'dialogue:reveal', 'inner', 'event', 'reveal'],
    low:     ['open', 'ambient', 'inner:sorrow', 'dialogue:quarrel', 'fight:lose', 'inner:sorrow'],
    rally:   ['open', 'inner:resolve', 'dialogue:comfort', 'event', 'fight:win'],
    climax:  ['open', 'event', 'fight:lose', 'inner:resolve', 'fight:win', 'reveal'],
    cost:    ['open', 'event', 'dialogue:lastWords', 'inner:sorrow', 'reveal'],
    resolve: ['open', 'event', 'dialogue:confess', 'inner', 'fight:win'],
    after:   ['open', 'slice', 'dialogue:banter', 'inner'],
  };

  MQ.Prose = {
    STYLES,
    getStyle(id) { return STYLES[id] || STYLES.fierce; },
    applyStyle,
    PRODUCERS,
    CHAPTER_PATTERNS,
    POOL,
    DIALOGUES,
    SPEECH_PROFILES,
    speechProfile,
    personalizeLine,
  };

})(window.MQ);
