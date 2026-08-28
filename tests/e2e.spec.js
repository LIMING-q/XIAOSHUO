/* ============================================================
   墨泉 · 端到端 UI 冒烟测试（Playwright 驱动真实浏览器）
   用法：npx playwright test
   覆盖 Node 测不到的交互层：视图路由、动态渲染、打字机生成、
   采用/续写/错别字修复、关系图节点渲染与交互、持久化与统计面板。
   ============================================================ */
'use strict';

const { test, expect } = require('@playwright/test');

test.describe.configure({ mode: 'serial' });

// 阻断外部字体请求，避免经典脚本被 head 中的 fonts 样式表阻塞执行
async function abortExternalFonts(page) {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
}

test('全流程：创建 → 大纲 → 角色 → 关系图 → 正文 → 续写 → 错别字 → 统计', async ({ page }) => {
  // 捕获未处理异常（关键 JS 崩溃信号；qwebchannel 等网络错误不在此列）
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await abortExternalFonts(page);

  // 1. 书架
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#view-shelf')).toBeVisible();
  await expect(page.getByText('你的小说世界')).toBeVisible();

  // 2. 创建向导
  await page.locator('#btn-new-novel').click();
  await expect(page.locator('#view-create')).toBeVisible();

  await page.locator('#f-title').fill('端到端测试之书');
  await page.locator('#f-protagonist').fill('陆青山');
  await page.locator('#f-chapters').fill('6');
  await page.locator('#f-conflict').fill('少年背负灭门血仇，在绝境中觉醒血脉，踏上复仇与救赎之路');

  // 3. 开始创作 → 工作台 + 大纲渲染 6 章
  await page.locator('#btn-create').click();
  await expect(page.locator('#view-studio')).toBeVisible();
  await expect(page.locator('#tab-outline')).toBeVisible();
  await expect(page.locator('.chapter-card')).toHaveCount(6);

  // 4. 角色页：5 张角色卡 → 切关系图 → 5 个节点（回归守卫：节点曾丢失）
  await page.locator('.stab[data-tab="characters"]').click();
  await expect(page.locator('.char-card')).toHaveCount(5);
  await page.locator('#btn-graph-toggle').click();
  await expect(page.locator('.rg-svg .rg-node')).toHaveCount(5);

  // 5. 写作台
  await page.locator('.stab[data-tab="writer"]').click();
  await expect(page.locator('#tab-writer .paper-text')).toBeVisible();

  // 6. 生成本章（打字机逐段展开）→ 采用并入正文
  await page.locator('button', { hasText: '生成本章' }).click();
  await expect(page.locator('.gen-adopt')).toBeVisible({ timeout: 60000 });
  await page.locator('.gen-adopt').click();
  await expect(page.locator('#tab-writer .paper-text')).not.toBeEmpty();
  const text1 = await page.locator('#tab-writer .paper-text').innerText();
  expect(text1.length).toBeGreaterThan(200);

  // 7. 续写：自动合并，正文增长
  await page.locator('button', { hasText: '续写本章' }).click();
  await expect(page.locator('.cont-area')).toHaveClass(/hidden/, { timeout: 60000 });
  const text2 = await page.locator('#tab-writer .paper-text').innerText();
  expect(text2.length).toBeGreaterThan(text1.length);

  // 8. 错别字检查：注入确定的地得误用 → 检出 → 一键修复
  await page.locator('#tab-writer .paper-text').click();
  await page.keyboard.type('他高兴的笑了');
  await page.locator('button', { hasText: '错别字' }).click();
  await expect(page.locator('.typo-row').first()).toBeVisible();
  await page.locator('.typo-row').first().locator('button.btn-primary').click();
  await expect(page.getByText('已改为「')).toBeVisible();

  // 修复后会重新检查，若正文仍有其它疑似问题会再次弹出——先关闭弹窗再继续
  const modalClose = page.locator('#active-modal .modal-head button.icon-btn');
  if (await modalClose.count()) await modalClose.click();
  await expect(page.locator('#active-modal')).toHaveCount(0);

  // 9. 返回书架：书籍卡片与字数持久化
  await page.locator('#btn-shelf').click();
  await expect(page.locator('#view-shelf')).toBeVisible();
  await expect(page.locator('.novel-card', { hasText: '端到端测试之书' })).toBeVisible();

  // 10. 统计面板：数据渲染
  await page.locator('#btn-stats').click();
  await expect(page.locator('#view-stats')).toBeVisible();
  await expect(page.locator('#stats-body')).not.toBeEmpty();

  // 全程无未处理 JS 异常
  expect(pageErrors).toEqual([]);
});

test('关系图交互：点选高亮 → 无关节点快速建关系', async ({ page }) => {
  await abortExternalFonts(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // 用真实引擎+持久化层造一本书，再重载走书架 UI（不触碰 app.js 私有函数）
  const title = await page.evaluate(() => {
    const n = MQ.Engine.generateSetup({ genre: 'wuxia', template: 'three-act', style: 'fierce', length: 'short', seed: 42, protagonist: '叶孤城' });
    MQ.Engine.generateCharacters(n);
    MQ.Engine.generateOutline(n);
    MQ.Store.upsertNovel(n);
    return n.title;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  // 打开书籍 → 角色页 → 关系图
  await page.locator('.novel-card', { hasText: title }).click();
  await page.locator('.stab[data-tab="characters"]').click();
  await page.locator('#btn-graph-toggle').click();
  await expect(page.locator('.rg-svg .rg-node')).toHaveCount(5);

  // 找一对默认无关系的非主角角色（主角与所有人都有边，无法触发快速建关系）
  const pair = await page.evaluate(() => {
    const n = MQ.Store.getNovels()[0];
    const others = n.characters.filter(c => c.role !== '主角').map(c => c.name);
    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        const a = others[i], b = others[j];
        const related = n.relations.some(r =>
          (r.from === a && r.to === b) || (r.from === b && r.to === a));
        if (!related) return { a, b };
      }
    }
    return null;
  });
  expect(pair).not.toBeNull();

  // 点选 A：circle 描边变为选中态金色（点选高亮）
  const nodeA = page.locator(`.rg-node[data-name="${pair.a}"] circle`);
  // SVG 节点标签（<text>）覆盖圆心，force 跳过可点击性检查（事件仍会冒泡到 g 节点）
  await nodeA.click({ force: true });
  await expect(nodeA).toHaveAttribute('stroke', '#f0e68c');

  // 点选无关节点 B → 弹出快速建关系层
  await page.locator(`.rg-node[data-name="${pair.b}"] circle`).click({ force: true });
  await expect(page.locator('.rg-picker')).toBeVisible();

  // 建「宿敌」关系 → 关系数增加（5 默认 + 1）
  await page.locator('.rg-picker button', { hasText: '宿敌' }).click();
  const relCount = await page.evaluate(() => MQ.Store.getNovels()[0].relations.length);
  expect(relCount).toBe(6);
});
