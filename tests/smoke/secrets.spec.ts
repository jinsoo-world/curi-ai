// 7) 라이브 HTML·번들에 열쇠 흔적이 없는지 (공개 저장소 + 공개 화면. 열쇠가 새면 4분 안에 털린다)
//    - live_ck_ (토스 실결제 클라이언트 키), sk_ (비밀 키 꼴), 서비스 롤 JWT → 실패
//    - test_ck_ (토스 시험 키) → 보고만. 브라우저에 나가는 anon JWT 는 원래 공개라 통과
import { test, expect } from '@playwright/test'

const PAGES = ['/', '/os/welcome', '/os?demo=1', '/charge', '/pricing']

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const part = token.split('.')[1]
        return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    } catch { return null }
}

test.describe('열쇠 흔적 검사', () => {
    // 브라우저 크기와 무관한 시험. phone 프로젝트에서는 playwright.config.ts 의 testIgnore 로 건너뛴다

    test('HTML 과 우리 자바스크립트 번들에 열쇠가 없다', async ({ request, baseURL }) => {
        test.setTimeout(120_000)
        const ours = new URL(baseURL!).host
        const scripts = new Set<string>()
        const bodies: { where: string; text: string }[] = []

        for (const p of PAGES) {
            const res = await request.get(p)
            if (res.status() !== 200) continue
            const html = await res.text()
            bodies.push({ where: p, text: html })
            for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
                const u = new URL(m[1], baseURL!)
                if (u.host === ours) scripts.add(u.pathname + u.search)
            }
        }
        test.info().annotations.push({ type: '검사 범위', description: `페이지 ${bodies.length}개 · 번들 ${scripts.size}개` })

        for (const s of scripts) {
            const res = await request.get(s)
            if (res.status() === 200) bodies.push({ where: s, text: await res.text() })
        }

        const fails: string[] = []
        const notes: string[] = []
        for (const { where, text } of bodies) {
            if (/live_ck_[A-Za-z0-9]{6,}/.test(text)) fails.push(`${where}: 토스 실결제 키(live_ck_) 노출`)
            // 앞이 글자·숫자·밑줄이 아닌 sk_ + 16자 이상 = 비밀 키 꼴 (task_ 같은 낱말은 안 걸린다)
            const sk = text.match(/(?<![A-Za-z0-9_])sk_[A-Za-z0-9_-]{16,}/)
            if (sk) fails.push(`${where}: 비밀 키 꼴(${sk[0].slice(0, 10)}…) 노출`)
            for (const m of text.matchAll(/eyJhbGciOi[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
                const payload = decodeJwtPayload(m[0])
                const role = payload?.role
                if (role === 'service_role') fails.push(`${where}: 서비스 롤 JWT 노출 (DB 전권 열쇠)`)
                else if (role !== 'anon') notes.push(`${where}: 정체 모를 JWT(role=${String(role)})`)
            }
            if (/test_ck_[A-Za-z0-9]{6,}/.test(text)) notes.push(`${where}: 토스 시험 키(test_ck_) 있음 — 아직 실결제 아님`)
        }
        for (const n of Array.from(new Set(notes))) test.info().annotations.push({ type: '참고', description: n })
        expect(fails, `열쇠 흔적:\n${fails.join('\n')}`).toEqual([])
    })
})
