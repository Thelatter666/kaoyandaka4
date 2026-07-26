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
| GitHub | git@github.com:Thelatter666/kaoyandaka4.git |
| PM2 logs | /www/wwwlogs/pm2/kaoyandaily-api-*.log |

## Critical Rule
NEVER overwrite /www/wwwroot/kaoyandaka4/.env — it contains production DB credentials and session secrets.

## Operations

### Sync from GitHub (most common)
```
ssh kaoyan "
  cd /www/wwwroot/kaoyandaka4
  git pull
  npm install --production
  cd client && npm install && cd ..
  cd server && npm install && cd ..
  npm run build:client
  npm run build:server
  pm2 restart kaoyandaily-api
  pm2 logs kaoyandaily-api --lines 5
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
```
ssh kaoyan "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/presets"
```

## Notes
- BT Panel manages Nginx
- Port 80 (Nginx) proxies /api/ to 3001 (Express)
- Build: npm run build:client (Vite) + npm run build:server (tsc)
