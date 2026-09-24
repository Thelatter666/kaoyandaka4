/**
 * 「关闭系统」——仅在本机（双击《砚台考研打卡.command》打开的页面）可用。
 *
 * 请求打给启动脚本拉起的本地关机监听器（scripts/local-power.mjs）：它收到请求
 * 即退出，启动脚本随之杀掉前后端进程并打印收尾信息。部署在服务器上的那份前端
 * 没有这个监听器，所以按 host 判断——非本机打开时不渲染入口，也没有任何可用端点。
 */
/** 与 scripts/local-power.mjs 的 PORT 保持一致 */
const POWER_OFF_PORT = 3999;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/** 当前页面是否由本机服务提供 */
export function isLocalLauncherHost(): boolean {
  return LOCAL_HOSTS.has(window.location.hostname);
}

/**
 * 请求关闭系统；返回是否被受理。
 * 监听器不在（手动 npm run dev、线上部署、或端口被别的服务占用）时返回 false，
 * 由调用方给出替代提示。
 */
export async function powerOffSystem(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${POWER_OFF_PORT}/power-off`, {
      method: 'POST',
      // 自定义头强制 CORS 预检：监听器只给白名单来源发放许可
      headers: { 'x-kaoyan-power': '1' },
    });
    return res.ok;
  } catch {
    // 连接被拒 / 跨域被拦（对方不是我们的监听器）都归为「没关成」
    return false;
  }
}
