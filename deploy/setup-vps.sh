#!/bin/bash
# ============================================================
#  Kiss Me Ranking — VPS Setup Script (Ubuntu 24.04)
#  Run as root: bash setup-vps.sh
# ============================================================

set -euo pipefail

APP_DIR="/var/www/kiss-me-ranking"
APP_USER="kissme"
LOG_DIR="/var/log/kiss-me-ranking"
DOMAIN="ranking.kissme-vip.com"

echo "========================================"
echo " Kiss Me Ranking — VPS Setup"
echo " Server: $(hostname)"
echo "========================================"

# ---------- 1. System Update ----------
echo "[1/8] Updating system packages..."
apt update && apt upgrade -y

# ---------- 2. Install Node.js 20 LTS ----------
echo "[2/8] Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo "Node.js $(node -v) installed"
echo "npm $(npm -v) installed"

# ---------- 3. Install PM2 ----------
echo "[3/8] Installing PM2 process manager..."
npm install -g pm2

# ---------- 4. Install Nginx ----------
echo "[4/8] Installing Nginx..."
apt install -y nginx
systemctl enable nginx

# ---------- 5. Create app user & directory ----------
echo "[5/8] Setting up application directory..."
if ! id "$APP_USER" &>/dev/null; then
    useradd --system --shell /bin/bash --home "$APP_DIR" "$APP_USER"
fi
mkdir -p "$APP_DIR" "$LOG_DIR"

# ---------- 6. Copy project files ----------
echo "[6/8] Project directory ready at: $APP_DIR"
echo ""
echo "  >>> Upload your project files now: <<<"
echo "  From your PC, run:"
echo "    scp -r ./* root@$(hostname -I | awk '{print $1}'):$APP_DIR/"
echo ""
echo "  Or use git:"
echo "    cd $APP_DIR && git clone YOUR_REPO_URL ."
echo ""

# ---------- 7. Configure Nginx ----------
echo "[7/8] Configuring Nginx..."
if [ -f "$APP_DIR/deploy/nginx-ranking.conf" ]; then
    cp "$APP_DIR/deploy/nginx-ranking.conf" "/etc/nginx/sites-available/$DOMAIN"
    ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
    # Remove default site if exists
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx
    echo "Nginx configured for $DOMAIN"
else
    echo "WARNING: Nginx config not found. Copy it manually after uploading project files:"
    echo "  cp $APP_DIR/deploy/nginx-ranking.conf /etc/nginx/sites-available/$DOMAIN"
    echo "  ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN"
    echo "  nginx -t && systemctl reload nginx"
fi

# ---------- 8. Setup Firewall ----------
echo "[8/8] Configuring firewall (UFW)..."
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
echo "y" | ufw enable
ufw status

echo ""
echo "========================================"
echo " Setup complete!"
echo "========================================"
echo ""
echo " Next steps:"
echo ""
echo " 1. Upload project files to $APP_DIR"
echo "    scp -r ./* root@$(hostname -I | awk '{print $1}'):$APP_DIR/"
echo ""
echo " 2. Copy .env and fill in real values:"
echo "    cp $APP_DIR/deploy/.env.production $APP_DIR/.env"
echo "    nano $APP_DIR/.env"
echo ""
echo " 3. Install Node dependencies:"
echo "    cd $APP_DIR && npm install --omit=dev"
echo ""
echo " 4. Set permissions:"
echo "    chown -R $APP_USER:$APP_USER $APP_DIR $LOG_DIR"
echo ""
echo " 5. Start with PM2:"
echo "    cd $APP_DIR && pm2 start deploy/ecosystem.config.js"
echo "    pm2 save"
echo "    pm2 startup"
echo ""
echo " 6. Configure Nginx (if not done already):"
echo "    cp $APP_DIR/deploy/nginx-ranking.conf /etc/nginx/sites-available/$DOMAIN"
echo "    ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN"
echo "    nginx -t && systemctl reload nginx"
echo ""
echo " 7. Cloudflare DNS:"
echo "    Add A record: ranking -> $(hostname -I | awk '{print $1}')"
echo "    During Let's Encrypt issuance, set Proxy status = DNS only"
echo "    After certificate works, switch back to Proxied if desired"
echo "    SSL/TLS: Full (Strict)"
echo ""
echo " PM2 useful commands:"
echo "    pm2 status           — Check app status"
echo "    pm2 logs             — View logs"
echo "    pm2 restart all      — Restart app"
echo "    pm2 monit            — Live monitoring"
echo "========================================"
