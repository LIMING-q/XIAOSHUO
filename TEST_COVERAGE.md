# 测试覆盖率报告

> 生成时间：2026-08-19 · 测试基线：`tests/run.js`（单元回归 84 项）+ `tests/smoke.js`（全流程冒烟 10 项）+ `tests/e2e.spec.js`（Playwright 端到端 2 项）
> 结论：**引擎层覆盖充分，UI 交互层已由 Playwright 补齐黄金路径；AI 网络层仍是最大盲区**。

---

## 总览

| 模块 | 自动化覆盖 | 覆盖方式 | 风险 |
|---|---|---|---|
| js/utils.js | 🟢 高 | run.js（含 25 项边界） | 低 |
| js/store.js | 🟡 中 | smoke.js 持久化往返 | 中 |
| js/content.js | 🟢 高 | run.js | 低 |
| js/prose.js | 🟢 高 | run.js + smoke 压力 | 中 |
| js/engine.js | 🟢 高 | run.js + smoke 压力 | 中 |
| js/ai.js | 🔴 低 | run.js（仅 extractJSON） | **高** |
| js/app.js | 🟡 中 | Playwright e2e（黄金路径 + 关系图交互） | 中 |
| sw.js / proxy.js | ⚪ 未测 | 仅 `node --check` 语法 | 中 |

**风险等级**：🟢 已覆盖 · 🟡 部分覆盖 · 🔴 盲区 · ⚪ 未测

---

## 分模块明细

### 1. js/utils.js — 🟢 高覆盖

**已覆盖**（run.js + smoke.js）
- `makeRng`（种子确定性、`int(min==max)` 边界）、`hashSeed`
- `cnNum`（0–30 中文、31+ 数字回退）、`fill`（缺键保留占位符）
- `dedupeText`（相邻去重、无重复不变）、`polish`（trim、病句清理）
- `countChars`（空/null/undefined）、`truncate`（短于上限、空串）
- `MQ.Typo.check`（10 项：四种「的地得」+ 单字/词组重复 + 叠词白名单 + 三连不误报 + 空文本）

**未覆盖**
- `el()`：DOM 构造（`class`/`text`/`html`/`style`/`on*`/`selected`/`checked`/`value` 分支）——依赖浏览器
- `esc()`（DOM XSS 转义）、`debounce()`（定时器）、`uid()` 唯一性已测、`now()`（时区）

**风险点**
- 🟡 `el()` 用「属性赋值 vs setAttribute」的边界极易踩坑（已踩过 `selected` 全选 bug）——建议未来给 `el()` 写一个 jsdom 单测。

---

### 2. js/store.js — 🟡 中覆盖

**已覆盖**
- `upsertNovel` / `getNovels` / `deleteNovel` 往返一致（smoke.js：章节数、正文、伏笔表）
- localStorage 桩注入下的读写路径

**未覆盖**
- `saveSettings` / `getSettings`、`getCustomStyles` / `saveCustomStyles`
- 草稿体系：`getDraft` / `saveDraft` / `clearDraft` / `clearNovelDrafts` / `MAX_DRAFTS=20` 淘汰
- `recordWcSnapshot`（wcLog 每日快照去重，统计面板依赖）
- localStorage 抛异常时的内存降级分支

**风险点**
- 🟡 草稿 20 槽位淘汰逻辑未验证，可能误删或漏删；wcLog 无限增长有长期内存/存储风险。

---

### 3. js/content.js — 🟢 高覆盖

**已覆盖**
- 11 题材 `GENRES`、`getGenre`（命中/回退）、`genTitle`、`genName`
- `SCENE.open` 非空、`INSPIRE` 22 张卡片 + 每张 `beats` 字段

**未覆盖**
- `SCENE.ambient` 等其余场景方法；各题材的 `places/events/conflicts/worlds/identities/flavor/names` 池仅抽查、未全量断言非空
- 11 题材的地点池/事件池内容完整性

**风险点**
- 🟢 内容池是纯数据，风险低；但若某题材某数组被误清空，`rng.pick(空数组)` 会返回 `undefined` 并污染生成——建议加一条「全部题材全字段非空」的测试。

---

### 4. js/prose.js — 🟢 高覆盖

