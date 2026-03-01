#!/bin/bash
set -euo pipefail

# Reseed production city with exported buildings
# Usage: bash scripts/reseed-production.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SEED_FILE="$SCRIPT_DIR/seed-data.json"

cd "$PROJECT_DIR"

echo "=== Step 1: Export buildings from production ==="
bun scripts/export-prod-buildings.ts

if [ ! -f "$SEED_FILE" ]; then
  echo "ERROR: seed-data.json not created"
  exit 1
fi

echo ""

echo "=== Step 2: Deploy latest code to production ==="
echo "This will deploy the new reseedCity action to prod."
read -p "Continue with deploy? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

npx convex deploy --cmd 'bun run build'
echo ""

echo "=== Step 3: Run reseed action ==="
echo "WARNING: This will RESET the entire production city and re-seed it."
read -p "Are you sure? Type 'reseed' to confirm: " CONFIRM
if [ "$CONFIRM" != "reseed" ]; then
  echo "Aborted."
  exit 1
fi

bun scripts/run-reseed.ts
echo ""

echo "=== Step 4: Verify ==="
echo "Checking building count..."
npx convex run seedBuildings:listBuildingMeta --prod | head -5
echo ""
echo "Checking plot statuses..."
npx convex run seedBuildings:listPlotMeta --prod | head -5
echo ""
echo "Done! Visit the production site to visually verify."
