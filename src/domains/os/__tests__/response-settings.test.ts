// 봇 「답변 설정」 — 인터넷·DB 없이 확인한다(순수 함수) + 아주 얇은 DB 목(classifyBotKind, fetchResponseSettingsRow).
import { describe, it, expect } from 'vitest'
import {
    DEFAULT_NO_ANSWER_TEXT,
    MAX_CUSTOM_INSTRUCTIONS,
    MAX_CUSTOM_LENGTH_CHARS,
    MIN_CUSTOM_LENGTH_CHARS,
    STRICT_MIN_SIMILARITY,
    applyResponseSettingsToPrompt,
    botHasKnowledge,
    classifyBotKind,
    clampCustomInstructions,
    defaultResponseSettings,
    fetchResponseSettingsRow,
    loadResponseSettingsForChat,
    mergeResponseSettings,
    resolveMaxOutputTokens,
    sanitizeResponseSettingsInput,
    shouldAnswerFromKnowledge,
    weakKnowledgePrompt,
    solarMaxOutputTokens,
} from '../response-settings'

describe('defaultResponseSettings — kind 에 따른 기본값', () => {
    it('공개 봇(트윈·리더)은 Strict, 개인 봇(내 팀)은 Adaptive. 둘 다 출처는 기본 on', () => {
        expect(defaultResponseSettings('public').creativity).toBe('strict')
        expect(defaultResponseSettings('personal').creativity).toBe('adaptive')
        expect(defaultResponseSettings('public').citationsOn).toBe(true)
        expect(defaultResponseSettings('personal').citationsOn).toBe(true)
        expect(defaultResponseSettings('public').length).toBe('intelligent')
        expect(defaultResponseSettings('public').recencyOn).toBe(false)   // 기본 꺼짐(유료 검색 비용 방지)
        expect(defaultResponseSettings('personal').recencyOn).toBe(false)
        expect(defaultResponseSettings('public').noAnswerText).toBe(DEFAULT_NO_ANSWER_TEXT)
        expect(DEFAULT_NO_ANSWER_TEXT).toContain('모르겠어요')
        expect(DEFAULT_NO_ANSWER_TEXT.length).toBeLessThanOrEqual(30)
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
        // 서식(굵게, 목록)은 공통 규칙 한 곳에서만 말한다. 여기서 「목록(-)으로 답하라」가 다시 나오면 부딪친다(0929)
        expect(out).not.toContain('목록(-)')
        expect(out).toContain('5문장')
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

describe('solarMaxOutputTokens — 솔라만 짧게 (0929)', () => {
    it('기본 900 → 500, 자세히 1800 → 1000, 짧게와 나머지는 그대로', () => {
        expect(solarMaxOutputTokens(resolveMaxOutputTokens({ length: 'intelligent', customLength: null }))).toBe(500)
        expect(solarMaxOutputTokens(resolveMaxOutputTokens({ length: 'explanatory', customLength: null }))).toBe(1000)
        expect(solarMaxOutputTokens(resolveMaxOutputTokens({ length: 'concise', customLength: null }))).toBe(220)
        expect(solarMaxOutputTokens(undefined)).toBeUndefined()
        expect(solarMaxOutputTokens(300)).toBe(300)
    })
})

describe('botHasKnowledge — 쓸 수 있는 조각이 있어야 자료 있음 (0929)', () => {
    /** knowledge_chunks 조회만 흉내 내는 얇은 가짜 DB */
    function fakeDb(result: { data?: unknown[] | null; error?: { message: string } | null; throws?: boolean }) {
        const calls: string[] = []
        const db = {
            from(table: string) {
                calls.push(table)
                const q = {
                    select() { return q },
                    eq() { return q },
                    limit() {
                        if (result.throws) throw new Error('boom')
                        return Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
                    },
                }
                return q
            },
        }
        return { db: db as unknown as Parameters<typeof botHasKnowledge>[0], calls }
    }
    it('조각이 한 개라도 있으면 true, 그리고 파일 목록이 아니라 조각을 본다', async () => {
        const { db, calls } = fakeDb({ data: [{ id: 'c1' }] })
        expect(await botHasKnowledge(db, 'm')).toBe(true)
        expect(calls).toEqual(['knowledge_chunks'])
    })
    it('파일은 있어도 처리 실패로 조각이 0개면 false (Strict 로 안 간다)', async () => {
        const { db } = fakeDb({ data: [] })
        expect(await botHasKnowledge(db, 'm')).toBe(false)
    })
    it('못 세면 false = 모델이 답하게 둔다', async () => {
        expect(await botHasKnowledge(fakeDb({ error: { message: 'x' } }).db, 'm')).toBe(false)
        expect(await botHasKnowledge(fakeDb({ throws: true }).db, 'm')).toBe(false)
    })
})

describe('자료 없는 봇의 「자료 안에서만」 (대표 승인 1005)', () => {
    type Row = { creativity?: string } | null
    // 표 이름별로 알맞은 가짜 DB 응답을 돌려준다
    function fakeDb(row: Row, chunks: number) {
        return {
            from(table: string) {
                const q: Record<string, unknown> = {}
                const self = () => q
                for (const m of ['select', 'eq', 'limit']) q[m] = self
                q.maybeSingle = async () => ({ data: table === 'bot_response_settings' ? row : null, error: null })
                q.then = (res: (v: unknown) => unknown) => res({ data: table === 'knowledge_chunks' ? Array.from({ length: chunks }, (_, i) => ({ id: i })) : [], error: null })
                return q
            },
        } as never
    }
    it('리더가 직접 「자료만」을 골랐으면 자료가 없어도 strict 그대로 (모델을 안 부르고 한 줄로 답)', async () => {
        const r = await loadResponseSettingsForChat(fakeDb({ creativity: 'strict' }, 0), 'm1', { creator_id: null }, null)
        expect(r.settings.creativity).toBe('strict')
    })
    it('리더가 만든 공개 봇은 기본값(strict)이어도 자료가 없으면 strict 그대로', async () => {
        const r = await loadResponseSettingsForChat(fakeDb(null, 0), 'm1', { creator_id: 'c1' }, null)
        expect(r.settings.creativity).toBe('strict')
    })
    it('리더 봇이 아닌 공식 봇, 시연 봇이 기본값으로 strict 이고 자료가 없으면 대화가 되게 adaptive', async () => {
        const r = await loadResponseSettingsForChat(fakeDb(null, 0), 'm1', { creator_id: null }, null)
        expect(r.settings.creativity).toBe('adaptive')
    })
    it('자료가 있으면 strict 그대로', async () => {
        const r = await loadResponseSettingsForChat(fakeDb(null, 3), 'm1', { creator_id: null }, null)
        expect(r.settings.creativity).toBe('strict')
    })
    it('자료만 설정의 프롬프트는 자료에 없는 사실을 일반 지식으로 채우지 못하게 한다', () => {
        const s = defaultResponseSettings('public')
        const out = applyResponseSettingsToPrompt('기본', { settings: s })
        expect(out).toContain('일반 지식으로 채우지도 마라')
    })
})

describe('weakKnowledgePrompt — 자료가 약해도 모델은 부르고, 사실만 지어내지 않게 (1005)', () => {
    it('Strict 가 아니면 빈 문자열', () => {
        expect(weakKnowledgePrompt({ creativity: 'adaptive', noAnswerText: '몰라요' }, [])).toBe('')
    })
    it('Strict 인데 맞는 자료가 있으면 빈 문자열', () => {
        expect(weakKnowledgePrompt({ creativity: 'strict', noAnswerText: '몰라요' }, [{ similarity: STRICT_MIN_SIMILARITY }])).toBe('')
    })
    it('Strict 인데 자료가 약하면 리더가 정한 문구와 「일상 대화는 자연스럽게」 를 함께 넣는다', () => {
        const p = weakKnowledgePrompt({ creativity: 'strict', noAnswerText: '그건 상세페이지를 봐 주세요' }, [{ similarity: 0.4 }])
        expect(p).toContain('그건 상세페이지를 봐 주세요')
        expect(p).toContain('일상')
        expect(p).toMatch(/지어내지/)
    })
})

describe('Strict 지시문 — 모든 말을 거절하지 않는다 (1005)', () => {
    it('사실은 자료 안에서만, 대화는 말투대로', () => {
        const p = applyResponseSettingsToPrompt('기본', { settings: { ...defaultResponseSettings('public') } })
        expect(p).not.toContain('짧게 한 줄로 모르겠다고만 말하라')
        expect(p).toContain('일상')
    })
})
