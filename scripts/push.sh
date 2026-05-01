#!/bin/bash
# Auto-push to GitHub using credentials from the admin API
# Usage: bash scripts/push.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Read .env
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "Error: .env file not found"
    exit 1
fi

SITE_URL=$(grep SITE_URL "$PROJECT_DIR/.env" | cut -d= -f2-)
ADMIN_PASSWORD=$(grep ADMIN_PASSWORD "$PROJECT_DIR/.env" | cut -d= -f2-)

if [ -z "$SITE_URL" ] || [ -z "$ADMIN_PASSWORD" ]; then
    echo "Error: SITE_URL and ADMIN_PASSWORD must be set in .env"
    exit 1
fi

# Fetch GitHub credentials
CREDS=$(curl -s "$SITE_URL/api/credentials?service=github" \
    -H "x-admin-password: $ADMIN_PASSWORD")

GH_USERNAME=$(echo "$CREDS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('github',{}).get('username',''))" 2>/dev/null)
GH_TOKEN=$(echo "$CREDS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('github',{}).get('token',''))" 2>/dev/null)

if [ -z "$GH_USERNAME" ] || [ -z "$GH_TOKEN" ]; then
    echo "Error: Could not fetch GitHub credentials. Check your admin page."
    exit 1
fi

# Get repo URL from git remote
REPO_URL=$(git -C "$PROJECT_DIR" remote get-url origin | sed 's|https://[^@]*@|https://|')

# Push using token
AUTH_URL=$(echo "$REPO_URL" | sed "s|https://|https://$GH_USERNAME:$GH_TOKEN@|")
git -C "$PROJECT_DIR" push "$AUTH_URL" main

echo "Pushed successfully."
