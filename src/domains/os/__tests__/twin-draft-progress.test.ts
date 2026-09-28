import { describe, it, expect, vi } from 'vitest'
import { composeGreeting, draftSourceChips, draftSourceKind, draftStepAt, learnedLine } from '../twin-draft-shared'
import { countDraftSources } from '../twin-draft'
import { recordDraftEvent } from '../bot-events'

describe('초안 단계 문구', () => {
    it('시간에 따라 바뀌고 숫자가 없다', () => {
        expect(draftStepAt(0)).toBe('링크를 여는 중이에요')
        expect(draftStepAt(5_000)).toBe('글과 영상을 읽는 중이에요')
        expect(draftStepAt(25_000)).toBe('말투를 배우는 중이에요')
        expect(draftStepAt(60_000)).toBe('소개를 쓰는 중이에요')
        for (const ms of [0, 5e3, 25e3, 60e3]) expect(draftStepAt(ms)).not.toMatch(/\d/)
    })
})

describe('읽은 자료 표시', () => {
    it('주소로 종류를 가린다', () => {
        expect(draftSourceKind('https://blog.naver.com/abc/1')).toBe('blog')
        expect(draftSourceKind('https://youtu.be/x')).toBe('youtube')
        expect(draftSourceKind('https://www.instagram.com/me')).toBe('instagram')
        expect(draftSourceKind('')).toBe('paste')
        expect(draftSourceKind('https://example.com/a')).toBe('web')
    })
    it('종류별 개수를 세고 작은 표시로 만든다', () => {
        const c = countDraftSources([
            { url: 'https://blog.naver.com/a/1' }, { url: 'https://blog.naver.com/a/2' }, { url: 'https://abc.tistory.com/3' },
            { url: 'https://youtube.com/watch?v=1' }, { url: 'https://instagram.com/me', count: 5 },
        ])
        expect(draftSourceChips(c)).toEqual(['블로그 글 3개', '유튜브 영상 1개', '인스타 글 5개'])
    })
})

describe('첫 인사', () => {
    it('배운 곳을 한 줄로 말한다', () => {
        expect(learnedLine('김영희', ['youtube', 'blog'])).toBe('김영희님 블로그와 영상에서 말투와 주로 다루는 주제를 배웠어요. 무엇이든 물어보세요.')
        expect(learnedLine('김영희', [])).toBe('')
    })
    it('주인 인사말 앞에 붙이고 200자를 넘지 않는다', () => {
        const g = composeGreeting('배웠어요.', '안녕하세요')
        expect(g).toBe('배웠어요.\n안녕하세요')
        expect(composeGreeting('배웠어요.', 'x'.repeat(300)).length).toBe(200)
        expect(composeGreeting('', '안녕')).toBe('안녕')
    })
})

describe('초안 기록', () => {
    it('app_events 에 넣고, 실패해도 던지지 않는다', async () => {
        const insert = vi.fn().mockResolvedValue({ error: null })
        const db = { from: vi.fn(() => ({ insert })) } as never
        await recordDraftEvent(db, { name: 'draft_succeeded', userId: 'u1', extra: { ms: 10 } })
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'draft_succeeded', user_id: 'u1', extra: { ms: 10 } }))
        const bad = { from: () => { throw new Error('x') } } as never
        await expect(recordDraftEvent(bad, { name: 'draft_failed', userId: 'u1', extra: {} })).resolves.toBeUndefined()
    })
})
