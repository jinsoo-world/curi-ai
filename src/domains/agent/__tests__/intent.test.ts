import { describe, it, expect } from 'vitest'
import {
    classifyByRules, parseIntentJson, summarizeAction, buildIntentPrompt, buildDraftPrompt, INTENT_ACTIONS,
} from '../intent'

describe('classifyByRules — 밖으로 내보내는 말 알아채기', () => {
    it('받는 사람이 있는 보내 달라는 말은 확실하게 send_message', () => {
        const r = classifyByRules('김민수님에게 답장 보내줘')
        expect(r.action).toBe('send_message')
        expect(r.confident).toBe(true)
    })

    it('받는 사람이 없으면 send_message 지만 확실하지는 않다(모델에게 한 번 더)', () => {
        const r = classifyByRules('이거 보내줘')
        expect(r.action).toBe('send_message')
        expect(r.confident).toBe(false)
    })

    it('초안만 달라는 말은 카드를 만들지 않는다', () => {
        for (const 말 of ['답장 초안 써 줘', '뭐라고 보낼지 정리해 줘', '보낼 내용만 다듬어 줘']) {
            const r = classifyByRules(말)
            expect(r.action, 말).toBe('none')
            expect(r.confident, 말).toBe(true)
        }
    })

    it('보내지 말라는 말은 none', () => {
        expect(classifyByRules('아직 보내지 마').action).toBe('none')
        expect(classifyByRules('그건 말고 다른 걸로').action).toBe('none')
    })

    it('게시·구매·이체·삭제·권한·약관도 각각 잡는다', () => {
        expect(classifyByRules('블로그에 게시해').action).toBe('publish')
        expect(classifyByRules('이 강의 결제해').action).toBe('purchase')
        expect(classifyByRules('그 계좌로 이체해').action).toBe('transfer')
        expect(classifyByRules('저 파일 삭제해').action).toBe('delete')
        expect(classifyByRules('이 사람 관리자로 만들어').action).toBe('change_permission')
        expect(classifyByRules('이용약관 동의해').action).toBe('accept_terms')
    })

    it('평범한 부탁은 none 이지만 확실하지 않다(모델이 볼 여지를 남긴다)', () => {
        const r = classifyByRules('이번 주 글감 5개 뽑아줘')
        expect(r.action).toBe('none')
        expect(r.confident).toBe(false)
    })

    it('빈 말은 none 이고 확실하다', () => {
        expect(classifyByRules('').confident).toBe(true)
        expect(classifyByRules('   ').action).toBe('none')
    })
})

describe('parseIntentJson — 모델 답 읽기', () => {
    it('그냥 JSON 을 읽는다', () => {
        const r = parseIntentJson('{"action":"send_message","to":"김민수","what":"답장 보내기"}')
        expect(r).toEqual({ action: 'send_message', to: '김민수', what: '답장 보내기' })
    })

    it('코드 울타리와 군말이 붙어도 읽는다', () => {
        const r = parseIntentJson('알겠습니다.\n```json\n{"action":"publish","to":"","what":"글 게시"}\n```')
        expect(r?.action).toBe('publish')
    })

    it('목록에 없는 행동이면 버린다', () => {
        expect(parseIntentJson('{"action":"launch_rocket","to":"","what":""}')).toBeNull()
    })

    it('깨진 글·빈 글은 null', () => {
        expect(parseIntentJson('아무 말')).toBeNull()
        expect(parseIntentJson('')).toBeNull()
        expect(parseIntentJson('{깨짐')).toBeNull()
    })

    it('너무 긴 값은 잘라 담는다', () => {
        const r = parseIntentJson(JSON.stringify({ action: 'other', to: '가'.repeat(200), what: '나'.repeat(500) }))
        expect(r!.to.length).toBe(80)
        expect(r!.what.length).toBe(200)
    })

    it('행동 9종 목록에 none 이 들어 있다', () => {
        expect(INTENT_ACTIONS).toContain('none')
        expect(INTENT_ACTIONS.length).toBe(9)
    })
})

describe('summarizeAction — 카드 첫 줄', () => {
    it('받는 사람이 있으면 「○○에게 보내기」', () => {
        expect(summarizeAction('send_message', '김민수님')).toBe('김민수님에게 보내기')
    })
    it('없으면 행동만', () => {
        expect(summarizeAction('publish', '')).toBe('게시하기')
        expect(summarizeAction('transfer', null)).toBe('이체하기')
    })
})

describe('프롬프트 조립', () => {
    it('물어보는 말에 사용자의 말이 들어가고 JSON 만 내라고 못 박는다', () => {
        const p = buildIntentPrompt('민수에게 보내줘')
        expect(p).toContain('민수에게 보내줘')
        expect(p).toContain('JSON')
    })
    it('초안 쓰는 말은 「실제로 하지 않는다」를 못 박는다', () => {
        const p = buildDraftPrompt('민수에게 보내줘', 'send_message')
        expect(p).toContain('실제로 하지 않는다')
        expect(p).toContain('민수에게 보내줘')
    })
    it('아주 긴 말은 잘라 넣는다', () => {
        const p = buildIntentPrompt('가'.repeat(5000))
        expect(p.length).toBeLessThan(2000)
    })
})
