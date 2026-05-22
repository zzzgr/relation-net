#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# 人物关系网 — 一键部署 / 升级到 Cloudflare Workers + D1
# 用法: bash scripts/deploy.sh
# ─────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ── 前置检查 ──────────────────────────────────────────────────
command -v npx >/dev/null 2>&1 || error "需要 Node.js 环境（npx 不可用）"
command -v npm >/dev/null 2>&1 || error "需要 npm"

# ── 1. 确保已登录 Cloudflare ──────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " 人物关系网 · 部署到 Cloudflare Workers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if ! npx wrangler whoami 2>/dev/null | grep -q "You are logged in"; then
  warn "尚未登录 Cloudflare，正在打开浏览器..."
  npx wrangler login
fi
info "已登录 Cloudflare"

# ── 2. 创建 D1 数据库（如果 wrangler.toml 还是占位符） ─────────
TOML_FILE="wrangler.toml"
CURRENT_ID=$(grep 'database_id' "$TOML_FILE" | head -1 | sed 's/.*= *"\(.*\)"/\1/')

IS_FRESH=false
if [[ "$CURRENT_ID" == "PLACEHOLDER_REPLACE_AFTER_WRANGLER_D1_CREATE" || -z "$CURRENT_ID" ]]; then
  IS_FRESH=true
  warn "检测到 database_id 为占位符，正在创建 D1 数据库..."
  CREATE_OUTPUT=$(npx wrangler d1 create relation-net-db 2>&1) || true

  NEW_ID=$(echo "$CREATE_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  if [[ -z "$NEW_ID" ]]; then
    echo "$CREATE_OUTPUT"
    error "无法解析 database_id，请手动从上面的输出中复制 ID 填入 wrangler.toml"
  fi

  sed -i.bak "s/PLACEHOLDER_REPLACE_AFTER_WRANGLER_D1_CREATE/$NEW_ID/" "$TOML_FILE"
  rm -f "$TOML_FILE.bak"
  info "D1 数据库已创建，database_id = $NEW_ID"
else
  info "D1 database_id 已配置: $CURRENT_ID（升级模式）"
fi

# ── 3. 设置 Secrets（首次部署自动生成） ───────────────────────
echo ""
if [[ "$IS_FRESH" == true ]]; then
  warn "首次部署，正在配置 Secrets..."

  # 生成随机 SESSION_SECRET（64 字符 hex）
  SESSION_SECRET=$(openssl rand -hex 32)
  echo "$SESSION_SECRET" | npx wrangler secret put SESSION_SECRET
  info "SESSION_SECRET 已设置（随机生成）"

  # 设置默认密码为 admin
  echo "admin" | npx wrangler secret put APP_PASSWORD
  info "APP_PASSWORD 已设置为 admin"
else
  info "Secrets 已存在（升级时不覆盖，如需修改请用 wrangler secret put）"
fi

# ── 4. 应用 migrations 到远端 D1 ──────────────────────────────
echo ""
warn "正在应用 migrations 到远端 D1..."
npm run db:migrate
info "migrations 已应用"

# ── 5. 加载 Demo 数据（通过 DEMO=1 环境变量控制） ─────────────
if [[ "$IS_FRESH" == true && "${DEMO:-}" == "1" ]]; then
  echo ""
  warn "正在加载 Demo 演示数据..."
  npx wrangler d1 execute DB --remote --file=scripts/demo-data.sql
  info "Demo 数据已加载（35 人物 / 20 事件 / 家族关系 / 地址 / 手机号）"
elif [[ "$IS_FRESH" == true ]]; then
  info "跳过 Demo 数据（如需加载，使用 DEMO=1 npm run deploy）"
fi

# ── 6. 构建前端 ───────────────────────────────────────────────
echo ""
warn "正在构建前端..."
npm run build
info "构建完成"

# ── 7. 部署 Worker ────────────────────────────────────────────
echo ""
warn "正在部署 Worker..."
npx wrangler deploy
info "部署完成"

# ── 完成 ──────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e " ${GREEN}部署成功！${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo " 访问地址：Dashboard → Workers → cloudflare-relation-net → Visit"
echo ""
if [[ "$IS_FRESH" == true ]]; then
  echo " 默认密码：admin"
  echo " 登录后请在「设置」页面修改密码。"
else
  echo " 升级完成，密码和数据保持不变。"
fi
echo ""
echo " 后续升级只需：bash scripts/deploy.sh"
echo ""
