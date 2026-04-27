#!/bin/bash
# ========================================
# Health Dashboard — One-Line VPS Setup
# Run: curl -sL <your-raw-github-url>/scripts/setup.sh | bash
# Or:  bash scripts/setup.sh
# ========================================

set -e

echo "🧬 Health Dashboard — VPS Setup"
echo "================================"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "✅ Node.js $(node -v)"

# Create data directory
echo "📁 Creating data directory..."
mkdir -p data

# Install server dependencies
echo "📦 Installing server dependencies..."
cd server
npm install
cd ..

# Set up systemd service for auto-start
echo "🔧 Setting up systemd service..."
sudo tee /etc/systemd/system/health-dashboard.service > /dev/null <<EOF
[Unit]
Description=Health Dashboard API
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)/server
ExecStart=$(which node) api.js
Restart=on-failure
Environment=DATA_DIR=$(pwd)/data
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable health-dashboard
sudo systemctl start health-dashboard

echo ""
echo "✅ Setup complete!"
echo "🌐 API running on port 3000"
echo "📁 Put your data files in: $(pwd)/data/"
echo ""
echo "Next steps:"
echo "  1. Set API_BASE in app.js to: http://YOUR_VPS_IP:3000/api"
echo "  2. Deploy frontend to Vercel: vercel --prod"
echo "  3. Start adding your health data!"
echo ""
echo "Test it: curl http://localhost:3000/api/health"
