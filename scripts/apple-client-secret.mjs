// Supabase 애플 로그인 설정에 붙여 넣을 「Secret Key (for OAuth)」 만들기 (2026-10-05).
// Supabase 는 .p8 파일 그대로가 아니라, 그걸로 서명한 JWT 를 요구한다. 애플 규정상 최대 6개월 유효 → 6개월마다 새로 만들어 붙여 넣는다.
//
// 쓰는 법 (열쇠 내용은 화면에 찍히지 않는다. 결과 JWT 한 줄만 나온다):
//   APPLE_TEAM_ID=2NS5S224QL APPLE_KEY_ID=<키 ID> APPLE_SERVICES_ID=<웹 로그인용 Services ID> \
//   APPLE_P8_PATH=/경로/AuthKey_XXXX.p8 node scripts/apple-client-secret.mjs
import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'

const need = ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_SERVICES_ID', 'APPLE_P8_PATH']
const missing = need.filter(k => !process.env[k])
if (missing.length) { console.error(`빠진 값: ${missing.join(', ')}`); process.exit(1) }

const b64u = b => Buffer.from(b).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const header = b64u(JSON.stringify({ alg: 'ES256', kid: process.env.APPLE_KEY_ID, typ: 'JWT' }))
const payload = b64u(JSON.stringify({
    iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 60 * 60 * 24 * 180,   // 180일
    aud: 'https://appleid.apple.com', sub: process.env.APPLE_SERVICES_ID,
}))
const key = createPrivateKey(readFileSync(process.env.APPLE_P8_PATH, 'utf8'))
const sig = sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' })
console.log(`${header}.${payload}.${b64u(sig)}`)
