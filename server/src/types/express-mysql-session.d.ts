// express-mysql-session 未附带类型声明，此处提供最小可用声明（仅覆盖本项目用到的构造参数）
declare module 'express-mysql-session' {
  import type { Store } from 'express-session';

  interface MySQLStoreOptions {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    charset?: string;
    // 会话记录过期时间（毫秒），应与 cookie maxAge 对齐
    expiration?: number;
    // 是否自动建 sessions 表
    createDatabaseTable?: boolean;
    clearExpired?: boolean;
    checkExpirationInterval?: number;
    schema?: {
      tableName?: string;
      columnNames?: {
        session_id?: string;
        expires?: string;
        data?: string;
      };
    };
  }

  interface MySQLStoreConstructor {
    new (options?: MySQLStoreOptions): Store;
  }

  // 实际导出为工厂函数：注入 express-session 模块后返回 Store 构造器
  function factory(session: unknown): MySQLStoreConstructor;

  export = factory;
}
