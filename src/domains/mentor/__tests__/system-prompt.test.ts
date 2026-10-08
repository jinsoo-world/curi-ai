// 봇 지시문(mentors.system_prompt) 한도 = 30,000자 (대표 확정 1007). 넘으면 자르지 않고 막으면서 알린다
import { describe, it, expect } from 'vitest'
import { SYSTEM_PROMPT_MAX, SYSTEM_PROMPT_TOO_LONG, systemPromptTooLong, SystemPromptTooLong } from '../system-prompt'

describe('지시문 한도', () => {
    it('한도는 30,000자, 문구는 「지시문은 30,000자까지 쓸 수 있어요」', () => {
        expect(SYSTEM_PROMPT_MAX).toBe(30_000)
        expect(SYSTEM_PROMPT_TOO_LONG).toBe('지시문은 30,000자까지 쓸 수 있어요')
        expect(new SystemPromptTooLong().message).toBe(SYSTEM_PROMPT_TOO_LONG)
    })
    it('30,000자는 통과, 30,001자는 걸린다', () => {
        expect(systemPromptTooLong('가'.repeat(30_000))).toBe(false)
        expect(systemPromptTooLong('가'.repeat(30_001))).toBe(true)
    })
    it('그림 글자는 1자로 센다(DB char_length 와 같은 셈)', () => {
        expect(systemPromptTooLong('😀'.repeat(30_000))).toBe(false)
    })
    it('글이 아니면 검사하지 않는다(부르는 쪽이 따로 거른다)', () => {
        expect(systemPromptTooLong(undefined)).toBe(false)
        expect(systemPromptTooLong(null)).toBe(false)
    })
})
