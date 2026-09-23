import { describe, it, expect } from 'vitest'
import {
    FONT_KEY, SIGNUP_CLOVERS,
    applyFontSize, cleanFontSize, cloverBarView, readFontSize, readLocalIntent, saveFontSize, toggleChip,
} from '../settings'

/** 저장이 되는 가짜 브라우저 창고 */
function 창고(초기: Record<string, string> = {}) {
    const 속 = { ...초기 }
    return {
        속,
        getItem: (k: string) => (k in 속 ? 속[k] : null),
        setItem: (k: string, v: string) => { 속[k] = v },
    }
}

/** 저장이 막힌 창고 (사파리 비공개 창) */
const 막힌창고 = {
    getItem: () => { throw new Error('막힘') },
    setItem: () => { throw new Error('막힘') },
}

describe('글자 크기', () => {
    it('우리가 아는 값만 통과시킨다', () => {
        expect(cleanFontSize('large')).toBe('large')
        expect(cleanFontSize('small')).toBe('small')
        expect(cleanFontSize('거대하게')).toBe('normal')
        expect(cleanFontSize(null)).toBe('normal')
        expect(cleanFontSize(undefined, 'large')).toBe('large')
    })

    it('저장하고 다시 읽으면 같은 값이 나온다', () => {
        const s = 창고()
        expect(saveFontSize('large', s)).toBe('large')
        expect(s.속[FONT_KEY]).toBe('large')
        expect(readFontSize(s)).toBe('large')
    })

    it('저장이 막혀 있어도 죽지 않고 보통으로 산다', () => {
        expect(() => saveFontSize('large', 막힌창고)).not.toThrow()
        expect(saveFontSize('large', 막힌창고)).toBe('large')
        expect(readFontSize(막힌창고)).toBe('normal')
        expect(readFontSize(null)).toBe('normal')
    })

    it('문서 뿌리에 붙일 때 보통은 아예 안 붙인다', () => {
        const root = { dataset: {} as Record<string, string | undefined> }
        applyFontSize(root, 'large')
        expect(root.dataset.font).toBe('large')
        applyFontSize(root, 'small')
        expect(root.dataset.font).toBe('small')
        applyFontSize(root, 'normal')
        expect(root.dataset.font).toBeUndefined()
        expect(() => applyFontSize(null, 'large')).not.toThrow()
    })
})

describe('클로버 잔량 띠', () => {
    it('손님에게는 선물 안내를 보인다', () => {
        const v = cloverBarView(null, true, '/os/chat/1')
        expect(v?.text).toContain(String(SIGNUP_CLOVERS))
        expect(v?.href).toBe('/login?next=/os')
        expect(v?.warn).toBe(false)
    })

    it('잔량을 아직 못 읽었으면 띠를 안 그린다', () => {
        expect(cloverBarView(null, false, '/os')).toBeNull()
        expect(cloverBarView(undefined, false, '/os')).toBeNull()
        expect(cloverBarView(Number.NaN, false, '/os')).toBeNull()
    })

    it('20개 이하면 경고색, 21개부터는 보통', () => {
        expect(cloverBarView(21, false, '/os')?.warn).toBe(false)
        expect(cloverBarView(20, false, '/os')?.warn).toBe(true)
        expect(cloverBarView(0, false, '/os')?.warn).toBe(true)
    })

    it('충전 주소에 지금 있는 자리를 안전하게 싣는다', () => {
        const v = cloverBarView(100, false, '/os/chat/abc')
        expect(v?.text).toBe('클로버 100개 남음')
        expect(v?.href).toBe('/os/charge?from=%2Fos%2Fchat%2Fabc')
        // 원화 환산은 절대 넣지 않는다 (대표 확정 0915)
        expect(v?.text).not.toContain('원')
    })
})

describe('여러 개 고르는 칩', () => {
    it('누르면 들어가고 다시 누르면 빠진다', () => {
        expect(toggleChip([], '강의')).toEqual(['강의'])
        expect(toggleChip(['강의', '글'], '강의')).toEqual(['글'])
    })

    it('최대치를 넘기면 그대로 둔다 (앞의 것을 조용히 밀어내지 않는다)', () => {
        const 꽉 = ['1', '2', '3']
        expect(toggleChip(꽉, '4', 3)).toEqual(['1', '2', '3'])
        expect(toggleChip(꽉, '2', 3)).toEqual(['1', '3'])
    })
})

describe('서버에 묻기 전에 알아채는 규칙', () => {
    it('주소 + 넣어 달라는 말이면 자료로 넣는다', () => {
        expect(readLocalIntent('https://curious-500.com/글 이거 자료로 넣어줘')).toEqual({ kind: 'knowledge', url: 'https://curious-500.com/글' })
        expect(readLocalIntent('이 링크 저장해 http://example.com/a?b=1')).toEqual({ kind: 'knowledge', url: 'http://example.com/a?b=1' })
    })

    it('문장 끝 마침표·닫는 괄호는 주소에서 뗀다', () => {
        expect(readLocalIntent('https://example.com/글. 기억해 줘')).toEqual({ kind: 'knowledge', url: 'https://example.com/글' })
    })

    it('「읽어와·요약해」는 자료로 넣지 않는다 — 바로 읽기는 /api/chat 이 한다', () => {
        expect(readLocalIntent('https://curious-500.com/글 이거 읽어줘')).toBeNull()
        expect(readLocalIntent('https://example.com 읽고 요약해 줘')).toBeNull()
        // 읽어서 넣어 달라고 하면 넣기가 이긴다
        expect(readLocalIntent('https://example.com 읽고 자료에 넣어줘')).toEqual({ kind: 'knowledge', url: 'https://example.com' })
    })

    it('주소만 있고 넣어 달라는 말이 없으면 평소대로 봇에게 물어본다', () => {
        expect(readLocalIntent('https://example.com 이거 어떻게 생각해?')).toBeNull()
        expect(readLocalIntent('오늘 뭐 하지')).toBeNull()
        expect(readLocalIntent('')).toBeNull()
    })

    it('그룹 이야기면 만드는 곳을 안내한다', () => {
        expect(readLocalIntent('봇 여러 봇이랑 같이 이야기하고 싶어')).toEqual({ kind: 'group' })
        expect(readLocalIntent('단톡방 만들 수 있어?')).toEqual({ kind: 'group' })
        // 주소를 넣어 달라는 말이 먼저다 (가로채지 않는다)
        expect(readLocalIntent('https://example.com 그룹 자료로 추가해')).toEqual({ kind: 'knowledge', url: 'https://example.com' })
    })
})
