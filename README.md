# 🧬 Health Dashboard

Your personal longevity dashboard. Track blood work, VO2 max, DEXA scans, gut biome, and more — all in one place.

---

## 🚀 Setup Guide (No coding required!)

Follow these 4 steps. Everything is done in your browser.

---

### Step 1: Create your GitHub repository

1. Go to https://github.com/new
2. Name it `health-dashboard`
3. Set it to **Private**
4. Click **Create repository**

---

### Step 2: Upload the template files

1. You should see your empty repo page with an **"uploading an existing file"** link — click it (or click **Add file** → **Upload files**)
2. On your computer, find the **health-dashboard** folder you unzipped
3. **⚠️ IMPORTANT: Open the folder first!** Don't drag the folder itself.
4. Once you're INSIDE the folder, press **Cmd + A** (Mac) or **Ctrl + A** (Windows) to select ALL the files
5. Drag all those selected files into the GitHub upload box
6. Click **Commit changes**

**How to check it's right:** On your repo page, you should see `index.html`, `styles.css`, `app.js` listed directly — NOT inside a folder.

✅ If you see: `index.html` at the top level → Correct!
❌ If you see: `health-dashboard/` folder → Wrong. Delete the repo and try again. Make sure you open the folder and drag the files INSIDE it.

---

### Step 3: Deploy to Vercel

1. Go to https://vercel.com/new
2. If this is your first time, click **"Continue with GitHub"** and authorize Vercel
3. You'll see your `health-dashboard` repo in the list — click **Import**
4. Don't change anything — just click **Deploy**
5. Wait 30 seconds
6. Vercel gives you a URL — **save this!** That's your dashboard.

---

### Step 4: Set up your private data server (VPS)

1. Go to https://cloud.digitalocean.com → **Create** → **Droplets**
2. Choose:
   - **Region:** Closest to you
   - **Image:** Ubuntu 24.04
   - **Size:** Basic → $6/month (cheapest)
   - **Authentication:** Password (pick something you'll remember)
3. Click **Advanced Options** → check **Add User Data**
4. A text box appears. Paste this script into it (replace YOUR_GITHUB_USERNAME with your actual GitHub username):

```bash
#!/bin/bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git
cd /root
git clone https://github.com/YOUR_GITHUB_USERNAME/health-dashboard.git
cd health-dashboard
mkdir -p data
cd server && npm install && cd ..
ufw allow 3000
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
```

5. Click **Create Droplet**
6. Wait 2-3 minutes
7. Copy the **IP address** shown (the public one, looks like `209.38.xxx.xxx`)

---

### Step 5: Connect your dashboard to your data

1. Go to your GitHub repo
2. Click on `app.js`
3. Click the **pencil icon** ✏️ to edit
4. Find this line near the top:
   ```
   API_BASE: ''
   ```
5. Replace it with your VPS IP (use the IP from Step 4):
   ```
   API_BASE: 'http://YOUR_VPS_IP:3000/api'
   ```
6. Click **Commit changes**

Vercel auto-redeploys. Wait 30 seconds, then open your dashboard URL.

---

## 🎉 Done!

Open Telegram and message Claude:

> "Here are my blood test results: Vitamin D 45 ng/mL, Total Cholesterol 195 mg/dL, Glucose 92 mg/dL"

Claude handles everything from here.

---

## How it works

- **"My vitamin D is 45"** → Data updates instantly, no redeployment
- **"Build me a sleep tracker"** → Claude builds it and deploys
- **"Add my DEXA scan"** → Claude creates the data and the view