**已覆盖**
- 6 文风 `STYLES`、`getStyle` 命中/回退、`listStyles`、`applyStyle`（替换生效）
- `SPEECH_PROFILES` 12 种、`speechProfile`、`personalizeLine`
- `CHAPTER_PATTERNS` 14 个 beat、`POOL` 18 个素材键非空、`DIALOGUES` 11 场景
- 6 文风各有 `phrases` 数组

**未覆盖**
- 11 种段落生产器（sensory/transition/metaphor/atmosphere/micro 等）的**输出质量**与占位符残留
- `applyStyle` 边界：空文本、替换词对循环依赖、替换产生的病句（历史上「犹豫→咬牙」踩过）
- `MOOD_MAP` 各 tag 的续写走向

**风险点**
- 🟡 文风替换词对是「病句高发区」：靠 `polish` 事后清理，属打补丁而非根除。新增替换词对时需人工回归。

---

### 5. js/engine.js — 🟢 高覆盖

**已覆盖**
- `generateSetup`（字段、章节数、主角名保留）、`resolveChapterCount`（钳制 5–9999、非法输入、长度回退）
- `generateCharacters`（5 角色阵容、幂等重生成）
- `generateOutline`（4 套叙事模板全跑、章节数、字段齐全、自定义地点池、9999 章不崩）
- `generateChapter`（正文产出、`targetWc`、非法文风回退、空文本重生成、越界返回 null、variant 0/1/2 互异）
- `continueChapter`（增长、mood 参数）
- `randomInspire`、`contextAwareInspire`（命中/未知 beat/数量兜底）
- `syncForeshadows`（构建/保留手动/描述保留）、`remapForeshadows`（拖拽位移、无列表 no-op）
- `randomSetupPrefill`（合法 id、章节范围）

**未覆盖**
- 长度保险 while 循环的**死循环守卫**（未验证极端 targetWc=5000 或极小值）
- 伏笔揭示段的插入（`foreshadowUsed` 只在 `generateChapter` 内触发，未单独断言「回收章正文含揭示句」）
- `continueChapter` 的 `usedEvents` 去重（续写不重复本章事件）
- 14 个 beat 逐一生成的质量抽查

**风险点**
- 🟡 长度保险若素材池在某风格下枯竭，可能死循环或产出空段——smoke 已做 180 组合 + 40 部全流程压力，但未覆盖极端 `targetWc`。

---

### 6. js/ai.js — 🔴 低覆盖（高风险）

**已覆盖**
- `extractJSON`（对象/数组/带说明文字/code fence/乱码/空对象/对象含数组值）
- 模块在 Node 下可加载（`MQ.AI` 导出完整）

**未覆盖（全部依赖真实网络或 fetch 桩）**
- `chat`（流式 SSE 解析、非流式、超时、abort）
- `withRetry` / `withRetryStream`（重试次数、退避、锚点回声去重、断点续写、失败保留草稿）
- `testConnection`（`/models` 优先 + 降级最小请求）、`listModels`
- `generateChapterAI` / `continueChapterAI` / `generateOutlineAI` / `generateCharactersAI` / `rewriteChapterAI`
- `reviewChapterAI`（四维报告解析）、`consistencyCheckAI`（矛盾报告解析）
- `retrySetting`、`isAbort`、`isAuthError`、`buildMessages`

**风险点（🔴 最高）**
1. **流式重试的锚点回声去重**——真实 LLM 重试常把锚点原样吐出，若去重逻辑失效会重复正文。
2. **SSE 解析**——各服务商 `data:` 分片格式差异、`[DONE]` 处理、半包中文乱码。
3. **abort 与重试的交互**——取消后是否真停止、是否误触发「失败回退本地」。
4. **JSON 解析**——大纲/角色/审稿/一致性都依赖模型严格输出 JSON，`extractJSON` 已有对象/数组容错，但深层字段缺失/类型错未覆盖。

> 建议：给 ai.js 加一个 **fetch 桩测试**（拦截 `window.fetch` 返回脚本化的 SSE/JSON 响应），覆盖重试、回声去重、abort、4xx 不重试四条关键路径。

---

### 7. js/app.js — 🟡 中覆盖（DOM 依赖，Playwright e2e 已补齐黄金路径）

**Playwright 端到端已自动化**（`tests/e2e.spec.js`，驱动真实浏览器）：

