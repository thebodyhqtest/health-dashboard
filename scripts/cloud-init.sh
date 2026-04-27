#!/bin/bash
# ========================================
# Health Dashboard — DigitalOcean User Data Script
# Paste this ENTIRE script into the "User Data" box
# when creating your DigitalOcean droplet.
# It does EVERYTHING automatically.
# ========================================

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git

# Clone the template
cd /root
git clone https://github.com/TEMPLATE_OWNER/health-dashboard.git
cd health-dashboard

# Create private data directory
mkdir -p data

# Install server dependencies
cd server
npm install
cd ..

# Open firewall port
ufw allow 3000

# Create systemd service
cat > /etc/systemd/system/health-dashboard.service <<EOF
[Unit]
Description=Health Dashboard API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/health-dashboard/server
ExecStart=/usr/bin/node api.js
Restart=on-failure
Environment=DATA_DIR=/root/health-dashboard/data
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable health-dashboard
systemctl start health-dashboard

echo "Health Dashboard API is running on port 3000" > /root/setup-complete.txt
