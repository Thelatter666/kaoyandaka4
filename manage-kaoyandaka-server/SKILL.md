---
name: manage-kaoyandaka-server
description: Use when managing the kaoyandaka4 ("砚台考研打卡") production server from a local machine via SSH — syncing/deploying features, checking status, viewing logs, restarting the API service, backing up MySQL, or troubleshooting deployment. Covers the REAL current architecture (Alibaba Cloud ECS + systemd service, NOT the stale Tencent/PM2 docs).
---

# 砚台考研打卡 · 服务器托管 (kaoyandaka4)

本 skill 供**本地主机的 agent** 通过 SSH 托管远程服务器上的 kaoyandaka4 项目使用。
服务器当前真实身份:阿里云 ECS,公网 IP `39.96.2.15`,项目在 `/home/admin/kaoyandaka4`。

> ⚠️ **重要**:项目内 `deploy/server-management-prompt.txt` 与旧 `.claude/skills/manage-server/SKILL.md`
> 描述的是**另一套已废弃的部署**(腾讯云 / OpenCloudOS / PM2 / 宝塔 / Gitee / `/www/wwwroot`)。
> 当前服务器**不是**那样。一切以本文件为准。

---

## 1. 连接

- SSH 别名 `kaoyan`,定义在**本地** `~/.ssh/config`,指向 `admin@39.96.2.15`,密钥 `~/.ssh/kaoyan-server-key`。
- 连通性自检:`ssh kaoyan "uname -a && whoami"`。
- 所有运维命令均通过 `ssh kaoyan "..."` 执行;需要提权的命令加 `sudo`(admin 对该 systemd 服务的管理可能需 sudo)。

---

## 2. 当前真实架构(务必以此为准)

| 项 | 实际(当前) | 旧文档(已废弃,勿信) |
|---|---|---|
| 云 / 系统 | 阿里云 ECS,Alibaba Cloud Linux 3 (OpenAnolis) | 腾讯云,OpenCloudOS |
| 项目路径 | `/home/admin/kaoyandaka4` | `/www/wwwroot/kaoyandaka4` |
| 进程管理 | **systemd 服务 `kaoyandaily-api.service`** (`Restart=always`) | PM2 (`kaoyandaily-api`) |
| 启动入口 | `server/dist/server/src/index.js` | `server/dist/index.js` |
| 前端静态 | `/home/admin/kaoyandaka4/client/dist` | `/www/.../client/dist` |
| nginx 配置 | `/etc/nginx/conf.d/kaoyandaily.conf` (`server_name 39.96.2.15`) | 宝塔 `/www/server/panel/vhost/...` |
| 环境变量来源 | **由 systemd service 文件直接注入(不读项目根 `.env`)** | 由 `.env` 提供 |
| Git remote | `origin` = `https://ghfast.top/.../kaoyandaka4.git`(GitHub 镜像) | gitee `thelatter123/...` |
| 宝塔面板 | 在(端口 8888),但**部署不走它** | 部署走宝塔 |

### 运行时事实
- **后端**:`kaoyandaily-api.service` 运行 `node server/dist/server/src/index.js`,端口 **3001**,`Restart=always`,用户 `admin`,工作目录 `/home/admin/kaoyandaka4/server`,`NODE_ENV=production`。
- **前端**:nginx 监听 80,`/api/` 反代到 `127.0.0.1:3001`;静态根 `client/dist`;SPA 回退 `try_files ... /index.html`;`/assets/` 一年 immutable 缓存。
- **数据库**:MySQL 8,本地 `127.0.0.1:3306`,库 `kaoyandaily`,用户 `kaoyandaily`。
- 健康检查端点:`GET http://127.0.0.1:3001/api/v1/health` → `{"status":"ok"}`。

---

## 3. 🔐 安全与密钥(托管时严格遵守)

1. **运行时密钥明文写在 `/etc/systemd/system/kaoyandaily-api.service` 的 `Environment=` 段**(`DB_PASSWORD`、`SESSION_SECRET` 等)。
   - **修改该 service 文件时,必须完整保留这些 `Environment=` 行**,否则服务起不来或全站会话失效。
   - 重启后若 `SESSION_SECRET` 变化,所有登录会话立即失效(设计上为 7 天固定不滚动)。
