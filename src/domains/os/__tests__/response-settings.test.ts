// 봇 「답변 설정」 — 인터넷·DB 없이 확인한다(순수 함수) + 아주 얇은 DB 목(classifyBotKind, fetchResponseSettingsRow).
import { describe, it, expect } from 'vitest'
import {
    DEFAULT_NO_ANSWER_TEXT,
    MAX_CUSTOM_INSTRUCTIONS,
    MAX_CUSTOM_LENGTH_CHARS,
    MIN_CUSTOM_LENGTH_CHARS,
    STRICT_MIN_SIMILARITY,
    applyResponseSettingsToPrompt,
    classifyBotKind,
    clampCustomInstructions,
    defaultResponseSettings,
    fetchResponseSettingsRow,
    mergeResponseSettings,
    resolveMaxOutputTokens,
    sanitizeResponseSettingsInput,
    shouldAnswerFromKnowledge,
} from '../response-settings'

describe('defaultResponseSettings — kind 에 따른 기본값', () => {
    it('공개 봇(트윈·리더)은 Strict, 개인 봇(내 팀)은 Adaptive. 둘 다 출처는 기본 on', () => {
        expect(defaultResponseSettings('public').creativity).toBe('strict')
        expect(defaultResponseSettings('personal').creativity).toBe('adaptive')
        expect(defaultResponseSettings('public').citationsOn).toBe(true)
        expect(defaultResponseSettings('personal').citationsOn).toBe(true)
        expect(defaultResponseSettings('public').length).toBe('intelligent')
        expect(defaultResponseSettings('public').recencyOn).toBe(true)
        expect(defaultResponseSettings('public').noAnswerText).toBe(DEFAULT_NO_ANSWER_TEXT)
    })
})

