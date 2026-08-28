# 墨泉 · AI 小说生成器 v2.0.0

> 🎉 **v2.0.0 正式发布** — 2026-08-28

一个纯前端、零依赖的小说创作工具：从一句话设定开始，自动生成完整大纲、角色卡与正文，支持本地智能引擎与 AI 大模型双引擎。

---

## 📦 下载与使用

**零安装，双击即用：**

1. 下载本项目所有文件（或 `git clone`）
2. 双击 `index.html` 用浏览器打开（推荐 Chrome / Edge）
3. 点「＋ 创作新小说」开始创作

**不需要 Node.js、不需要 npm、不需要任何构建步骤。**

> 如果需要 AI 生成，填入 API Key 即可。详见 [README — 配置 AI 服务商](README.md#-配置-ai-服务商)。

---

## 🔥 从 v1.0 到 v2.0 — 改了什么

| 维度 | v1.0 | v2.0 |
|---|---|---|
| 代码规模 | ~300 行单文件 | 9,680 行 · 12 个模块 |
| 题材 | 3 种 | 11 种 |
| 文风 | 2 种 | 6 内置 + 自定义 |
| 叙事结构 | 三幕 | 三幕 / 英雄之旅 / 七点式 / 救猫咪 |
| AI 支持 | 无 | OpenAI 兼容（DeepSeek / 智谱 / 通义 / Moonshot…） |
| 角色系统 | 基础卡 | 主角 + 盟友 + 对手 + 引路人 + 关系图 |
| 地点系统 | 无 | 自定义地点池 + 出场追踪 |
| 正文生成 | 一次性输出 | 下方预览 + 多版本 + 全文对比 + 重写 |
| AI 审稿 | 无 | 四维报告（节奏 / 对话 / 伏笔 / 删减） |
| 一致性检查 | 无 | 通读全书报告四类矛盾 |
| 伏笔管理 | 无 | 追踪面板（埋设 / 回收 / 悬空 / 手动） |
| 导出格式 | TXT | TXT / Markdown / EPUB（含封面）/ JSON 备份 |
| 统计 | 无 | 每日柱状图 / streak / 目标 / 热力图 |
| 测试 | 无 | 84 单元 + 10 冒烟 + 2 e2e |
| 错别字检查 | 无 | 「的地得」+ 重复词（纯规则） |
| PWA | 无 | 可安装到桌面离线使用 |

---

## 🚀 快速体验

```
1. 双击 index.html
2. 点「＋ 创作新小说」
3. 选「玄幻」→「古风」→「英雄之旅」→ 填书名和主角（或一键随机）
4. 开始创作 → 查看大纲 → 生成正文
5. 想用 AI？右上角「🤖 AI 设置」填入 DeepSeek Key 即可
```

---

## 🧪 测试验证

| 测试集 | 数量 | 运行方式 |
|---|---|---|
| 单元回归 | 84 项 | `npm run test:unit` |
| 全流程冒烟 | 10 项 | `npm run smoke` |
| Playwright e2e | 2 项 | `npm run test:e2e` |
| 压力测试 | 320 组合 | 10 题材 × 6 文风 × 3 篇幅，零失败 |
| 语法检查 | 15 文件 | `npm run check` |

```bash
# 一键全部验证
npm run test:all

# 仅语法 + 单元 + 冒烟（无需浏览器）
npm test
```

---

## 📁 项目结构

```
index.html            入口页面（215 行）
css/style.css         墨金主题 · 6 种纸张质感 · 深浅双主题（1,204 行）
js/utils.js           工具层：种子随机 / 文本 / DOM / 错别字检查（245 行）
js/store.js           持久化层：localStorage + 内存降级（172 行）
js/content.js         内容池：11 题材库 / 名字 / 场景 / 灵感卡片（584 行）
js/prose.js           文风预设 + 段落生产器 + 性格台词（800 行）
js/engine.js          本地引擎：设定 / 角色 / 大纲 / 正文 / 续写 / 伏笔（832 行）
js/ai.js              AI 层：OpenAI 兼容 / 流式 / 重试 / 审稿 / 一致性（783 行）
js/app.js             主逻辑：视图 / 弹窗 / 交互 / 灵感续写（4,626 行）
sw.js                 Service Worker：网络优先 + 缓存回退（46 行）
manifest.json         PWA 清单（18 行）
proxy.js              本地 CORS 代理（155 行）
tests/run.js          单元回归测试（84 项）
tests/smoke.js        全流程冒烟测试（10 项）
tests/e2e.spec.js     Playwright 端到端测试（2 项）
tests/check.js        跨平台语法检查器
tests/server.js       e2e 测试静态服务器
TEST_COVERAGE.md      测试覆盖率报告
CHANGELOG.md          变更日志
README.md             用户手册
```

---

## 🔧 开发者指南

### 环境要求

- 浏览器：Chrome 90+ / Edge 90+ / Firefox 90+（运行时）
- Node.js 14+（仅测试时需要）
- npm（仅测试时需要）

### 本地开发

```bash
# 启动本地服务器（任选一种）
python -m http.server 8080         # Python
npx serve .                        # Node
# 或直接用 VS Code 的 Live Server 插件
```

### 运行测试

```bash
npm install                       # 首次：安装 Playwright（开发依赖）
npx playwright install chromium   # 首次：下载 Chromium 浏览器

npm run check                     # 语法检查（秒级）
npm test                          # 单元回归 + 冒烟（~5 秒）
npm run test:e2e                  # 浏览器端到端（~10 秒）
npm run test:all                  # 全套
```

### 打包发布

本项目无需构建，直接分发源文件即可：

```bash
# 最小发布包（双击 index.html 即可运行）
zip moquan-v2.0.0.zip index.html css/ js/ sw.js manifest.json

# 完整包（含测试和文档）
zip -r moquan-v2.0.0-full.zip . -x "node_modules/*" -x ".git/*"
```

---

## ⚠️ 已知限制

1. **数据存储**：所有数据保存在浏览器 localStorage，清除浏览器数据会丢失作品。务必定期使用「导出 JSON 备份」。
2. **AI CORS**：部分服务商不支持浏览器直连（报 Failed to fetch），需用项目附带的 `proxy.js` 代理。
3. **EPUB 封面**：自动生成 SVG 封面，不支持用户自定义图片封面。
4. **本地引擎文笔**：模板拼接的文笔不及 AI 深度创作，适合草稿 / 灵感阶段。

---

## 📄 许可

MIT License

---

> 从一句话到一本书，墨泉帮你把灵感变成文字。✍️