2. **绝不要把 service 文件里的密钥**复制进仓库、日志、聊天回复或本 skill。
   - 需要密码时,让 agent 在服务器上**临时读取**,不要硬编码:
     `DBPW=$(ssh kaoyan "grep -oP 'DB_PASSWORD=\K[^ ]+' /etc/systemd/system/kaoyandaily-api.service")`
3. 项目根 `.env` **当前不被 systemd 运行时读取**(仅 `npm run db:init` 等本地脚本可能用)。保留它,不要删;但部署同步不依赖它。
4. 遵循项目 `memory.md` 操作安全:改任何已有文件前先 Read;密钥/配置类先 `cp file file.bak`;"写到/放入/添加"= 追加,除非明确"覆盖/替换"。

---

## 4. 操作手册

### 4.0 前置约定
- 所有命令经 `ssh kaoyan "..."` 执行。
- `journalctl` / `systemctl` / `nginx` 等可能需要 `sudo`;若权限不足,在命令前加 `sudo`。
- 流式命令(`journalctl -f`、`pm2 logs` 之类)会卡住 ssh,**务必加 `--no-pager`**,且非交互场景不要用 `-f`。

### 4.1 检查状态(最常用)
```
ssh kaoyan "systemctl is-active kaoyandaily-api \
  && curl -s -o /dev/null -w 'health=%{http_code}\n' http://127.0.0.1:3001/api/v1/health \
  && systemctl is-active nginx mysqld 2>/dev/null \
  && free -h | tail -1 && df -h / | tail -1"
```
- 若 `health=200` 且 `kaoyandaily-api active`,服务正常。

### 4.2 查看日志
```
# 最近 100 行
ssh kaoyan "journalctl -u kaoyandaily-api.service -n 100 --no-pager"
# 本次启动以来的日志
ssh kaoyan "journalctl -u kaoyandaily-api.service -n 200 --no-pager --since today"
```
- 排查启动失败时首选 `-n 100` 看报错堆栈。

### 4.3 仅重启服务(无代码变更)
```
ssh kaoyan "systemctl restart kaoyandaily-api && sleep 2 && systemctl is-active kaoyandaily-api \
  && curl -s -o /dev/null -w 'health=%{http_code}\n' http://127.0.0.1:3001/api/v1/health"
```
- `Restart=always`,异常退出会自动拉起;手动 `restart` 用于配置/构建更新后。

### 4.4 同步部署(最常见)
历史踩坑(保留):
- 服务器端 `client/package-lock.json` 常有本地改动挡住 `git pull` → 先 `git checkout -- client/package-lock.json`。
- npmmirror 镜像偶缺 tarball(如 `@tabler/icons-react` 404)→ 用官方源 `npm install --registry=https://registry.npmjs.org`。
- 若 `package.json` 根依赖有变动,根目录也跑一次 `npm install`。

```
ssh kaoyan "
  set -e
  cd /home/admin/kaoyandaka4
  git status --short
  git checkout -- client/package-lock.json 2>/dev/null || true
  git pull
  cd client && npm install --registry=https://registry.npmjs.org 2>&1 | tail -1 && cd ..
  npm run build:client 2>&1 | tail -3
  npm run build:server 2>&1 | tail -3
  systemctl restart kaoyandaily-api
  sleep 2
  curl -s -o /dev/null -w 'health=%{http_code}\n' http://127.0.0.1:3001/api/v1/health
"
```
> ⚠️ **路径一致性**:systemd 的 `ExecStart` 指向 `server/dist/server/src/index.js`(tsc 输出路径随 `server/tsconfig`)。
> 确认 `npm run build:server` 的输出确实落到该路径,否则重启后 404 / 启动失败。若 tsc 输出结构变了,需同步改 service 文件的 `ExecStart` 并 `daemon-reload`。

