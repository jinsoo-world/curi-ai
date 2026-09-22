// 4) 앱 설치 파일(manifest·서비스워커) 5) 손님 팀 명단 API 6) (SMOKE_CHAT=1 일 때만) 대화 API 1회
import { test, expect } from '@playwright/test'
import { DEMO_FIRST_BOT_ID } from './helpers'

test.describe('설치 파일·API', () => {
    // 브라우저 크기와 무관한 시험. phone 프로젝트에서는 playwright.config.ts 의 testIgnore 로 건너뛴다

    test('/manifest.json 200 + start_url·display 있음', async ({ request }) => {
        const res = await request.get('/manifest.json')
        expect(res.status()).toBe(200)
        const m = await res.json()
        expect(typeof m.start_url, 'start_url 없음').toBe('string')
        expect(typeof m.display, 'display 없음').toBe('string')
        expect(Array.isArray(m.icons) && m.icons.length > 0, '아이콘 없음').toBeTruthy()
    })

    test('/sw.js 200 + 자바스크립트', async ({ request }) => {
        const res = await request.get('/sw.js')
        expect(res.status()).toBe(200)
        expect(res.headers()['content-type'] || '', 'sw.js 가 자바스크립트가 아니다').toMatch(/javascript/)
        expect((await res.text()).length).toBeGreaterThan(100)
    })

    test('/api/os/team 손님 응답 = {team:[], guest:true}', async ({ request }) => {
        const res = await request.get('/api/os/team')
        expect(res.status()).toBe(200)
        const d = await res.json()
        expect(d).toEqual({ team: [], guest: true })
    })

    test('대화 API 1회 (SMOKE_CHAT=1 일 때만)', async ({ baseURL }) => {
        test.skip(process.env.SMOKE_CHAT !== '1', 'SMOKE_CHAT=1 을 주면 돈다. 손님 하루 한도(8회)를 아끼려 기본은 건너뜀')
        test.setTimeout(45_000)

        // Node fetch 로 직접 부른다: 첫 조각 도착 시각을 재야 해서(플레이라이트 request 는 다 받고 준다)
        const visitorId = `smoke-${new Date().toISOString().slice(0, 10)}` // 하루에 한 방문자로 묶인다
        const res = await fetch(`${baseURL}/api/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: '안녕하세요. 한 줄로만 인사해 주세요.' }],
                mentorId: DEMO_FIRST_BOT_ID, inputMethod: 'text', visitorId, guestMessageCount: 0,
            }),
        })
        expect(res.status, '대화 API 상태코드').toBe(200)

        const reader = res.body!.getReader()
        const dec = new TextDecoder()
        const started = Date.now()
        let text = ''
        while (!text.includes('data: ')) {
            const { value, done } = await Promise.race([
                reader.read(),
                new Promise<never>((_, rej) => setTimeout(() => rej(new Error('첫 조각이 30초 안에 안 왔다')), 30_000 - (Date.now() - started))),
            ])
            if (done) break
            text += dec.decode(value, { stream: true })
        }
        await reader.cancel().catch(() => {})
        const firstMs = Date.now() - started
        expect(text, '첫 data: 조각이 없다').toContain('data: ')

        // 손님 한도에 걸리면 모델을 안 부른 응답이라 머리글이 없다 → 판정 불가로 표시
        if (/"guestLimit":true/.test(text)) test.skip(true, '손님 하루 한도에 걸려 모델 응답을 못 봤다(내일 다시)')
        expect(res.headers.get('x-llm-driver'), 'x-llm-driver 머리글 없음').toBeTruthy()
        test.info().annotations.push({ type: '첫 조각까지', description: `${firstMs}ms · driver=${res.headers.get('x-llm-driver')}` })
    })
})
