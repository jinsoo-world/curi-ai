// 라이브 결제 화면에 어느 토스 열쇠가 박혀 있는지 읽는다. (테스트 열쇠 test_ck_ / 라이브 열쇠 live_ck_)
//   node scripts/toss-live-check.mjs                 # www.curi-ai.com 기본
//   node scripts/toss-live-check.mjs https://다른주소  # 미리보기 배포 점검
//   node scripts/toss-live-check.mjs --expect live    # 라이브 열쇠가 아니면 종료코드 1 (교체 뒤 확인용)
//
// 방법 = 화면 HTML 에서 /_next/static 스크립트 목록을 모아 전부 받아 열쇠 접두사를 찾는다.
// 열쇠 값 전체는 절대 찍지 않는다. 접두사 + 끝 4자만 보인다.
// 같이 보는 것 = 환불규정(/refund) 200 · 하단 사업자정보(사업자등록번호·통신판매업) 노출. 토스 심사 요건.

const args = process.argv.slice(2)
const base = (args.find(a => a.startsWith('http')) ?? 'https://www.curi-ai.com').replace(/\/$/, '')
const expectIdx = args.indexOf('--expect')
const expect = expectIdx >= 0 ? args[expectIdx + 1] : null   // 'live' | 'test' | null

const PAGES = ['/charge', '/os/charge']
const KEY_RE = /\b(test_ck_|live_ck_|test_gck_|live_gck_)([A-Za-z0-9]+)/g

async function get(url) {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'curi-toss-live-check' } })
    return { status: res.status, text: res.ok ? await res.text() : '' }
}

function mask(prefix, rest) {
    return `${prefix}${'*'.repeat(Math.max(0, rest.length - 4))}${rest.slice(-4)}`
}

function scriptUrls(html) {
    const out = new Set()
    for (const m of html.matchAll(/(?:src="|")(\/_next\/static\/[^"'\s]+\.js)/g)) out.add(base + m[1])
    return [...out]
}

async function checkPage(path) {
    const page = await get(base + path)
    const found = new Map()   // 마스킹된 열쇠 → 종류
    if (page.status === 200) {
        // HTML 안에 바로 있을 수도, 스크립트 안에 있을 수도 있다. 둘 다 본다
        const sources = [page.text]
        const urls = scriptUrls(page.text)
        const bodies = await Promise.all(urls.map(u => get(u).then(r => r.text).catch(() => '')))
        sources.push(...bodies)
        for (const s of sources) for (const m of s.matchAll(KEY_RE)) found.set(mask(m[1], m[2]), m[1].startsWith('live') ? 'live' : 'test')
        return { path, status: page.status, scripts: urls.length, found }
    }
    return { path, status: page.status, scripts: 0, found }
}

const results = []
for (const p of PAGES) results.push(await checkPage(p))
const refund = await get(base + '/refund')
const chargeHtml = results[0].status === 200 ? (await get(base + '/charge')).text : ''
const 사업자정보 = ['사업자등록번호', '통신판매'].every(w => chargeHtml.includes(w))

console.log(`# 토스 열쇠 점검 — ${base} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`)
let kinds = new Set()
for (const r of results) {
    const keys = [...r.found.entries()]
    keys.forEach(([, k]) => kinds.add(k))
    const 요약 = r.status !== 200 ? `HTTP ${r.status} (화면 없음)`
        : keys.length === 0 ? `열쇠를 못 찾음 (스크립트 ${r.scripts}개 확인)`
        : keys.map(([k, kind]) => `${kind === 'live' ? '라이브' : '테스트'} ${k}`).join(', ')
    console.log(`${r.path.padEnd(11)} → ${요약}`)
}
console.log(`/refund     → HTTP ${refund.status} ${refund.status === 200 ? '(환불규정 있음)' : '(환불규정 없음!)'}`)
console.log(`사업자정보   → ${사업자정보 ? '있음 (사업자등록번호·통신판매번호 노출)' : '없음! 토스 심사 요건'}`)

const 판정 = kinds.has('live') && !kinds.has('test') ? 'live' : kinds.has('test') ? 'test' : 'unknown'
console.log(`판정        → ${판정 === 'live' ? '라이브 열쇠. 실결제가 일어난다' : 판정 === 'test' ? '테스트 열쇠. 진짜 돈은 안 움직인다' : '열쇠를 읽지 못했다'}`)

if (expect && 판정 !== expect) {
    console.error(`기대한 ${expect} 와 다르다 (${판정})`)
    process.exit(1)
}
