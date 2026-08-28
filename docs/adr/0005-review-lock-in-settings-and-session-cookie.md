# 复盘锁哈希存 user_settings,解锁标记用会话 cookie

复盘二重密码(复盘锁)有两个存储决策:密码哈希放哪、解锁标记放哪。

**密码哈希 → `user_settings` 键值**(键 `review_lock_hash`),不改 users 表。备选对比:

| 路线 | 代价 |
|---|---|
| users 表加列 `review_password_hash` | 需 schema.sql + migrate.ts 迁移;**本地模式没有 users 表**,哈希仍得在 IndexedDB settings 存一份,双模式不对称 |
| **user_settings 键值** | 零迁移;服务器/本地双模式代码完全对称;代价是「密码属于账号本体」的正统性 |

**解锁标记 → 会话 cookie**(不设 Max-Age,值 = 当前身份 id),不用 Web Storage:

| 路线 | 语义 |
|---|---|
| localStorage | 永久有效,违背「系统关闭后需重输」的需求 |
| sessionStorage | **每标签页隔离**——同一次浏览器会话里新开标签页就要重输密码,违背「每次启动系统只需输入一次」 |
| **会话 cookie** | 浏览器级、跨标签共享、关闭浏览器即失效——与「启动系统」的语义精确吻合 |

cookie 非 HttpOnly、可被 JS 读写:可接受,解锁标记不是机密,防护本体在服务端验证与哈希。换账号的隔离靠「标记值与当前身份 id 匹配」校验,不依赖清除时机。

决定:**哈希入 `user_settings`(本地模式同键入 IndexedDB settings,格式 `salt:sha256hex`,Web Crypto 计算);解锁标记为会话 cookie `kaoyandaily_review_unlocked`。**

## Consequences

- 忘记复盘锁密码无应用内重置(会削弱防护),走服务器手动清键。
- 本地模式哈希强度(SHA-256+salt)低于服务端 bcrypt:本地数据本就在同一浏览器内,威胁模型等价,且避免把 bcrypt 引入 client bundle。
- 隐私边界:复盘内容不加密,`GET /reviews` 对持有会话的客户端始终可读——门禁防「随手翻看」,不防技术性绕过。
