#!/usr/bin/env node
/**
 * 本地关机监听器 —— 页头「关闭系统」按钮的落地点
 *
 * 只在双击《砚台考研打卡.command》时被拉起，进程一死能力即消失。之所以不把
 * 这个端点加进 Express：部署在腾讯云的那份后端必须完全不具备「关机」能力，
 * 本地与线上的能力边界靠「进程是否被启动脚本拉起来」划分，服务端零改动。
 *
 * 协议
 *   前端 → POST /power-off（带 x-kaoyan-power: 1）→ 200 {ok:true}
 *   本进程随后自行退出（exit 0）；启动脚本 wait 到它退出 → 杀 5173/3001 → 打印收尾信息。
 *   退出码约定：0 = 收到关机请求；1 = 启动失败（启动脚本据此保留服务，不误拆）。
 *
 * 鉴权（本机开发页面之外一律拒绝）
 *   - 只监听 127.0.0.1，外网不可达
 *   - Origin 白名单：只放行 vite dev 的两种写法（localhost / 127.0.0.1）
 *   - 要求自定义头 x-kaoyan-power：自定义头强制 CORS 预检，跨站页面无法用
 *     「简单请求」绕过预检直接打进来
 */
import { createServer } from 'node:http';

/** 与 client/src/utils/localPower.ts 的 POWER_OFF_PORT 保持一致 */
const PORT = 3999;
const ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
/** 等响应写完再退出，避免前端拿到连接被重置 */
const EXIT_DELAY_MS = 200;

const server = createServer((req, res) => {
  const origin = req.headers.origin ?? '';
  const allowed = ALLOWED_ORIGINS.has(origin);

  // 预检：只对白名单来源发放 x-kaoyan-power 的许可，其他来源的预检直接拒绝
  if (req.method === 'OPTIONS') {
    if (allowed) {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'x-kaoyan-power, content-type',
        'Access-Control-Max-Age': '600',
      });
    } else {
      res.writeHead(403);
    }
    res.end();
    return;
  }

  const isPowerOff =
    req.method === 'POST' &&
    req.url === '/power-off' &&
    allowed &&
    req.headers['x-kaoyan-power'] === '1';

  if (!isPowerOff) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }

  res.writeHead(200, {
    'Access-Control-Allow-Origin': origin,
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify({ ok: true }));
  console.log('\n收到「关闭系统」请求，正在停止服务…');
  setTimeout(() => process.exit(0), EXIT_DELAY_MS);
});

server.on('error', (err) => {
  console.error(`\n⚠️  本地关机监听器启动失败（${err.code}）：${err.message}`);
  console.error('   「关闭系统」按钮本次不可用；关闭终端窗口仍可停止服务。');
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`本地关机监听器已就绪：http://127.0.0.1:${PORT}/power-off`);
});
