#!/bin/bash
# =============================================================================
# 砚台考研打卡 · 一键部署脚本
# 用法：SSHPASS="服务器密码" bash deploy/deploy.sh
#
# 前提：本地已安装 sshpass（brew install hudochenkov/sshpass/sshpass）
# =============================================================================

set -e

SERVER_IP="118.24.164.3"
SERVER_USER="root"
REMOTE_DIR="/var/www/kaoyandaily"
PROJECT_DIR="/Users/happy/Desktop/kaoyandaily"

echo "=========================================="
echo "  砚台考研打卡 - 一键部署"
echo "  目标: $SERVER_IP:$REMOTE_DIR"
echo "=========================================="

# 1. 在服务器上创建目录结构
echo ""
echo "[1/7] 在服务器上创建目录..."
sshpass -e ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} "
  mkdir -p ${REMOTE_DIR}/client/dist
  mkdir -p ${REMOTE_DIR}/server/dist
  mkdir -p ${REMOTE_DIR}/shared
  mkdir -p ${REMOTE_DIR}/deploy
"

# 2. 上传项目文件（排除 node_modules、dist、.env 等）
echo ""
echo "[2/7] 上传项目文件（rsync）..."
sshpass -e rsync -avz --delete \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='dist/' \
  --exclude='.env' \
  --exclude='*.local' \
  --exclude='.DS_Store' \
  --exclude='.vite/' \
  --exclude='test-results/' \
  --exclude='playwright-report/' \
  --exclude='e2e/' \
  ${PROJECT_DIR}/ ${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/

# 3. 上传生产环境 .env
echo ""
echo "[3/7] 上传 .env 配置文件..."
sshpass -e ssh ${SERVER_USER}@${SERVER_IP} "
  cp ${REMOTE_DIR}/deploy/.env.production ${REMOTE_DIR}/.env
"

# 4. 安装依赖
echo ""
echo "[4/7] 安装项目依赖..."
sshpass -e ssh ${SERVER_USER}@${SERVER_IP} "
  cd ${REMOTE_DIR}
  npm ci --production 2>/dev/null || npm install
  cd client && npm ci --production 2>/dev/null || npm install
  cd ../server && npm ci --production 2>/dev/null || npm install
  cd ../shared && npm ci --production 2>/dev/null || npm install 2>/dev/null || true
"

# 5. 构建
echo ""
echo "[5/7] 构建前端和后端..."
sshpass -e ssh ${SERVER_USER}@${SERVER_IP} "
  cd ${REMOTE_DIR}
  npm run build:client
  npm run build:server
"

# 6. 初始化数据库
echo ""
echo "[6/7] 初始化数据库..."
sshpass -e ssh ${SERVER_USER}@${SERVER_IP} "
  cd ${REMOTE_DIR}
  npm run db:init
"

# 7. 配置 PM2 并启动
echo ""
echo "[7/7] 配置 PM2 并启动服务..."
sshpass -e ssh ${SERVER_USER}@${SERVER_IP} "
  cd ${REMOTE_DIR}
  pm2 delete kaoyandaily 2>/dev/null || true
  pm2 start server/dist/index.js --name kaoyandaily --cwd ${REMOTE_DIR}
  pm2 save
  pm2 startup systemd -u root --hp /root 2>/dev/null || true
"

# 8. 配置 Nginx
echo ""
echo "[额外] 配置 Nginx..."
sshpass -e ssh ${SERVER_USER}@${SERVER_IP} "
  cp ${REMOTE_DIR}/deploy/nginx.ip.conf /etc/nginx/conf.d/kaoyandaily.conf
  nginx -t && systemctl reload nginx || systemctl restart nginx
"

echo ""
echo "=========================================="
echo "  ✅ 部署完成！"
echo "  访问 http://${SERVER_IP}"
echo "=========================================="
