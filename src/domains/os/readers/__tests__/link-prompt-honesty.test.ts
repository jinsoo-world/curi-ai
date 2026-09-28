import { describe, it, expect } from 'vitest'
import { buildLinkPrompt } from '../prompt'
import { ANSWER_HONESTY_RULES } from '@/domains/mentor/answer-rules'

describe('링크 읽기 능력을 잘못 말하지 않기', () => {
    it('읽은 링크 프롬프트에 「못 읽는다고 말하지 말기」와 읽은 범위 안내가 들어간다', () => {
        const r = buildLinkPrompt([{ ok: true, url: 'https://blog.naver.com/a', requestedUrl: 'https://blog.naver.com/a', title: '블로그', text: '글 목록' } as never])
        expect(r.prefix).toContain('기술적 한계')
        expect(r.prefix).toContain('실제로 읽은 범위')
        expect(r.prefix).toContain('붙여 달라는 부탁도 하지 마세요')
    })
    it('공통 규칙에 링크를 직접 읽을 수 있다고 적혀 있다', () => {
        expect(ANSWER_HONESTY_RULES).toContain('직접 열어 읽을 수 있습니다')
    })
})
