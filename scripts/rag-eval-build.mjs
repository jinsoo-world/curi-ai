#!/usr/bin/env node
// 답 품질 관문용 문제 40개 만들기 — 운영 DB 를 읽기만 한다(SELECT). 돈 0원(LLM 안 씀).
//   node scripts/rag-eval-build.mjs [--bots 열정진,도여사,글담쌤,남기훈] [--out docs/qa/rag-eval-golden.json]
// 만든 뒤 사람이 한 번 훑어보고 어색한 질문은 손으로 고친다.
import fs from 'node:fs'
import { loadEnv } from './rag-eval-env.mjs'
loadEnv()
const argv = process.argv.slice(2)
const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
const WANT = (arg('--bots') ?? '열정진,도여사,글담쌤,남기훈').split(',').map(s => s.trim()).filter(Boolean)
const OUT = arg('--out') ?? 'docs/qa/rag-eval-golden.json'
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY || URL_.includes('dummy')) { console.error('.env.local 에 진짜 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요'); process.exit(2) }
const get = async p => { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json() }

const PII = /([\w.+-]+@[\w-]+\.[\w.]+)|(01[016789][-\s.]?\d{3,4}[-\s.]?\d{4})|(0\d{1,2}-\d{3,4}-\d{4})/
const PRICE = /(\d{1,3}(,\d{3})+|\d+)\s*(만\s*)?원/
const SCHED = /(\d{1,2}\s*월\s*\d{1,2}\s*일|매주\s*[월화수목금토일]요일|\d{1,2}\s*시(\s*\d{1,2}\s*분)?|[월화수목금토일]요일)/
const NOTIN = ['비트코인 앞으로 오를까요?', '오늘 서울 날씨 어때요?', '손흥민 이번 시즌 골 몇 개예요?', '양자역학 슈뢰딩거 방정식 풀어 주세요', '제주도 흑돼지 맛집 추천해 주세요', '아이폰 최신 모델 가격이 얼마예요?', '미국 대선 결과가 어떻게 됐어요?', '파이썬으로 웹 크롤러 짜 주세요']

// 1) 자료가 있는 봇 고르기: 원하는 이름 먼저, 모자라면 조각 많은 순으로 8개까지
const chunks = await get('knowledge_chunks?select=mentor_id&limit=100000')
const count = {}; for (const c of chunks) count[c.mentor_id] = (count[c.mentor_id] ?? 0) + 1
const ids = Object.keys(count).filter(id => count[id] >= 5)
const mentors = ids.length ? await get(`mentors?select=id,name&id=in.(${ids.join(',')})`) : []
const picked = [
    ...mentors.filter(m => WANT.some(w => (m.name ?? '').includes(w))),
    ...mentors.filter(m => !WANT.some(w => (m.name ?? '').includes(w))).sort((a, b) => count[b.id] - count[a.id]),
].slice(0, 8)
if (picked.length < 5) console.warn(`자료 있는 봇이 ${picked.length}개뿐`)

// 2) 봇마다 조각에서 가격·일정·이름·일반 사실 문제 뽑기
const items = []
const perBot = Math.ceil(32 / Math.max(picked.length, 1))
const clean = s => s.replace(/\s+/g, ' ').trim()
for (const m of picked) {
    const rows = await get(`knowledge_chunks?select=content,source_id&mentor_id=eq.${m.id}&limit=400`)
    const srcs = await get(`knowledge_sources?select=id,title&mentor_id=eq.${m.id}`)
    const title = Object.fromEntries(srcs.map(s => [s.id, s.title]))
    const ok = rows.map(r => ({ ...r, content: clean(r.content ?? '') })).filter(r => r.content.length > 40 && !PII.test(r.content))
    const mine = []
    const add = (type, question, fact) => { if (fact && !PII.test(fact) && !mine.some(x => x.expectAny[0] === fact)) mine.push({ id: '', mentorId: m.id, botName: m.name, type, question, expectAny: [fact], keyFacts: [fact] }) }
    for (const r of ok) { const p = PRICE.exec(r.content); if (p) { add('price', `${topic(r.content, p.index)} 가격이 얼마예요?`, p[0].replace(/\s+/g, '')); if (mine.filter(x => x.type === 'price').length >= 2) break } }
    for (const r of ok) { const s = SCHED.exec(r.content); if (s) { add('schedule', `${topic(r.content, s.index)} 언제 해요?`, s[0].replace(/\s+/g, ' ')); if (mine.filter(x => x.type === 'schedule').length >= 1) break } }
    for (const s of srcs) { const t = clean(s.title ?? '').replace(/\.(pdf|docx?|hwpx?|txt|md)$/i, ''); const r = ok.find(x => x.source_id === s.id); if (t.length >= 3 && r && !PII.test(t)) { add('name', `「${t}」에 대해 알려 주세요`, firstWords(r.content)); break } }
    for (const r of ok) { if (mine.length >= perBot) break; add('fact', `${firstWords(r.content, 6)}에 대해 자세히 알려 주세요`, firstWords(r.content, 3, 12)) }
    items.push(...mine.slice(0, perBot))
    void title
}
const facts = items.slice(0, 32)
const bots = picked.length ? picked : [{ id: 'none', name: '' }]
const notin = NOTIN.map((q, i) => ({ id: '', mentorId: bots[i % bots.length].id, botName: bots[i % bots.length].name, type: 'notin', question: q, expectAny: [] }))
const all = [...facts, ...notin].map((x, i) => ({ ...x, id: `q${String(i + 1).padStart(2, '0')}` }))
fs.mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify({ version: 1, threshold: 32, notinMaxSim: 0.75, builtAt: new Date().toISOString(), items: all }, null, 2) + '\n')
console.log(`${all.length}문제 → ${OUT} (봇 ${picked.map(m => m.name).join(', ')})`)
if (all.length < 40) console.warn('40개가 안 됨 — 자료가 적은 봇이 많음. 손으로 채우세요.')

function firstWords(s, n = 4, max = 20) { return s.split(' ').slice(0, n).join(' ').slice(0, max) }
function topic(s, idx) { const before = s.slice(Math.max(0, idx - 30), idx).split(' ').filter(w => w.length > 1).slice(-3).join(' '); return before || '이거' }
