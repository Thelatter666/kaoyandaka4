import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from './errorHandler.js';

type ValidationTarget = 'body' | 'query' | 'params';

// shared 下的 schema 文件解析 zod 时命中的是根 node_modules 副本，
// 与本文件使用的 server/node_modules 副本非同一实例，instanceof ZodError 会失效，
// 故以 issues 结构做鸭子类型判断，兼容两个副本抛出的 ZodError
function isZodError(err: unknown): err is ZodError {
  return (
    err instanceof ZodError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { name?: string }).name === 'ZodError' &&
      Array.isArray((err as { issues?: unknown }).issues))
  );
}

export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const data = schema.parse(req[target]);
      // Replace with parsed (and transformed) data
      req[target] = data;
      next();
    } catch (err) {
      if (isZodError(err)) {
        const details = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        next(new AppError(400, 'VALIDATION_ERROR', '请求参数校验失败', details));
      } else {
        next(err);
      }
    }
  };
}
