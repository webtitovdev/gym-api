#!/usr/bin/env bash
# One-shot installer for gym-api on Ubuntu/Debian.
# Run as root on your VPS:
#   curl -sSL https://raw.githubusercontent.com/webtitovdev/gym-api/main/deploy/install.sh | sudo bash
# Or after cloning:
#   sudo bash deploy/install.sh

set -euo pipefail

REPO="https://github.com/webtitovdev/gym-api.git"
INSTALL_DIR="/opt/gym-api"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo bash $0)" >&2
  exit 1
fi

# ───── prompts ─────
if [ -z "${VPS_IP:-}" ]; then
  read -rp "Public IP of this VPS (e.g. 1.2.3.4): " VPS_IP
fi
if [ -z "${APP_PASSWORD:-}" ]; then
  read -rsp "App password (you'll use this to log in): " APP_PASSWORD
  echo
fi
DOMAIN="gym-api.${VPS_IP}.nip.io"
JWT_SECRET=$(openssl rand -hex 32)

echo
echo ">>> Installing for $DOMAIN"
echo

# ───── Node 20 + Caddy ─────
apt-get update -y
apt-get install -y curl git ca-certificates gnupg openssl

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# ───── user + clone ─────
# No --create-home: we own /opt/gym-api separately, no need for $HOME there
id -u gym-api >/dev/null 2>&1 || \
  useradd --system --shell /usr/sbin/nologin gym-api

# If dir exists without .git (e.g. leftover from prior failed run), wipe it.
if [ -d "$INSTALL_DIR" ] && [ ! -d "$INSTALL_DIR/.git" ]; then
  rm -rf "$INSTALL_DIR"
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  cd "$INSTALL_DIR" && sudo -u gym-api git pull
else
  git clone "$REPO" "$INSTALL_DIR"
  chown -R gym-api:gym-api "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
# Use npm ci if lockfile exists, otherwise npm install
if [ -f package-lock.json ]; then
  sudo -u gym-api npm ci
else
  sudo -u gym-api npm install
fi
sudo -u gym-api npm run build
sudo -u gym-api npm prune --omit=dev || true

# ───── .env ─────
mkdir -p "$INSTALL_DIR/data"
chown gym-api:gym-api "$INSTALL_DIR/data"

cat > "$INSTALL_DIR/.env" <<EOF
PORT=3000
JWT_SECRET=${JWT_SECRET}
ADMIN_PASSWORD=${APP_PASSWORD}
CORS_ORIGIN=https://webtitovdev.github.io
DATABASE_PATH=/opt/gym-api/data/gym.db
DOMAIN=${DOMAIN}
NODE_ENV=production
EOF
chown gym-api:gym-api "$INSTALL_DIR/.env"
chmod 600 "$INSTALL_DIR/.env"

# ───── systemd ─────
cp "$INSTALL_DIR/deploy/gym-api.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable gym-api
systemctl restart gym-api
sleep 1
systemctl --no-pager status gym-api || true

# ───── caddy ─────
cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
  reverse_proxy localhost:3000
  encode gzip
  header {
    -Server
    Strict-Transport-Security "max-age=31536000"
  }
}
EOF
systemctl reload caddy

echo
echo "===================================================="
echo "  Done."
echo "  API:    https://${DOMAIN}"
echo "  Health: curl https://${DOMAIN}/health"
echo "  Login:  curl -X POST https://${DOMAIN}/auth/login \\"
echo "            -H 'content-type: application/json' \\"
echo "            -d '{\"password\":\"<your password>\"}'"
echo "===================================================="