| 已自动化 | 覆盖内容 |
|---|---|
| 黄金路径 | 创建向导 → 大纲渲染 6 章 → 角色卡 + 关系图节点 → 写作台打字机生成本章 → 采用 → 续写合并 → 错别字注入/检出/修复 → 书架持久化 → 统计面板，并断言全程无未处理 JS 异常 |
| 关系图交互 | 点选高亮（描边变金）→ 无关节点快速建关系层 → 建「宿敌」后关系数 +1 |

**仍靠浏览器手工验证的路径**：

| 未覆盖 / 未充分验证 | 风险 |
|---|---|
| 导出构建器：TXT / MD / **EPUB**（ZIP 字节级、SVG 封面、mimetype 首项）、JSON 备份导入 | 🔴 EPUB ZIP 打包无字节级校验 |
| 全文 diff（LCS 逐句高亮） | 🟡 |
| 全局替换（同步大纲+角色卡+关系图） | 🟡 |
| 生成历史（快照/对比/回滚/5 份淘汰） | 🟡 |
| 草稿自动保存（5 秒防抖、pagehide 刷新、恢复条、竞态） | 🟡 |
| 全文查找（跨章分组/跳转高亮） | 🟡 |
| 快捷键（Ctrl+Enter / Ctrl+Shift+Enter / Ctrl+S / ←→ / Esc / Ctrl+Shift+F） | 🟡 |
| 专注模式 / 纸张质感 / 深色浅色主题切换 | 🟢 低 |
| contenteditable 高亮偏移映射（错别字定位） | 🟡 依赖归一化为单文本节点 |
| 章节拖拽排序（drop 目标计算 / lastChapter / 伏笔索引） | 🟡 逻辑已测（remap），DOM 拖拽未自动化 |
| 移动端响应式 / PWA 离线 | ⚪ 未测 |

---

### 8. 其他文件 — ⚪ 未测

- **sw.js**：仅语法检查。网络优先 + 缓存回退策略、版本迁移（v2→v3 清缓存）未做真机离线验证。
- **proxy.js / start-proxy.bat**：未测（CORS 转发、30s 超时、流式透传、取消时终止上游）。
- **manifest.json**：未验证 PWA 安装。

---

## 风险点汇总（按优先级）

| 优先级 | 风险 | 位置 | 建议 |
|---|---|---|---|
| 🔴 P0 | AI 流式重试 / 回声去重 / abort 无自动化测试 | js/ai.js | 加 fetch 桩测试 |
| 🔴 P0 | EPUB 导出 ZIP 字节级正确性未验证 | js/app.js | 用真实阅读器打开导出文件验证 |
| 🟡 P1 | 草稿自动保存竞态、20 槽位淘汰 | js/store.js | 加定时器桩测试 |
| 🟡 P1 | 文风替换词对产生病句 | js/prose.js | 新增词对时人工回归 |
| 🟡 P1 | contenteditable 偏移映射依赖「单文本节点归一化」 | js/app.js | 若未来引入富文本格式需重做 |
| 🟡 P1 | 长度保险死循环守卫未测极端值 | js/engine.js | 补 targetWc 极端值测试 |
| 🟢 P2 | 内容池某数组被误清空 | js/content.js | 加全题材全字段非空断言 |
| ⚪ P2 | PWA 离线 / 代理脚本未验证 | sw.js / proxy.js | 真机断网验证一次 |

---

## 测试命令

```bash
node tests/run.js     # 单元回归 84 项（含 25 项边界 + 180 组合压力）
node tests/smoke.js   # 全流程冒烟 10 项（端到端，含 792 设定矩阵 + 40 部压力）
npx playwright test   # 浏览器端到端 2 项（黄金路径 + 关系图交互）
# 或统一： npm test && npx playwright test
```

## 结论

**引擎层（utils/content/prose/engine）覆盖充分**，纯函数与生成逻辑已有可靠的回归网。
**UI 交互层已由 Playwright e2e 补齐黄金路径与关系图交互**——视图路由、动态渲染、打字机生成、采用/续写/错别字修复、持久化与统计面板均可在真实浏览器中自动回归。
**剩余两大盲区**：AI 网络路径（重试/流式/取消，需 fetch 桩测试）与导出/草稿/查找/拖拽等尚未覆盖的 DOM 分支。若继续投入，优先补 `ai.js` 的 fetch 桩测试（性价比最高），其次给 EPUB 导出做一次真实阅读器端到端校验。