### 4.5 把本地代码改动推上服务器(本地 agent 改完代码后)
遵循项目 `AGENT.md` 工作流:**先开分支 → 与你复述对齐 → 实现 → 你亲自验收 → 你下令才 commit/merge → 双远端 push → 再走 4.4 同步部署**。
- 远端:当前服务器仅配置 `origin`(ghfast.top 的 GitHub 镜像)。如需"双远端(github + gitee)",先在服务器 `git remote -v` 确认真实情况,**不要臆造远端**。
- 任何代码修改都禁止直接改 `main`;必须经分支与你的确认。

### 4.6 备份数据库
```
DBPW=$(ssh kaoyan "grep -oP 'DB_PASSWORD=\K[^ ]+' /etc/systemd/system/kaoyandaily-api.service")
ssh kaoyan "mysqldump -ukaoyandaily -p'\$DBPW' kaoyandaily > /home/admin/backup-\$(date +%Y%m%d).sql && ls -lh /home/admin/backup-*.sql"
```
- 更安全的做法(避免密码出现在进程列表):在服务器侧用 `--defaults-extra-file` 临时文件,或用 `mysql` 交互前从 service 读取。

### 4.7 修改 systemd service(改端口 / 加环境变量)
```
# 改文件后必须 daemon-reload,再 restart
ssh kaoyan "sudo systemctl daemon-reload && sudo systemctl restart kaoyandaily-api"
```
- ⚠️ 改后**必须保留** `DB_*` / `SESSION_SECRET` / `NODE_ENV` / `PATH` 等 `Environment=` 行。
- 如需查看当前注入的环境:`ssh kaoyan "systemctl show kaoyandaily-api.service -p Environment"`。

### 4.8 前端 / nginx 变动
改 `/etc/nginx/conf.d/kaoyandaily.conf` 后:
```
ssh kaoyan "sudo nginx -t && sudo nginx -s reload"
```
- 仅改 `client/` 前端代码无需动 nginx,走 4.4 重新构建即可。`nginx -t` 验证配置无误再 reload。

---

## 5. 故障排查

| 现象 | 排查 |
|---|---|
| 服务起不来 | `journalctl -u kaoyandaily-api -n 50 --no-pager`:常见①构建输出路径与 `ExecStart` 不符 ②MySQL 未起/密码错 ③`SESSION_SECRET` 缺失导致启动抛错拒启 |
| 502 / 接口不通 | `systemctl is-active kaoyandaily-api`;再 `curl -s 127.0.0.1:3001/api/v1/health` 是否通;nginx 反代目标是否为 3001 |
| 静态资源 404 | `client/dist` 是否构建成功;`nginx -t` 的 `root` 是否指向 `/home/admin/kaoyandaka4/client/dist` |
| 3001 被旧进程占 | 通常 `systemctl restart` 会先结束旧进程;若有手动残留 node,`pkill -f server/dist/server/src/index.js` 后重启 |
| 登录全部失效 | 检查 service 文件 `SESSION_SECRET` 是否被改动/清空(7 天固定,变更即全员登出) |
| git pull 失败 | 本地有改动(尤其 `client/package-lock.json`)→ 先 `git checkout --` 再 pull |

---

## 6. 本项目专属约定(托管时一并遵守,源自 AGENT.md / memory.md)

- 改文件前先 Read;密钥/配置类先 `cp file file.bak`。
- "写到/放入/添加"= 追加,除非明确"覆盖/替换"。
- 任何代码修改走:分支 → 复述对齐(你确认)→ 实现 → 你亲自验收 → 你下令才 commit/merge/push → 部署。
- 测试:`npm test`(vitest,10 文件/97 tests);E2E(`npm run test:e2e`)需 dev server 与真实会话。
- 设计系统 Aurora Glass:组件只用 CSS 变量 `var(--color-xxx)`,不复写颜色值。

---

## 7. 给本机 agent 的安装提示

- **Claude Code / Claude 系**:放到项目或用户级 `.claude/skills/manage-kaoyandaka-server/SKILL.md`。
- **pi 系**:放到 `~/.pi/skills/manage-kaoyandaka-server/SKILL.md`(或项目内 `.pi/skills/...`)。
- 本文件同时兼容两者的 YAML frontmatter(`name` + `description`)格式。
- 启用后,当你说"把新功能同步到服务器 / 看下服务器状态 / 重启服务 / 备份数据库"等,agent 应直接调用本 skill 的对应操作。
