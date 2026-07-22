import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

// express-session 会话数据扩展：登录态仅存 userId，密码等敏感信息绝不入会话
// （自 routes/auth.ts 迁移至此，鉴权中间件与 auth 路由共用同一份声明）
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

// Express Request 扩展：requireAuth 校验通过后注入当前用户 ID，
// 业务路由统一从 req.userId 取数据归属，禁止信任客户端传入的任何用户标识
declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

// 鉴权中间件：无会话一律 401（错误形状与 routes/auth.ts 的 /me 完全对齐）；
// 有会话则把会话中的 userId 注入 req.userId 并放行
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.session.userId) {
    next(new AppError(401, 'UNAUTHORIZED', '未登录'));
    return;
  }
  req.userId = req.session.userId;
  next();
}
