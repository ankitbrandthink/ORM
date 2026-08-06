#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════╗
# ║  ORM CMS — Deployment Script for Hostinger VPS          ║
# ║  Target: orm.brandthink.in                              ║
# ╚══════════════════════════════════════════════════════════╝
# Usage (from your local machine):
#   chmod +x deploy.sh
#   ./deploy.sh
#
# What it does:
#   1. Syncs backend + frontend code to the VPS via rsync
#   2. Installs/updates Python venv dependencies
#   3. Builds Next.js in standalone mode
#   4. Restarts systemd services
#   5. Reloads nginx

set -euo pipefail

# ── Config ─────────────────────────────────────────────────
VPS_USER="root"
VPS_HOST="your-vps-ip-here"          # e.g. 185.xx.xx.xx (Hostinger IP)
VPS_SSH_KEY="$HOME/.ssh/id_rsa"       # your SSH private key
REMOTE_DIR="/var/www/orm"

# ── Local paths ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo "▶ Deploying ORM CMS to $VPS_HOST…"

# ── 1. Sync backend ────────────────────────────────────────
echo ""
echo "── Syncing backend code…"
rsync -avz --exclude='.venv' --exclude='__pycache__' --exclude='*.pyc' \
  --exclude='.env' --exclude='data/' \
  -e "ssh -i $VPS_SSH_KEY" \
  "$BACKEND_DIR/" "$VPS_USER@$VPS_HOST:$REMOTE_DIR/backend/"

# ── 2. Sync frontend ───────────────────────────────────────
echo ""
echo "── Syncing frontend code…"
rsync -avz --exclude='.next' --exclude='node_modules' \
  --exclude='.env.production' \
  -e "ssh -i $VPS_SSH_KEY" \
  "$FRONTEND_DIR/" "$VPS_USER@$VPS_HOST:$REMOTE_DIR/frontend/"

# ── 3. Remote commands ─────────────────────────────────────
echo ""
echo "── Running remote setup…"
ssh -i "$VPS_SSH_KEY" "$VPS_USER@$VPS_HOST" bash <<'REMOTE'
set -e

REMOTE_DIR="/var/www/orm"
cd "$REMOTE_DIR"

# Python venv
echo "  → Installing Python dependencies…"
cd backend
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
cd ..

# Next.js build
echo "  → Building Next.js…"
cd frontend
npm ci --silent
npm run build
cd ..

# Copy static files for standalone output
cp -r frontend/.next/static frontend/.next/standalone/.next/static 2>/dev/null || true
cp -r frontend/public        frontend/.next/standalone/public        2>/dev/null || true

echo "  → Restarting services…"
systemctl restart orm-backend.service  || true
systemctl restart orm-frontend.service || true
systemctl reload  nginx                || true

echo "  ✓ Deploy complete"
REMOTE

echo ""
echo "✅ Deployment done → https://orm.brandthink.in"
