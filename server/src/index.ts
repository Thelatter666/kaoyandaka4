import express from 'express';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import presetsRouter from './routes/presets.js';
import tasksRouter from './routes/tasks.js';
import reviewsRouter from './routes/reviews.js';
import focusRouter from './routes/focus.js';
import coursesRouter from './routes/courses.js';
import statisticsRouter from './routes/statistics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
// 仅信任第一跳 nginx 反代：限流按真实客户端 IP、secure cookie 正确判定；本地直连无副作用
app.set('trust proxy', 1);
const PORT = parseInt(process.env.SERVER_PORT || '3001', 10);

// 会话密钥为安全关键配置：缺失时直接启动失败并给出指引，避免弱默认值上线
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error('缺少 SESSION_SECRET 环境变量，请在项目根目录 .env 中配置（参考 .env.example）');
}

// 会话有效期 7 天（Cookie maxAge 与 MySQL 会话记录过期时间保持一致；固定有效期，到期重新登录）
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// express-mysql-session 内部使用独立的 mysql2 连接池（自建自管），与业务 pool 互不干扰；
// 首次启动会自动创建 sessions 表
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kaoyandaily',
  expiration: SESSION_TTL_MS,
});

app.use(corsMiddleware);
// JSON 响应 gzip 压缩（统计/森林等聚合接口收益最大）；小于 1KB 的响应不压缩，避免得不偿失
app.use(compression({ threshold: 1024 }));
app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    // 固定 7 天会话不滚动续期：避免每请求 UPDATE sessions 表续期带来的写放大，到期重新登录
    rolling: false,
    cookie: {
      httpOnly: true,
      // 前端经 vite proxy 同源访问 /api，lax 足够且能抵御大部分 CSRF
      sameSite: 'lax',
      // 本地 http 开发为 false；生产 HTTPS 置 SESSION_COOKIE_SECURE=true
      secure: process.env.SESSION_COOKIE_SECURE === 'true',
      maxAge: SESSION_TTL_MS,
    },
  })
);

// API Routes
// 业务路由统一在挂载层强制鉴权：集中一处可审计、无遗漏风险；/api/v1/auth 与 /api/v1/health 保持公开
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/presets', requireAuth, presetsRouter);
app.use('/api/v1/tasks', requireAuth, tasksRouter);
app.use('/api/v1/reviews', requireAuth, reviewsRouter);
app.use('/api/v1/focus', requireAuth, focusRouter);
app.use('/api/v1/courses', requireAuth, coursesRouter);
app.use('/api/v1/statistics', requireAuth, statisticsRouter);

// Health check
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('API routes:');
  console.log('  GET  /api/v1/health');
  console.log('  /api/v1/auth');
  console.log('  /api/v1/presets');
  console.log('  /api/v1/tasks');
  console.log('  /api/v1/reviews');
  console.log('  /api/v1/focus');
  console.log('  /api/v1/courses');
  console.log('  /api/v1/statistics');
});

export default app;