describe('clampCustomInstructions — 최대 3개, 항목당 300자, 빈 줄 제거', () => {
    it('배열이 아니면 빈 배열', () => {
        expect(clampCustomInstructions(undefined)).toEqual([])
        expect(clampCustomInstructions('글')).toEqual([])
    })
    it('4개 넣으면 3개만 남는다', () => {
        expect(clampCustomInstructions(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c'])
        expect(clampCustomInstructions(['a', 'b', 'c', 'd']).length).toBe(MAX_CUSTOM_INSTRUCTIONS)
    })
    it('빈 줄·공백만 있는 줄은 뺀다', () => {
        expect(clampCustomInstructions(['첫째', '  ', '', '넷째'])).toEqual(['첫째', '넷째'])
    })
    it('300자 넘으면 자른다', () => {
        const long = '가'.repeat(400)
        expect(clampCustomInstructions([long])[0].length).toBe(300)
    })
})

describe('mergeResponseSettings — DB 행 + kind → 실제 값', () => {
    it('행이 없으면 kind 기본값 그대로', () => {
        expect(mergeResponseSettings(null, 'public')).toEqual(defaultResponseSettings('public'))
        expect(mergeResponseSettings(undefined, 'personal')).toEqual(defaultResponseSettings('personal'))
    })
    it('행에 있는 값만 덮어쓰고, 없는 칸은 기본값', () => {
        const merged = mergeResponseSettings({ purpose: '팬 질문에 답한다', length: 'concise' }, 'public')
        expect(merged.purpose).toBe('팬 질문에 답한다')
        expect(merged.length).toBe('concise')
        expect(merged.creativity).toBe('strict')   // public 기본값 유지
        expect(merged.style).toBeNull()
    })
    it('모르는 length·creativity 값이 들어오면(예: 마이그레이션 전 낡은 값) 기본값으로 되돌아간다', () => {
        const merged = mergeResponseSettings({ length: '엉망', creativity: '모름' } as never, 'personal')
        expect(merged.length).toBe('intelligent')
        expect(merged.creativity).toBe('adaptive')
    })
})

describe('sanitizeResponseSettingsInput — 화면 입력 다듬기', () => {
    it('길이 4개 항목당 300자로 자르고, 4개 이상은 3개까지만', () => {
        const out = sanitizeResponseSettingsInput({ customInstructions: ['1', '2', '3', '4'] }, 'personal')
        expect(out.customInstructions).toEqual(['1', '2', '3'])
    })
    it('length=custom 인데 customLength 를 안 주면 800으로 기본, 범위(50~4000) 밖이면 자른다', () => {
        expect(sanitizeResponseSettingsInput({ length: 'custom' }, 'public').customLength).toBe(800)
        expect(sanitizeResponseSettingsInput({ length: 'custom', customLength: 10 }, 'public').customLength).toBe(MIN_CUSTOM_LENGTH_CHARS)
        expect(sanitizeResponseSettingsInput({ length: 'custom', customLength: 999999 }, 'public').customLength).toBe(MAX_CUSTOM_LENGTH_CHARS)
    })
    it('length 가 custom 이 아니면 customLength 는 항상 null', () => {
        expect(sanitizeResponseSettingsInput({ length: 'concise', customLength: 500 }, 'public').customLength).toBeNull()
    })
    it('모르는 creativity 값은 kind 기본값으로', () => {
        expect(sanitizeResponseSettingsInput({ creativity: '이상함' }, 'public').creativity).toBe('strict')
        expect(sanitizeResponseSettingsInput({ creativity: 'creative' }, 'public').creativity).toBe('creative')
    })
})

describe('resolveMaxOutputTokens — Length → 토큰 상한', () => {
    it('네 가지 길이가 서로 다른 상한을 낸다', () => {
        expect(resolveMaxOutputTokens({ length: 'concise', customLength: null })).toBeLessThan(
            resolveMaxOutputTokens({ length: 'intelligent', customLength: null }),
        )
        expect(resolveMaxOutputTokens({ length: 'intelligent', customLength: null })).toBeLessThan(
            resolveMaxOutputTokens({ length: 'explanatory', customLength: null }),
        )
    })
    it('custom 은 글자수를 토큰으로 환산하고, 64~4096 사이로 묶는다', () => {
        expect(resolveMaxOutputTokens({ length: 'custom', customLength: 50 })).toBeGreaterThanOrEqual(64)
        expect(resolveMaxOutputTokens({ length: 'custom', customLength: 4000 })).toBeLessThanOrEqual(4096)
        // 글자수가 늘면 토큰도 는다
        expect(resolveMaxOutputTokens({ length: 'custom', customLength: 200 })).toBeLessThan(
            resolveMaxOutputTokens({ length: 'custom', customLength: 2000 }),
        )
    })
})

describe('applyResponseSettingsToPrompt — 프롬프트에 얹기', () => {
    it('아무것도 안 채웠으면(전부 기본값) 그래도 길이·창의성 지시문은 붙는다', () => {
        const out = applyResponseSettingsToPrompt('원본', { settings: defaultResponseSettings('personal') })
        expect(out).toContain('원본')
        expect(out).toContain('[⚙️ 답변 설정]')
    })
    it('목적·추가 지침·말투·안내문을 다 채우면 전부 들어간다', () => {
        const settings = {
            ...defaultResponseSettings('public'),
            purpose: '팬 질문 답변',
            customInstructions: ['짧게 답해', '이모지 쓰지 마'],
            style: '존댓말, 따뜻하게',
            disclaimer: 'AI가 만든 답이라 틀릴 수 있어요',
        }
        const out = applyResponseSettingsToPrompt('원본', { settings })
        expect(out).toContain('팬 질문 답변')
        expect(out).toContain('1. 짧게 답해')
        expect(out).toContain('2. 이모지 쓰지 마')
        expect(out).toContain('존댓말, 따뜻하게')
        expect(out).toContain('AI가 만든 답이라 틀릴 수 있어요')
    })
})

describe('shouldAnswerFromKnowledge — Strict 판정', () => {
    it('Strict 가 아니면 자료가 없어도 항상 true', () => {
        expect(shouldAnswerFromKnowledge({ creativity: 'adaptive' }, [])).toBe(true)
        expect(shouldAnswerFromKnowledge({ creativity: 'creative' }, null)).toBe(true)
    })
    it('Strict 인데 자료가 없으면 false', () => {
        expect(shouldAnswerFromKnowledge({ creativity: 'strict' }, [])).toBe(false)
        expect(shouldAnswerFromKnowledge({ creativity: 'strict' }, null)).toBe(false)
    })
    it('Strict 인데 전부 문턱 미만이면 false, 하나라도 문턱 이상이면 true', () => {
        expect(shouldAnswerFromKnowledge({ creativity: 'strict' }, [{ similarity: 0.5 }, { similarity: 0.6 }])).toBe(false)
        expect(shouldAnswerFromKnowledge({ creativity: 'strict' }, [{ similarity: 0.5 }, { similarity: STRICT_MIN_SIMILARITY }])).toBe(true)
    })
})

describe('classifyBotKind — 트윈·리더 봇(공개) vs 내 팀 봇(개인)', () => {
    it('creator_id 가 있으면(크리에이터·리더가 만든 봇) 무조건 public', async () => {
        const db = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }
        const kind = await classifyBotKind(db as never, 'm1', { creator_id: 'creator-1' }, 'user-1')
        expect(kind).toBe('public')
    })
    it('team_bots.role 이 twin 이면 public, chief·helper 면 personal', async () => {
        function dbWithRole(role: string | null) {
            return {
                from: () => ({
                    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role ? { role } : null }) }) }) }),
                }),
            }
        }
        expect(await classifyBotKind(dbWithRole('twin') as never, 'm1', null, 'user-1')).toBe('public')
        expect(await classifyBotKind(dbWithRole('chief') as never, 'm1', null, 'user-1')).toBe('personal')
        expect(await classifyBotKind(dbWithRole('helper') as never, 'm1', null, 'user-1')).toBe('personal')
    })
    it('team_bots 에 줄이 없고(로그인 안 했거나 내 봇이 아님) creator_id 도 없으면 신중하게 public', async () => {
        const db = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }
        expect(await classifyBotKind(db as never, 'm1', null, null)).toBe('public')
        expect(await classifyBotKind(db as never, 'm1', null, 'user-1')).toBe('public')
    })
})

describe('fetchResponseSettingsRow — 표가 없으면(42P01) null, 그 외 오류는 던진다', () => {
    it('42P01 이면 null (기본값으로 동작)', async () => {
        const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: '42P01', message: 'no table' } }) }) }) }) }
        expect(await fetchResponseSettingsRow(db as never, 'm1')).toBeNull()
    })
    it('다른 오류면 던진다', async () => {
        const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: '500', message: '서버 오류' } }) }) }) }) }
        await expect(fetchResponseSettingsRow(db as never, 'm1')).rejects.toThrow('서버 오류')
    })
    it('줄이 있으면 그대로 돌려준다', async () => {
        const row = { mentor_id: 'm1', purpose: '테스트' }
        const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }
        expect(await fetchResponseSettingsRow(db as never, 'm1')).toEqual(row)
    })
})
