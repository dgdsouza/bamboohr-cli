#!/usr/bin/env bash
# Package the skill as dist/bamboohr.zip for upload to Claude Cowork / claude.ai.
# The zip contains a bamboohr/ folder (matching the skill name in SKILL.md)
# with only the skill payload: SKILL.md + scripts/.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist/bamboohr dist/bamboohr.zip
mkdir -p dist/bamboohr/scripts
cp SKILL.md dist/bamboohr/
cp scripts/bamboohr.js dist/bamboohr/scripts/

(cd dist && zip -qr bamboohr.zip bamboohr)
rm -rf dist/bamboohr
echo "Wrote dist/bamboohr.zip ($(du -h dist/bamboohr.zip | cut -f1))"
