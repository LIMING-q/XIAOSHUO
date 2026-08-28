'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/e2e.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8124',
    // 阻断 Service Worker，避免缓存优先/离线策略干扰端到端断言
    serviceWorkers: 'block',
    viewport: { width: 1366, height: 900 },
    locale: 'zh-CN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/server.js',
    url: 'http://localhost:8124',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
