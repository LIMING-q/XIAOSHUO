#!/usr/bin/env node
/**
 * 墨泉 · 一键启动脚本
 * 自动开本地服务器 + 打开浏览器
 * 用法：node start-server.js [端口号]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = parseInt(process.argv[2]) || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';

  const filePath = path.join(ROOT, url);
  const ext = path.extname(filePath);

  // 安全检查：防止目录穿越
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end('500 Internal Server Error');
      }
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? `open "${url}"`
            : platform === 'win32' ? `start "" "${url}"`
            : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log('');
  console.log('  ┌──────────────────────────────────────┐');
  console.log('  │  墨泉 · AI 小说生成器                 │');
  console.log(`  │  🌐 ${url.padEnd(30)}│`);
  console.log('  │  Ctrl+C 停止服务器                     │');
  console.log('  └──────────────────────────────────────┘');
  console.log('');
  openBrowser(url);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n  端口 ${PORT} 被占用，尝试 ${PORT + 1}...\n`);
    server.listen(PORT + 1, '127.0.0.1');
  } else {
    console.error('启动失败:', err.message);
    process.exit(1);
  }
});
