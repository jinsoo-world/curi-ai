import { describe, expect, it } from 'vitest'
import { badgeClass, buttonClass, cardClass } from '../classes'
import { cn } from '../cn'

describe('큐리어스 디자인 부품 클래스', () => {
    it('기본 단추는 큐리어스 초록 채움 + 8px 둥글기 + 44px 이상', () => {
        const c = buttonClass()
        expect(c).toContain('bg-primary-500')
        expect(c).toContain('hover:bg-primary-600')
        expect(c).toContain('rounded-lg')
        expect(c).toContain('min-h-11')
    })
    it('회색 테두리 단추는 초록을 쓰지 않는다 (화면당 초록 주요 단추 1개)', () => {
        expect(buttonClass('grayOutline')).not.toMatch(/primary/)
    })
    it('배지는 4px 둥글기와 작은 글씨', () => {
        expect(badgeClass('primary')).toContain('rounded ')
        expect(badgeClass('primary')).toContain('text-caption-1')
    })
    it('카드는 그림자 없이 테두리 + 16px', () => {
        const c = cardClass()
        expect(c).toContain('rounded-2xl')
        expect(c).toContain('border-neutral-200')
        expect(c).not.toMatch(/shadow/)
        expect(cardClass({ selected: true })).toContain('border-primary-500')
    })
    it('cn 은 빈 값을 버린다', () => {
        expect(cn('a', false, null, undefined, 'b')).toBe('a b')
    })
})
