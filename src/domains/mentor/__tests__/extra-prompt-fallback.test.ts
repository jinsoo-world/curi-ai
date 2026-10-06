// 대화용 비밀 칸 읽기 — extra_prompt 칸이 아직 없는 DB 에서도 지시문은 읽힌다
// (마이그레이션 20261022 보다 코드가 먼저 나가도 1:1 대화가 지시문 없이 나가지 않게)
import { describe, it, expect, vi, beforeEach } from 'vitest'

const BOT = '9fc9b3fa-1721-40c6-bc4e-1b544c117483'
const selects: string[] = []
let hasExtraColumn = true

vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
        from() {
            let sel = ''
            const q: Record<string, unknown> = {}
            Object.assign(q, {
                select: (s: string) => { sel = s; selects.push(s); return q },
                eq: () => q,
                maybeSingle: async () => {
                    if (sel.includes('extra_prompt') && !hasExtraColumn) return { data: null, error: { code: '42703', message: 'column mentors.extra_prompt does not exist' } }
                    const row: Record<string, unknown> = { system_prompt: '지시문', persona_template: null, style_template: null, personality_traits: null }
                    if (sel.includes('extra_prompt')) row.extra_prompt = '추가 자료'
                    return { data: row, error: null }
                },
            })
            return q
        },
    }),
}))

import { getMentorById } from '../queries'

function sessionDb() {
    const q: Record<string, unknown> = {}
    Object.assign(q, { select: () => q, eq: () => q, single: async () => ({ data: { id: BOT, name: '봇' }, error: null }) })
    return { from: () => q }
}

beforeEach(() => { selects.length = 0; hasExtraColumn = true })

describe('getMentorById — extra_prompt 칸', () => {
    it('칸이 있으면 extra_prompt 까지 한 번에 읽는다', async () => {
        const m = await getMentorById(sessionDb() as never, BOT)
        expect(m.extra_prompt).toBe('추가 자료')
        expect(m.system_prompt).toBe('지시문')
        expect(selects).toHaveLength(1)
    })
    it('칸이 없으면(적용 전) 옛 비밀 칸 목록으로 다시 읽어 지시문은 붙는다', async () => {
        hasExtraColumn = false
        const m = await getMentorById(sessionDb() as never, BOT)
        expect(m.system_prompt).toBe('지시문')
        expect(m.extra_prompt).toBeUndefined()
        expect(selects).toHaveLength(2)
        expect(selects[1]).not.toContain('extra_prompt')
    })
})
