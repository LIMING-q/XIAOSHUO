/* ============================================================
   墨泉 · 本地 CORS 代理
   解决「服务商不支持 CORS 导致浏览器 Failed to fetch」的问题：
   浏览器请求本地代理（无跨域限制）→ 代理转发到目标服务 → 加上 CORS 响应头返回

   用法：
     node proxy.js                     # 默认目标 https://tokenrhythm.studio/v1，端口 8787
     node proxy.js <目标BaseURL> <端口>
   例如：
     node proxy.js https://api.deepseek.com/v1 8788

   然后在应用「AI 设置」里：
     Base URL 填  http://localhost:8787          （注意：不带 /v1，代理会自动补上）
     API Key   填 目标服务的真实 Key
     模型       填 目标服务的真实模型名
   ============================================================ */
'use strict';

const http = require('http');
const https = require('https');

const TARGET = process.argv[2] || 'https://tokenrhythm.studio/v1';
const PORT = parseInt(process.argv[3] || '8787', 10);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-api-key',
  'Access-Control-Max-Age': '86400',
};

// 转发请求到目标服务
function forward(req, res) {
  const targetUrl = TARGET.replace(/\/+$/, '') + req.url;
  const mod = targetUrl.startsWith('https') ? https : http;

  const headers = Object.assign({}, req.headers);
  headers.host = new URL(TARGET).host;

  const outReq = mod.request(targetUrl, { method: req.method, headers }, (outRes) => {
    res.writeHead(outRes.statusCode || 502, Object.assign({}, outRes.headers, CORS_HEADERS));
    outRes.pipe(res);
  });

  outReq.on('error', (e) => {
    res.writeHead(502, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS_HEADERS));
    res.end('代理转发失败：' + (e.message || e));
  });

  req.pipe(outReq);
}

http.createServer((req, res) => {
  // 浏览器跨域预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  forward(req, res);
}).listen(PORT, () => {
  console.log('✅ 墨泉 CORS 代理已启动');
  console.log('   目标服务：' + TARGET);
  console.log('   监听地址：http://localhost:' + PORT);
  console.log('');
  console.log('   在应用「AI 设置」里填写：');
  console.log('   Base URL → http://localhost:' + PORT);
  console.log('   API Key  → 目标服务的真实 Key');
  console.log('   模型     → 目标服务的真实模型名');
  console.log('');
  console.log('   按 Ctrl+C 停止。');
});
