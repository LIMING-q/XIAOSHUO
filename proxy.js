/* ============================================================
   墨泉 · 本地 CORS 代理
   解决「服务商不支持 CORS 导致浏览器 Failed to fetch」的问题：
   浏览器请求本地代理（无跨域限制）→ 代理转发到目标服务 → 加上 CORS 响应头返回

   用法：
     node proxy.js                      # 默认目标 https://tokenrhythm.studio/v1，端口 8787
     node proxy.js <目标BaseURL> <端口> [--quiet]
   例如：
     node proxy.js https://api.deepseek.com/v1 8788
     node proxy.js --quiet               # 静默模式（不打印请求日志）

   然后在应用「AI 设置」里：
     Base URL 填  http://localhost:8787          （注意：不带 /v1，代理会自动补上）
     API Key   填 目标服务的真实 Key
     模型       填 目标服务的真实模型名

   Windows 用户可直接双击 start-proxy.bat 启动。
   ============================================================ */
'use strict';

const http = require('http');
const https = require('https');

const args = process.argv.slice(2).filter(a => !a.startsWith('--')); // 过滤 --quiet 等开关参数
const TARGET = args[0] || 'https://tokenrhythm.studio/v1';
const PORT = parseInt(args[1] || '8787', 10);
const HOST = '127.0.0.1'; // 只监听本机，防止局域网内其他设备借用代理
const UPSTREAM_TIMEOUT = parseInt(process.env.MQ_PROXY_TIMEOUT || '30000', 10); // 上游无响应超时（ms）
const QUIET = process.argv.includes('--quiet') || process.env.MQ_PROXY_QUIET === '1';

// 启动时校验目标 URL，错误给出友好提示并退出
let target;
try {
  target = new URL(TARGET);
  if (!/^https?:$/.test(target.protocol)) throw new Error('仅支持 http:// 或 https://');
} catch (e) {
  console.error('❌ 目标 URL 无效：' + TARGET + '（' + e.message + '）');
  console.error('   用法：node proxy.js [目标BaseURL] [端口] [--quiet]');
  process.exit(1);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-api-key',
  'Access-Control-Max-Age': '86400',
};

// 复用上游连接（keep-alive），连续生成请求更快
const agents = {
  http: new http.Agent({ keepAlive: true, maxSockets: 32 }),
  https: new https.Agent({ keepAlive: true, maxSockets: 32 }),
};

function log(...args) {
  if (!QUIET) console.log('[' + new Date().toLocaleTimeString() + ']', ...args);
}

// 转发请求到目标服务
function forward(req, res) {
  const targetUrl = target.protocol + '//' + target.host + target.pathname.replace(/\/+$/, '') + req.url;
  const mod = targetUrl.startsWith('https') ? https : http;

  const headers = Object.assign({}, req.headers);
  headers.host = target.host;

  let outReq;
  let deadline;
  // 上游超时保护：采用「活动重置」机制——建连阶段是硬超时，响应阶段只要持续收到数据就不会误杀（流式生成安全）
  const abort = () => outReq.destroy(new Error('上游超时（' + (UPSTREAM_TIMEOUT / 1000) + 's 无响应）'));
  const kick = () => {
    clearTimeout(deadline);
    deadline = setTimeout(abort, UPSTREAM_TIMEOUT);
    if (deadline.unref) deadline.unref();
  };

  outReq = mod.request(targetUrl, {
    method: req.method,
    headers,
    agent: agents[mod === https ? 'https' : 'http'],
  }, (outRes) => {
    clearTimeout(deadline);
    outRes.on('data', kick); // 每次收到数据都重置超时
    outRes.on('end', () => clearTimeout(deadline));
    log(req.method, req.url, '→ HTTP', outRes.statusCode);
    res.writeHead(outRes.statusCode || 502, Object.assign({}, outRes.headers, CORS_HEADERS));
    outRes.pipe(res);
  });

  deadline = setTimeout(abort, UPSTREAM_TIMEOUT);
  if (deadline.unref) deadline.unref();

  outReq.on('error', (e) => {
    clearTimeout(deadline);
    log('✗ 转发失败', req.method, req.url, '→', e.message);
    if (!res.headersSent) {
      res.writeHead(502, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS_HEADERS));
      res.end('代理转发失败：' + (e.message || e));
    } else {
      res.destroy(); // 响应已开始发送，直接断开，避免崩溃
    }
  });

  // 浏览器中途断开（取消请求 / 关页面）时，同步终止上游请求
  req.on('error', () => outReq.destroy());
  res.on('close', () => { if (!res.writableEnded) outReq.destroy(); });

  req.pipe(outReq);
}

// 状态页：浏览器打开 http://localhost:8787 可查看代理运行信息
const STATUS_PAGE = [
  '<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>墨泉 CORS 代理</title>',
  '<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#333}',
  'h1{font-size:22px}.ok{color:#16a34a;font-weight:600}code{background:#f1f5f9;padding:2px 6px;border-radius:4px}',
  'li{margin:6px 0}</style></head><body>',
  '<h1>✅ 墨泉 CORS 代理运行中</h1>',
  '<p class="ok">本机地址：<code>http://localhost:' + PORT + '</code></p>',
  '<ul>',
  '<li>目标服务：<code>' + TARGET + '</code></li>',
  '<li>转发示例：<code>http://localhost:' + PORT + '/chat/completions</code> → <code>' + TARGET.replace(/\/+$/, '') + '/chat/completions</code></li>',
  '<li>本页仅用于查看状态，应用请求不会被拦截。</li>',
  '</ul></body></html>',
].join('');

http.createServer((req, res) => {
  // 浏览器跨域预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  // 状态页
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, CORS_HEADERS));
    res.end(STATUS_PAGE);
    return;
  }
  forward(req, res);
}).listen(PORT, HOST, () => {
  if (!QUIET) {
    console.log('✅ 墨泉 CORS 代理已启动');
    console.log('   目标服务：' + TARGET);
    console.log('   监听地址：http://localhost:' + PORT + '（仅本机可访问）');
    console.log('   状态页：  http://localhost:' + PORT + '/');
    console.log('');
    console.log('   在应用「AI 设置」里填写：');
    console.log('   Base URL → http://localhost:' + PORT);
    console.log('   API Key  → 目标服务的真实 Key');
    console.log('   模型     → 目标服务的真实模型名');
    console.log('');
    console.log('   按 Ctrl+C 停止。');
  }
});
