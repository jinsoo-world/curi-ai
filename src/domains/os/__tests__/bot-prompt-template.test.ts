import { describe, it, expect } from 'vitest'
import { buildBotPrompt, buildGreeting, JOBS, DEFAULT_TEAM } from '../presets'
import type { NewBotInput } from '../types'
import canonical from './fixtures/default-bots-1001.json'

// 8칸 틀 v1(2026-10-01): 새 봇 지시문이 틀을 지키는지, 기본 봇 4명 글이 운영 DB 교체본과 같은지 본다

const HEADERS = ['[성격]', '[말투]', '[맡은 일]', '[대화 흐름]', '[답 모양]', '[생동감]']
const mk = (job: string, name: string, extra: Partial<NewBotInput> = {}): NewBotInput =>
    ({ job, autonomy: 'always_ask', name, shape: 'circle', color: 'green', ...extra })

describe('os/presets — 봇 지시문 8칸 틀', () => {
    it('모든 일(JOBS)이 6개 칸 머리글과 이름이 든 첫 줄을 만든다', () => {
        for (const j of JOBS) {
            const p = buildBotPrompt(mk(j.id, '하늘봇', { customJob: '뉴스레터 쓰기' }))
            for (const h of HEADERS) expect(p, `${j.id} ${h}`).toContain(h)
            expect(p.startsWith('저는 이 팀의 하늘봇이에요. '), j.id).toBe(true)
        }
    })

    it('길이는 450~1000자', () => {
        for (const j of JOBS) {
            for (const autonomy of ['always_ask', 'draft_only'] as const) {
                const len = buildBotPrompt(mk(j.id, '봇', { autonomy, customJob: '뉴스레터 쓰기' }), '진수').length
                expect(len, `${j.id} ${autonomy}`).toBeGreaterThanOrEqual(450)
                expect(len, `${j.id} ${autonomy}`).toBeLessThanOrEqual(1000)
            }
        }
    })

    it('「당신의 AI 팀원」, 「선생님님」은 어떤 경우에도 나오지 않는다', () => {
        for (const j of JOBS) {
            for (const owner of [undefined, '', '  ', '선생님', '진수', '진수님']) {
                const p = buildBotPrompt(mk(j.id, '봇', { customJob: '일' }), owner)
                expect(p).not.toContain('당신의 AI 팀원')
                expect(p).not.toContain('당신은 「')
                expect(p).not.toContain('선생님님')
                expect(p).not.toContain('님님')
            }
        }
    })

    it('만든 사람 이름이 진짜일 때만 「○○님 팀」으로 연다', () => {
        expect(buildBotPrompt(mk('planning_lead', '기획팀장'), '진수')).toMatch(/^저는 진수님 팀의 기획팀장이에요\. /)
        expect(buildBotPrompt(mk('planning_lead', '기획팀장'), '진수님')).toMatch(/^저는 진수님 팀의 기획팀장이에요\. /)
        expect(buildBotPrompt(mk('planning_lead', '기획팀장'))).toMatch(/^저는 이 팀의 기획팀장이에요\. /)
        expect(buildBotPrompt(mk('planning_lead', '기획팀장'), '선생님')).toMatch(/^저는 이 팀의 기획팀장이에요\. /)
    })

    it('사용자가 고른 이름을 쓰고(칩 이름 아님) 받침에 따라 이에요/예요가 맞다', () => {
        expect(buildBotPrompt(mk('fan_reply', '하나'))).toMatch(/^저는 이 팀의 하나예요\. /)
        expect(buildBotPrompt(mk('fan_reply', '답장봇'))).toMatch(/^저는 이 팀의 답장봇이에요\. /)
        expect(buildGreeting(mk('fan_reply', '하나'))).toMatch(/^안녕하세요, 하나예요\. /)
        expect(buildGreeting(mk('fan_reply', ' 답장봇 '))).toMatch(/^안녕하세요, 답장봇이에요\. /)
    })

    it('기본 봇 4명은 운영 DB 교체본(1001)과 같은 글이다(승인 칸만 뒤에 더해진다)', () => {
        const byName = Object.fromEntries(Object.values(canonical).map(v => [v.name, v]))
        for (const d of DEFAULT_TEAM) {
            const want = byName[d.name]
            const p = buildBotPrompt(mk(d.job, d.name))
            expect(p.startsWith(want.prompt + '\n\n[승인]\n'), d.name).toBe(true)
            expect(buildGreeting(mk(d.job, d.name)), d.name).toBe(want.greeting)
        }
    })

    it('승인선은 봇마다 유지된다(물어보기 / 초안만)', () => {
        const ask = buildBotPrompt(mk('dev_lead', '개발팀장'))
        expect(ask).toContain('이대로 보낼까요?')
        expect(ask).toContain('직접 하지 않는다')
        const draft = buildBotPrompt(mk('dev_lead', '개발팀장', { autonomy: 'draft_only' }))
        expect(draft).toContain('초안만 만든다')
        expect(draft).not.toContain('이대로 보낼까요?')
    })

    it('공통 규칙과 겹치는 문장(지어내지 않기, 결론 먼저)을 되풀이하지 않는다', () => {
        for (const j of JOBS) {
            const p = buildBotPrompt(mk(j.id, '봇', { customJob: '일' }))
            expect(p).not.toContain('지어내지')
            expect(p).not.toContain('결론 먼저')
        }
    })

    it('첫인사는 이름으로 열고 「라고 해 보세요」로 끝나지 않는다', () => {
        for (const j of JOBS) {
            const g = buildGreeting(mk(j.id, '봇'))
            expect(g.startsWith('안녕하세요, 봇이에요. ')).toBe(true)
            expect(g).not.toMatch(/라고 해 보세요\.?$/)
            expect(g).not.toContain('해 보세요')
        }
    })

    it('직접 쓰기는 사용자가 쓴 한 줄이 맡은 일이 된다', () => {
        const p = buildBotPrompt(mk('custom', '뉴스봇', { customJob: '  매주 뉴스레터 초안 쓰기 ' }))
        expect(p).toContain('[맡은 일]\n매주 뉴스레터 초안 쓰기.')
    })
})
