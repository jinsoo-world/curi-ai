import { describe, it, expect } from 'vitest'
import { ANSWER_HONESTY_RULES } from '../answer-rules'

describe('가격 일정 충돌 기본값 (대표 승인 0929 01:03)', () => {
    it('값이 서로 다르면 확인 중이라고 답하라는 규칙이 공통 규칙에 있다', () => {
        expect(ANSWER_HONESTY_RULES).toContain('서로 다르게 적혀 있으면')
        expect(ANSWER_HONESTY_RULES).toContain('확인 중')
    })
})
