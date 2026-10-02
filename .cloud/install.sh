#!/usr/bin/env bash
set -euo pipefail
cd /workspace/AI-app-consumer-focused
export NPM_CONFIG_CACHE=/workspace/.cache/npm
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) { console.error("Cast requires Node 24 or newer"); process.exit(1); }'
npm ci --no-audit --no-fund
npm run typecheck
npm test
# Prepares this cloud's local preview only. Never deploy local fixture bindings.
AI_ENABLED=false npm run local:build
