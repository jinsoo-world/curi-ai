#!/usr/bin/env node
// 답 품질 관문 실행기 — 실제 일은 scripts/rag-eval-run.ts (앱의 matchKnowledge 를 그대로 쓰려고 vite-node 로 돌림)
// 사용법: docs/qa/rag-eval.md
import { spawnSync } from 'node:child_process'
const r = spawnSync('npx', ['vite-node', 'scripts/rag-eval-run.ts', '--', ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(r.status ?? 1)
