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
      phrases: [
        '此间种种，原非一夕之事。', '{hero}默然良久，只觉天地寂寥，心事如潮。',
        '一川烟草，满城风絮。{hero}立在{place}，忽觉岁月悠长，而人世苦短。',
        '彼时云深不知处，回首已是百年身。', '青山不语，流水无言。一切尽在不言之中。',
      ],
      desc: '辞藻清雅，句式舒展，读来如临水墨长卷。',
    },
    fierce: {
      id: 'fierce', name: '热血激昂',
      replaces: [['他慢慢', '他猛地'], ['一点一点', '一寸一寸'], ['尽力', '拼尽全力'], ['害怕', '绝不退缩'],
        ['平静', '滚烫'], ['小心', '悍然'], ['后退', '不退反进']],
      openers: ['来了——', '就是现在！', '一口气提到胸口，'],
      closers: ['这一战，不死不休！', '他，绝不认输。', '血还在烧。'],
      shortRate: 0.7,
      phrases: [
        '{hero}咬紧牙关。不能退。退一步，就什么都没有了。',
        '他感觉到了——那股力量，正在体内苏醒。像一头被困了很久的野兽，终于撞开了牢笼。',
        '拼了！{hero}再不犹豫。这一击，赌上全部。',
        '没有人看好他。没有人。但{hero}不在乎。赢，就够了。',
      ],
      desc: '短句如刀，节奏如鼓，读来热血沸腾。',
    },
    mystery: {
      id: 'mystery', name: '冷峻悬疑',
      replaces: [['但是', '然而'], ['突然', '忽然'], ['发现', '觉察'], ['想', '思忖'], ['原来', '竟'],
        ['大声', '低声'], ['害怕', '不安'], ['很多', '诸多']],
      openers: ['起初，', '没有人注意到', '那是个再寻常不过的'],
      closers: ['事情，远没有结束。', '而答案，还藏在黑暗里。', '真相，才刚刚露出一个角。'],
      shortRate: 0.68,
      phrases: [
        '{place}的每一个角落都像在窥视。', '他忽然觉得脊背发凉。这感觉——不对。',
        '有什么东西，就在视线之外。{hero}不敢回头。', '安静。太安静了。安静得不像真的。',
      ],
      desc: '克制留白，字字机锋，寒气从纸面渗出来。',
    },
    lyric: {
      id: 'lyric', name: '细腻文艺',
      replaces: [['然后', '而后'], ['但是', '只是'], ['突然', '骤然'], ['非常', '格外'], ['很多', '许多'],
        ['看到', '望见'], ['想到', '想起'], ['也许', '或许'], ['高兴', '欢喜']],
      openers: ['那天的风很轻，', '回忆像潮水，', '有些事，注定要落在心上'],
      closers: ['像一页翻过去的书，轻轻合上。', '而风继续吹着，吹过很多年。', '他把那些话，慢慢咽了回去。'],
      shortRate: 0.4,
      phrases: [
        '有些情绪像黄昏的光——温柔、缓慢、不可挽留。', '{hero}忽然很想念一个已经模糊了轮廓的下午。',
        '时间是条很长的河。{hero}站在河边，看着自己从上游漂来——年轻的、莽撞的、以为一切都可以重来的自己。',
        '{place}的每一片叶子都像一首未写完的诗。',
      ],
      desc: '长句如丝，意象细腻，情感在字缝里流淌。',
    },
    humor: {
      id: 'humor', name: '诙谐轻快',
      replaces: [['慢慢', '磨磨蹭蹭地'], ['非常', '贼'], ['走', '溜'], ['看', '瞅'], ['说', '嘀咕'],
        ['害怕', '怂'], ['漂亮', '顶好看'], ['生气', '炸毛']],
      openers: ['要说这事，还得从头讲起——', '说出来你可能不信，', '那天的剧本，写满了「意外」两个字'],
      closers: ['当然，这是后话。', '日子嘛，总得笑着过。', '他后来回忆说：值了。'],
      shortRate: 0.55,
      phrases: [
        '得，又摊上事了。{hero}翻了个白眼，认命地叹了口气。',
        '这事说出去谁信？可偏偏就是真的。', '{hero}挠了挠头：这剧本，是不是拿错了？',
      ],
      desc: '插科打诨，节奏轻快，读来会心一笑。',
    },
    epic: {
      id: 'epic', name: '史诗宏阔',
      replaces: [['很大', '辽阔'], ['很多', '万千'], ['重要', '关乎苍生'], ['前进', '奔赴'], ['国家', '山河'],
        ['决定', '抉择'], ['战斗', '征战'], ['开始', '序幕拉开']],
      openers: ['百年之后，史书会这样记载——', '大幕，在这一刻拉开。', '风起于青萍之末，终成席卷之势。'],
      closers: ['而这，仅仅是开始。', '时代的车轮，碾过每一个人的命运。', '他的名字，将被写入这段历史。'],
      shortRate: 0.5,
      phrases: [
        '千万人的命运悬于一线。{hero}站在线的一端，掌心全是汗。',
        '天边压着铅灰色的云，像整段历史在蓄势待发。', '没有人知道这一战将如何载入史册。但每个人都知道：回不去了。',
        '{place}在晨光中沉默着，像一个正在等待答案的巨人。',
      ],
      desc: '视野开阔，气吞山河，字句间皆是时代重量。',
    },
  };

  /* ============================================================
     自定义文风（用户保存的特色词汇 / 句式，持久化在 MQ.Store）
     ============================================================ */
  function customStyles() {
    const s = (MQ.Store && MQ.Store.getCustomStyles) ? MQ.Store.getCustomStyles() : [];
    return Array.isArray(s) ? s : [];
  }

  // 全部文风：内置 + 自定义
  function listStyles() {
    return Object.values(STYLES).concat(customStyles());
  }

  function getStyle(id) {
    if (id) {
      const c = customStyles().find(s => s && s.id === id);
      if (c) return c;
      if (STYLES[id]) return STYLES[id];
    }
    return STYLES.fierce;
  }

  // 保存 / 删除自定义文风（同名覆盖）
  function saveCustomStyle(style) {
    const list = customStyles().filter(s => s && s.id !== style.id);
    list.push(style);
    MQ.Store.saveCustomStyles(list);
  }

  function deleteCustomStyle(id) {
    MQ.Store.saveCustomStyles(customStyles().filter(s => s && s.id !== id));
  }

  /* ============================================================
     文风修饰器
     ============================================================ */
  // kind 用于识别段落类型：open/ambient/slice 才做特色词汇点缀（对话、动作、心理不掺），保持可读性
  const AMBIENT_KINDS = new Set(['open', 'ambient', 'slice']);

  function applyStyle(style, text, kind, rng) {
    let t = text;
    // 词汇替换
    for (const [from, to] of style.replaces) {
      t = t.split(from).join(to);
    }
    // 自定义特色词汇点缀：低概率（约 15%）追加到氛围句尾，如「……，诡谲。」
    if (kind && AMBIENT_KINDS.has(kind) && style.words && style.words.length) {
      const rand = rng || { pick: (a) => a[0], chance: () => false };
      const w = rand.pick(style.words);
      if (w && !t.includes(w) && /[。！？]$/.test(t) && rand.chance(0.15)) {
        t = t.replace(/([。！？])$/, '，' + w + '$1');
      }
    }
    return t;
  }

  /* ============================================================
     素材池 —— 五感细节·比喻修辞·心理深度·肢体·转场·氛围
     ============================================================ */
  const POOL = {
    // 动作/神态（用于对话轮与行动段）
    acts: [
      '皱了皱眉', '握紧了拳', '目光一沉', '轻轻叹了口气', '眼神闪烁了一下', '嘴角勾起一丝弧度',
      '瞳孔骤然一缩', '垂下眼帘', '声音放低了几分', '脚步微顿', '指尖微微发颤', '抬起头，直视',
      '冷笑一声', '深吸一口气', '缓缓开口', '喉结滚动了一下', '手按上了兵器', '脊背挺得笔直',
    ],
    // 微表情与细腻肢体（用于心理/日常段）
    microActs: [
      '眼睫轻轻颤了颤', '唇角抿成一条线', '指甲在掌心掐出浅浅的印子', '无意识地摩挲着袖口',
      '目光飘向窗外，像是在找什么', '呼吸顿了顿，又恢复了平稳', '舌头顶了一下后槽牙',
      '把玩着手里的一片叶子，不紧不慢', '肩膀不自觉地绷紧了一瞬，又松下来',
      '抬手按了一下眉心', '右手食指在桌上敲了三下，然后停住', '偏过头，不让对方看见自己的表情',
    ],
    // 五感——视觉细节
    sensorySight: [
      '{place}在这样的时刻显出一种异样的美——{hero}说不上来，只觉眼前的色彩比平日更浓，也更不真实。',
      '光线从{place}的缝隙间漏下来，在{hero}脚边铺成一片碎金。',
      '远远望去，{place}的轮廓被暮色描了一层淡淡的金边，温柔得不像真的。',
      '斑驳的墙面上，影子在烛光里晃动，像一幅活过来的水墨画。',
      '{hero}眯起眼，目光扫过{place}的每个角落——那些被忽略的细节，此刻忽然清晰起来。',
      '眼前的一切像隔着一层薄薄的水雾，模糊、遥远，却又近在咫尺。',
    ],
    // 五感——听觉
    sensorySound: [
      '风穿过{place}，发出呜呜咽咽的声响，像谁在远处低低地唱着歌。',
      '{hero}竖起耳朵。那声音极轻——像是衣料摩擦、又像是脚步——在寂静里慢慢铺开。',
      '四下里静得厉害，静到{hero}能听见自己的呼吸、心跳，以及血液在耳道里奔流的声音。',
      '就在这令人窒息的寂静里，突然传来一声极轻的响动——嗒。像水珠落在石板上。',
      '远远的，有钟声穿过雾气传过来。一下，一下，不急不缓，仿佛在丈量时间本身。',
      '风声停了那一瞬间，{hero}忽然听见了自己心里的声音。',
    ],
    // 五感——嗅觉/味觉
    sensorySmell: [
      '空气里弥漫着一股潮湿的泥土味，混合着若有若无的草木苦涩。',
      '{hero}深深吸了一口气——那是{place}独有的气息：旧木、灰尘，和一点点铁锈的甜腥。',
      '一缕淡淡的血腥味飘过鼻腔。{hero}的瞳孔缩了缩：这味道，他认得。',
      '夜风送来远处炊烟的气息——柴火、米汤、和一点点焦香。{hero}的肚子不争气地响了一下。',
      '那味道很熟悉，却又说不上来——像某个被遗忘的下午，阳光穿过窗格，落在母亲手边的茶盏上。',
    ],
    // 五感——触觉
    sensoryTouch: [
      '{hero}伸手碰了碰那面墙。石头又冷又糙，像时间凝固在了掌心里。',
      '风吹在脸上，凉丝丝的，带着深秋特有的干爽。{hero}拢了拢衣领，把寒意挡在外面。',
      '指尖触到的是粗粝的纹路——老的、深的、被无数双手摸过的痕迹。',
      '那一瞬间的触感——又湿又滑，像蛇蜕——让{hero}整个人僵了一瞬。',
    ],
    // 比喻与修辞（用于插叙/润色，替换 {thing} {like}）
    similes: [
      '像一只蛰伏已久的兽，终于睁开了眼', '恰似一叶扁舟，在命运的激流里打转',
      '如同深冬的河水，表面不动声色，底下早已暗流汹涌', '就像一张被反复擦写的旧纸，痕迹叠着痕迹',
      '好似夜空里的流星——亮了一瞬，然后沉入无边的黑暗', '像隔着一层磨砂玻璃看世界：轮廓在，细节模糊',
      '如一面被打碎的镜子，每一片碎片里，都映着一个不完全的自己', '像一滴墨落进清水——四散开来，再也收不回去',
    ],
    // 内心独白——张力
    innerTension: [
      '{hero}的心跳快了半拍。有些话堵在喉咙口，说不出来，也咽不下去。',
      '{hero}意识到，从这一刻起，有些东西已经不一样了。就像一扇门被推开，再也没法假装它关着。',
      '恐惧像潮水一样漫上来，但{hero}没有退。退了，就什么都没有了。',
      '{hero}忽然明白，这就是他一直等着的时刻。他等了很多年，久到几乎忘了自己为什么在等。',
      '{hero}的呼吸变得又细又急。理智告诉他应该冷静，可身体比大脑诚实——他的手在抖，不受控制地。',
      '他在心里把那个名字反复念了三遍。每念一遍，胸腔里就有什么东西收紧一寸。',
      '{hero}站住了。不是因为前面的危险，而是因为他忽然意识到：这一次，没有人会来接他。',
      '那道槛就在眼前。{hero}知道，跨过去，就再也回不了头。但他更知道，不跨过去，这一生都会活在"如果"里。',
    ],
    // 内心独白——决心
    innerResolve: [
      '{hero}深吸一口气。既然没有退路，那就往前走——哪怕前面是刀山火海。',
      '那一瞬间，{hero}心里所有的犹豫都落定了。答案早就在那里，只是他一直没有承认。',
      '{hero}抬起头，眼底燃起一点光。这条路很难，但他偏要走到底。',
      '有些账，总要有人来算；有些事，总要有人来做。{hero}决定，这个人是他。',
      '他把恐惧折了折，压在心底最深处。然后抬起头。面上一片平静，像什么都没有发生过。',
      '最坏的结果，{hero}在心里想过无数遍了。正因为想过，此刻面对它，反而生出一股奇异的坦然。',
      '不是不怕。是怕过了头，反而不怕了。{hero}攥紧的拳头缓缓松开——掌心，早已攥出了血印。',
    ],
    // 内心独白——悲伤
    innerSorrow: [
      '回忆涌上来，像一根根细针，扎得{hero}眼眶发酸。他咬住牙，不让任何东西掉下来。',
      '{hero}沉默了很久。有些话，说出来太轻，咽下去太重。',
      '夜色落在{hero}肩上。他忽然觉得，一个人走夜路，原来是这样冷的。',
      '他以为自己早就不在乎了。可是那阵风夹着旧日的气息吹过来的时候，鼻子还是一酸。',
      '{hero}在心底对自己说：没事的。说了三遍。眼泪还是在第三遍的尾音里掉了下来。',
      '失去的不是一件东西，是一段人生。{hero}望着空荡荡的屋子，忽然不知道接下来该做什么。',
    ],
    // 内心独白——恐惧
    innerFear: [
      '{hero}的后背一阵阵发凉。不是冷——是一种从骨头缝里渗出来的寒意，像有人在暗处盯着他。',
      '他忽然生出一个念头：如果这一切都是假的就好了。可膝盖上传来的痛楚，把幻觉撕得粉碎。',
      '{hero}从不信命。但此刻，他第一次感到有只看不见的手，正在把他推向一个深不见底的未来。',
      '那个名字从别人嘴里说出来的时候，{hero}的手指痉挛了一下——不是愤怒，是本能的恐惧。',
    ],
    // 内心独白——希望
    innerHope: [
      '黑暗中，{hero}忽然想起一句话：最深的夜，离天亮最近。他不知道自己为什么会想起这个，但嘴角不由自主地弯了一下。',
      '也许明天不会更好。但至少，今晚他还有力气点一盏灯。{hero}把烛台往近处挪了挪，火光映在脸上，暖暖的。',
      '{hero}抬起头，夜空里有一颗星在闪烁。很小，也很远。可它就是亮着，像在告诉所有的人：我还在。',
    ],
    // 内心独白——悔恨
    innerRegret: [
      '如果那天他多问一句，如果那晚他没有转身就走——可惜，人生没有如果。{hero}闭上眼，把那个名字在心底又念了一遍。',
      '{hero}终于明白：最大的代价不是失败，而是明明有机会，却没有伸出手。而那些没来得及说出的话，永远地堵在了某年某月的某个路口。',
      '他以为时间会冲淡一切。可每当夜深人静，那些画面就轮番上演——每一次都比前一次更清晰，更锋利。',
    ],
    // 动作开段
    actionHits: [
      '身形一闪，抢先一步出手。',
      '没有多余的废话，两人几乎同时动了。',
      '一拳砸出，带着风声，直取要害。',
      '侧身避开锋芒，反手一击，又快又狠。',
      '脚步错动间，已欺身近前。这一下出其不意，连旁观者都倒吸了一口气。',
      '他不动声色地压低了重心。下一秒，整个人像绷紧的弓弦，猛地弹了出去。',
    ],
    fightExchanges: [
      '你来我往，短短几个呼吸间，已交手数招。',
      '兵器碰撞的声响在空气里炸开，火星四溅。',
      '这一击快若惊雷，却在最后一寸堪堪停住——两个人都没有真的下死手。',
      '一方攻势如潮，一方守得密不透风。僵持之际，谁先露出破绽，谁就输了。',
      '两人绕着圈子，谁也没有先动。汗水顺着鬓角滑下来，滴在地上，在寂静里响得分明。',
      '每一次交锋都在试探对方的底线。拳风擦过脸颊，谁的眼里都没有退的意思。',
    ],
    fightResultWin: [
      '尘埃落定。{hero}喘息着站定，抹了一把嘴角的血，眼底却亮得惊人。',
      '当最后一声闷响落地，胜负已分。{hero}赢了，赢得并不轻松。',
      '对方踉跄后退，再没能站起来。{hero}收了势，没有追击。',
      '{hero}半跪在地上，大口大口地喘着气。赢了。可是手还在抖，停不下来。',
    ],
    fightResultLose: [
      '这一战，{hero}败了。败得彻彻底底，连反击的力气都没剩下。',
      '剧痛袭来，{hero}单膝跪地。他输了，输掉了最后的筹码。',
      '{hero}被击倒在地，眼前一片模糊。世界在旋转，而败局，已经尘埃落定。',
      '他听见骨头断裂的声音——是自己的。疼痛像电流一样窜遍全身，{hero}咬着牙，硬是没吭一声。',
    ],
    // 危机/事件推进段
    eventBeats: [
      '变故来得毫无预兆。{event}。所有人还没反应过来，局势已经彻底变了。',
      '就在这时，{event}。整个场面，瞬间安静了下来。',
      '谁也没有料到，{event}。空气仿佛凝滞了一瞬，然后轰然炸开。',
      '{event}。这句话落在每个人耳中，分量重得让人喘不过气。',
      '没有任何征兆。{event}。那一刻，所有嘈杂声都消失了，像有人按下了静音键。',
      '{event}。一句话，五个字。却比任何惊雷都响。',
    ],
    // 转折/真相段
    reveals: [
      '真相揭开的瞬间，{hero}反而平静了下来。原来如此——所有的疑点，在这一刻串成了一条线。',
      '那封泛黄的旧信，终于被摊开在灯下。{hero}读着读着，手指开始发颤：这一切，从一开始就是个局。',
      '他忽然想通了。许多年前的那个雨夜，那些被忽略的细节，此刻全都有了答案。',
      '秘密像一堵墙，此刻轰然倒塌。墙后站着的人，让{hero}整个人僵在了原地。',
      '像一根线头被拽了出来。{hero}沿着它往下拉——越拉越长，越拉越心惊。',
      '那些拼图，在脑子里卡了很久。忽然某一秒，咔嗒，全对上了。{hero}倒吸一口气。',
    ],
    // 章末钩子
    hooks: [
      '而在很远的地方，有人睁开了眼睛。',
      '他不知道的是，这只是开始。',
      '那一夜的雨，下了很久很久。久到许多年后，{hero}依然记得这夜的潮湿。',
      '黑暗中，传来一声极轻的叹息。像叹息，又像——呼唤。',
      '而他不知道，明天等待他的，将是一个完全不同的答案。',
      '门在身后合上。故事，才刚刚开始。',
      '风继续吹着，不知道要吹向哪里。一如{hero}的命运。',
      '{hero}走了很远，才敢回头看一眼。来路已经被夜色吞没了，只剩下星星点点的灯火，像一个个悬在半空中的问号。',
    ],
    // 转场桥段（时间/空间过渡）
    transitions: [
      '一夜无话。第二天清晨，{place}在薄雾里醒来，似乎什么都不曾发生过。',
      '三日后。{hero}站在{place}的入口，回头看了一眼来路。那段路很短，却像走了一辈子。',
      '时间在不知不觉中流过。等{hero}再次抬起头，发现日头已经偏西了。',
      '当天夜里，{hero}做了一个很长很长的梦。梦里他回到了最初的地方——一切还未开始，一切都来得及。',
      '又是一年。{place}的景色换了一轮，{hero}也不再是当初那个站在路口手足无措的人了。',
    ],
    // 环境氛围（天气/景物映射心情）
    atmosphere: [
      '不知什么时候起，天色暗了下来。云层压得很低，像一张灰色的毯子盖住了整片天空。{hero}望向远方，心里也跟着沉了沉。',
      '风忽然停了。{place}安静得不像话——连虫鸣鸟叫都消失得干干净净。{hero}不由得放慢了脚步。',
      '夕阳把{place}染成一片金红色。这本该是让人心里一暖的景象，可{hero}看着看着，却莫名生出一股离别的预感。',
      '起风了。风声穿过{place}的缝隙，发出一种难以名状的呜咽。{hero}把衣领往上拉了拉——不只是因为这寒意。',
      '久违的阳光从云层后面钻出来，落在{hero}手背上。暖暖的，轻轻的，像一个迟到了很久的拥抱。',
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
    /* ---- 对峙 ---- */
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
      [
        { s: 'b', t: '{b}盯着{hero}的眼睛，一字一顿：「你欠我一个答案。」' },
        { s: 'a', t: '{hero}垂下眼帘，又抬起来：「答案我有，就怕你接不住。」' },
        { s: 'b', t: '「那就来试试。」' },
      ],
      [
        { s: 'a', t: '「所以从一开始，你就在说谎。」' },
        { s: 'b', t: '{b}没有否认：「有些真话，比谎言更残忍。你确定要听？」' },
        { s: 'a', t: '{hero}沉默。然后，缓缓点了头。' },
      ],
    ],
    /* ---- 威胁 ---- */
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
      [
        { s: 'b', t: '「我给你三天时间。三日后——要么你束手，要么我动手。」' },
        { s: 'a', t: '{hero}笑了一下。那种笑不是嘲讽，也不是愤怒，只是在陈述一个事实：「三天？用不了那么久。」' },
      ],
    ],
    /* ---- 恳求 ---- */
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
    /* ---- 坦白 ---- */
    confess: [
      [
        { s: 'a', t: '「有件事，我一直没有告诉你。」' },
        { s: 'b', t: '{b}停下脚步，回头看着他。' },
        { s: 'a', t: '「其实那晚……我看见了。」' },
        { s: 'b', t: '空气骤然安静。{b}的瞳孔，微微收缩了一下。' },
      ],
      [
        { s: 'b', t: '{b}忽然开口：「这句话我憋了很久——我不想再装了。」' },
        { s: 'a', t: '{hero}愣在原地。不是因为话的内容，而是因为{b}说话时的表情：那是他从未见过的脆弱。' },
        { s: 'b', t: '「从头到尾，我都不敢让你知道。因为一旦你知道，你就会走。」' },
        { s: 'a', t: '「……」{hero}张了张嘴，一个字也说不出来。' },
      ],
    ],
    /* ---- 争吵 ---- */
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
      [
        { s: 'b', t: '「你骗就骗吧，可你连骗都懒得骗好一点。」' },
        { s: 'a', t: '{hero}握紧拳，指甲嵌进掌心：「那你想让我怎么骗你？说你什么都没做错，说一切都是我的错——你满意了？」' },
        { s: 'b', t: '{b}被击中了。她/他的脸色倏地白了。' },
      ],
    ],
    /* ---- 安慰 ---- */
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
      [
        { s: 'b', t: '「哭吧。」{b}把{hero}揽进怀里，「我在这儿，谁也不会来笑话你。」' },
        { s: 'a', t: '{hero}咬着牙，拼命摇头。可眼泪不听指挥，一颗一颗砸在{b}肩上。' },
      ],
    ],
    /* ---- 拌嘴 ---- */
    banter: [
      [
        { s: 'b', t: '「喂，你还欠我一顿饭呢。」' },
        { s: 'a', t: '{hero}挑眉：「记着呢。等事情了了，请你吃顿好的。」' },
        { s: 'b', t: '「那可说好了，别赖账。」' },
      ],
      [
        { s: 'a', t: '「你说，咱们像不像两个傻子？」' },
        { s: 'b', t: '{b}白了他一眼：「不是你像，是就是。」' },
        { s: 'a', t: '{hero}笑了出来。很久没有这样笑过了。' },
      ],
    ],
    /* ---- 临终 ---- */
    lastWords: [
      [
        { s: 'b', t: '「替我……照顾好她。」' },
        { s: 'a', t: '{hero}点头，喉头发紧：「你放心。」' },
        { s: 'b', t: '{b}露出一个释然的笑，缓缓合上了眼。' },
      ],
      [
        { s: 'b', t: '「别记恨我。」{b}的声音已经很轻了，像风里的一根线，「我做的那些事……每一件，都以为是为你好。」' },
        { s: 'a', t: '{hero}握住那只渐渐变凉的手：「我从来没恨过你。」' },
      ],
    ],
    /* ---- 揭露真相 ---- */
    reveal: [
      [
        { s: 'a', t: '「其实，我知道你是谁。」' },
        { s: 'b', t: '{b}的动作顿住了。' },
        { s: 'a', t: '「我一直在等你自己说出来。可惜，你让我失望了。」' },
      ],
      [
        { s: 'b', t: '{b}把一枚旧钥匙推过桌面：「打开它，你就什么都明白了。不过——打开以后，别后悔。」' },
        { s: 'a', t: '{hero}盯着那把钥匙。它安安静静地躺在那里，像一个打开了的潘多拉魔盒的邀请函。' },
      ],
    ],
    /* ---- 沉默中的潜台词（没有人说话，但情绪在流动）---- */
    silence: [
      [
        { s: 'a', t: '{hero}想开口。话在舌尖转了一圈，又咽了回去。' },
        { s: 'b', t: '{b}也沉默着。两个人就这样站着，谁都没有再说一个字。可是沉默本身，已经把什么都说了。' },
      ],
      [
        { s: 'b', t: '{b}看了{hero}一眼。就一眼。然后别过头去，再也不看他了。' },
        { s: 'a', t: '就那一眼，{hero}从中读出了失望、疲惫，和一个他没有勇气问出口的问题。' },
      ],
    ],
    /* ---- 侧面烘托（通过第三方之口/动作反映关系）---- */
    sideGlance: [
      [
        { s: 'c', t: '旁边的人看着他们两个，心里说不上什么滋味。一个在说，一个在听；一个在进攻，一个在退守。可是说的人自己也未必信，听的人却已经信了。' },
        { s: 'a', t: '{hero}偏头看了那人一眼。目光里没有敌意，但那人还是闭上了嘴。' },
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

    // 心理（支持 tension/resolve/sorrow/fear/hope/regret 六种变体）
    inner(ctx, kind) {
      const { rng, state } = ctx;
      const map = { resolve: POOL.innerResolve, sorrow: POOL.innerSorrow,
        fear: POOL.innerFear, hope: POOL.innerHope, regret: POOL.innerRegret };
      const pool = map[kind] || POOL.innerTension;
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

    // 日常/铺垫（扩充到 10 句，输出 1–2 段，融入比喻/微表情/五感）
    slice(ctx) {
      const { rng, state, genre } = ctx;
      const p = state.place || '这里';
      const noun = rng.pick(genre.flavor.nouns);
      const pieces = [
        `${state.hero}在${p}待了许久，想了很多事。远处的${noun}起伏着，像一页没写完的稿纸。`,
        `这些天来，${state.hero}把前前后后的事在脑子里过了无数遍。${p}的日头照常升起，可有些东西，再也回不去了。`,
        `日子流水一样过去。${state.hero}心里那根弦，却一天比一天绷得紧。每一声寻常的响动，都能让他停下手里的活，侧耳听上许久。`,
        `${state.hero}把那件事在心头翻来覆去地掂量。有些答案明明近在眼前，可一伸手，又像雾一样散开了。`,
        `不知从哪一刻起，${state.hero}养成了一个新习惯：每走过${p}的一个角落，都会下意识地记下细节——墙上的裂纹、地砖的缺口、窗台上积了几天的灰。他不知道自己为什么要这样做，也许是怕有一天，会把这些忘掉。`,
        `${state.hero}找了个地方坐下来，把脑袋靠上墙。凉意沿着后脑勺渗进去，竟然有一种说不清的踏实。他想：人活着，大概就是这样吧——从一个硬的地方，靠向另一个硬的地方，偶尔，能遇上一个软的。`,
        `四周安静极了。这样的安静在${p}并不少见，但今天格外称手——像量身定做的沉默，刚好够装下${state.hero}所有没说出口的话。`,
        `${state.hero}忽然想起很久以前的一个画面。画面里的人已经很模糊了，但那种感觉——温热、安全、像阳光照在被子上——却清清楚楚地留了下来。`,
        `有时候，${state.hero}觉得自己像一棵被风吹了很久的树。根还在土里，可是叶子，已经不知飘到什么地方去了。`,
        `${noun}在视线里轻轻摇晃。${state.hero}伸手碰了碰，指尖触到的是微凉的、粗糙的、真实的。他收回手，指腹上留着一点痕迹——像时间盖了个戳。`,
      ];
      const shuffled = rng.shuffle(pieces);
      return shuffled.slice(0, rng.chance(0.5) ? 2 : 1).join('\n');
    },

    // 收尾钩子
    close(ctx) {
      const { rng, state } = ctx;
      return MQ.fill(rng.pick(POOL.hooks), { hero: state.hero });
    },

    // 五感沉浸（随机选一个感官维度展开描写）
    sensory(ctx) {
      const { rng, state } = ctx;
      const pools = [POOL.sensorySight, POOL.sensorySight, POOL.sensorySound, POOL.sensorySound, POOL.sensorySmell, POOL.sensoryTouch];
      const pool = rng.pick(pools);
      return MQ.fill(rng.pick(pool), { hero: state.hero, place: state.place || '这里' });
    },

    // 转场桥段（时间/空间过渡）
    transition(ctx) {
      const { rng, state } = ctx;
      return MQ.fill(rng.pick(POOL.transitions), { hero: state.hero, place: state.place || '这里' });
    },

    // 比喻点睛（做独立段引用时：用环境/事物做喻体来映衬心理）
    metaphor(ctx) {
      const { rng, state } = ctx;
      return MQ.fill(rng.pick(POOL.similes), { hero: state.hero, place: state.place || '这里' });
    },

    // 环境氛围（天气/景物映射情绪）
    atmosphere(ctx) {
      const { rng, state } = ctx;
      return MQ.fill(rng.pick(POOL.atmosphere), { hero: state.hero, place: state.place || '这里' });
    },

    // 微表情/肢体细节（独立成段）
    micro(ctx) {
      const { rng, state } = ctx;
      const act = rng.pick(POOL.microActs);
      return MQ.fill(`${state.hero}${act}。`, { hero: state.hero, place: state.place || '这里' });
    },
  };

  /* ============================================================
     章节结构模板：按大纲 beat 类型映射段落生产器序列
     ============================================================ */
  // 注意：收尾钩子由引擎统一在章节末尾追加，pattern 中不再包含 close
  const CHAPTER_PATTERNS = {
    intro:   ['open', 'sensory', 'ambient', 'slice', 'inner', 'dialogue:comfort', 'event'],
    daily:   ['open', 'slice', 'dialogue:banter', 'inner', 'micro', 'slice', 'event'],
    incite:  ['open', 'slice', 'event', 'inner:tension', 'dialogue:confront', 'event'],
    depart:  ['open', 'atmosphere', 'inner:resolve', 'event', 'dialogue:plea', 'transition', 'slice'],
    explore: ['open', 'sensory', 'ambient', 'event', 'dialogue:banter', 'event', 'inner'],
    meet:    ['open', 'event', 'atmosphere', 'dialogue:comfort', 'inner', 'micro', 'event'],
    trial:   ['open', 'event', 'fight:lose', 'inner:sorrow', 'dialogue:plea', 'inner:resolve'],
    approach:['open', 'atmosphere', 'event', 'dialogue:reveal', 'inner', 'event', 'reveal'],
    low:     ['open', 'ambient', 'inner:sorrow', 'dialogue:quarrel', 'fight:lose', 'inner:sorrow'],
    rally:   ['open', 'inner:resolve', 'dialogue:comfort', 'atmosphere', 'event', 'fight:win'],
    climax:  ['open', 'event', 'micro', 'fight:lose', 'inner:resolve', 'fight:win', 'reveal'],
    cost:    ['open', 'event', 'dialogue:lastWords', 'inner:sorrow', 'atmosphere', 'reveal'],
    resolve: ['open', 'event', 'dialogue:confess', 'inner', 'transition', 'fight:win'],
    after:   ['open', 'slice', 'sensory', 'dialogue:banter', 'inner', 'slice'],
  };

  MQ.Prose = {
    STYLES,
    getStyle,
    listStyles,
    saveCustomStyle,
    deleteCustomStyle,
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
