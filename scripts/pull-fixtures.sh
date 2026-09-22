#!/usr/bin/env bash
# Pull the intake fixtures the Mac mini's dev server kept (FLOW_FIXTURES_DIR) into tests/fixtures/intakes,
# so every real dump becomes a replay test. Run: scripts/pull-fixtures.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p tests/fixtures/intakes
rsync -a --include='*-plan.json' --exclude='*' macmini:Library/Caches/Anchor/fixtures/ tests/fixtures/intakes/ 2>/dev/null || scp -q 'macmini:Library/Caches/Anchor/fixtures/*-plan.json' tests/fixtures/intakes/ || true
ls tests/fixtures/intakes | wc -l | xargs echo "fixtures:"
