#!/usr/bin/env bash
# 배포 전 검사. 하나라도 실패하면 멈춘다(0923 PR #22 가 빌드 실패인 채로 main 에 들어간 사고 재발 방지).
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsc --noEmit
npx vitest run --reporter=dot
npm run build > /tmp/curi-build.log 2>&1 || { tail -30 /tmp/curi-build.log; echo "❌ build 실패"; exit 1; }
echo "✅ tsc, vitest, build 전부 통과"
