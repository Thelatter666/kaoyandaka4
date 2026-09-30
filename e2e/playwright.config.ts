import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /* 串行跑（本地与 CI 一致）：节能模式的布局逐元素比对对并行负载敏感——多个 Chrome
     同时抢主线程时入场动画可能冻在起始帧（translateY(10px)），位置采样会取到中间态
     （power-save.spec 的 waitStable 注释记着这个 78px vs 68px 的假差异）。本套件只有
     4 个用例，串行约 13s，用一点时间换确定性。 */
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      /* 默认用 Playwright 自带的 chromium（需先 `npx playwright install chromium`）。
         若本机装不了/下不动二进制，可改用系统 Chrome 跑：
             PW_CHANNEL=chrome npx playwright test
         两条路的引擎相同，仅二进制来源不同。 */
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
      },
    },
  ],
  webServer: {
    command: 'cd .. && npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
