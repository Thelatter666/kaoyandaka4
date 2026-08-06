---
name: manage-server
description: Use when managing the kaoyandaily production server — syncing features, checking status, viewing logs, restarting services, or troubleshooting deployment issues
---

# Server Management

## Connection
`ssh kaoyan` (alias in ~/.ssh/config)

## Architecture
| Component | Detail |
|-----------|--------|
| Server | Tencent Cloud, OpenCloudOS 9.6, 2GB/40GB |
| Project path | /www/wwwroot/kaoyandaka4 |
| PM2 process | kaoyandaily-api, cwd /www/wwwroot/kaoyandaka4/server |
| Node entry | server/dist/index.js |
| Frontend | /www/wwwroot/kaoyandaka4/client/dist |
| Nginx config | /www/server/panel/vhost/nginx/118.24.164.3.conf (BT Panel) |
| Database | MySQL 8.0, user kaoyandaily, db kaoyandaily |
| Git remote | 本地 git@gitee.com:thelatter123/kaoyandaka4.git;服务器 https://gitee.com/thelatter123/kaoyandaka4.git (**Gitee,非 GitHub**) |
| PM2 logs | /www/wwwlogs/pm2/kaoyandaily-api-*.log |
| 其他进程 | webhook-deploy(webhook-server.js,root,自动部署监听,Jul28 起运行) |

## Critical Rule
NEVER overwrite /www/wwwroot/kaoyandaka4/.env — it contains production DB credentials and session secrets.

## Operations

### Sync (most common)
踩过的坑(2026-08-06):
- 服务器 `client/package-lock.json` 常带本地改动挡住 `git pull` → 先 `git checkout -- client/package-lock.json`
- npmmirror 镜像缺 `@tabler/icons-react` tarball(404)→ 改用官方源 `npm install --registry=https://registry.npmjs.org`
- `pm2 logs` 是流式命令,ssh 会挂住 → 必须加 `--nostream` 或改用 `pm2 list`

```
ssh kaoyan "
  cd /www/wwwroot/kaoyandaka4
  git checkout -- client/package-lock.json 2>/dev/null
  git pull
  cd client && npm install --registry=https://registry.npmjs.org 2>&1 | tail -1 && cd ..
  npm run build:client 2>&1 | tail -2
  npm run build:server 2>&1 | tail -2
  pm2 restart kaoyandaily-api
  sleep 2 && pm2 list | grep kaoyandaily-api
"
```

### Check Status
```
ssh kaoyan "pm2 list; free -h; df -h /"
```

### View Logs
```
ssh kaoyan "pm2 logs kaoyandaily-api --lines 50"
```

### Restart Only
```
ssh kaoyan "pm2 restart kaoyandaily-api"
```

### Backup Database
DB password is in the server .env (`grep DB_PASSWORD /www/wwwroot/kaoyandaka4/.env`). Replace DB_PASSWORD below:
```
ssh kaoyan "mysqldump -ukaoyandaily -p'DB_PASSWORD' kaoyandaily > /root/backup-\$(date +%Y%m%d-%H%M).sql"
```

### Test API
路由前缀是 `/api/v1/`,未登录会返回 401(属正常):
```
ssh kaoyan "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/v1/presets"
```

## Notes
- BT Panel manages Nginx
- Port 80 (Nginx) proxies /api/ to 3001 (Express)
- Build: npm run build:client (Vite) + npm run build:server (tsc)
