// 내 팀 명단(listTeam)에 남의 봇 지시문이 실려 나가지 않는다
// 마켓에서 데려온 남의 봇도 팀 명단에 들어온다. 지시문은 봇을 만든 사람에게만 보인다.
import { describe, it, expect } from 'vitest'
import { listTeam } from '../team'

const ME = 'user-me'
const MY_CREATOR = 'creator-me'

function fakeDb(creatorId: string | null) {
    const rows = [
        { id: 't1', mentor_id: 'm-mine', role: 'helper', shape: 'circle', color: 'green', one_liner: null, approval_mode: 'always_ask', pinned: false, hidden: false, sort_order: 0, created_at: '', linked_from_market: false,
          mentors: { name: '내 봇', avatar_url: null, greeting_message: '', system_prompt: '내 지시문', is_active: false, slug: 'a', creator_id: MY_CREATOR } },
        { id: 't2', mentor_id: 'm-market', role: 'helper', shape: 'circle', color: 'green', one_liner: null, approval_mode: 'always_ask', pinned: false, hidden: false, sort_order: 1, created_at: '', linked_from_market: true,
          mentors: { name: '남의 봇', avatar_url: null, greeting_message: '', system_prompt: '남의 비밀 지시문', is_active: true, slug: 'b', creator_id: 'creator-other' } },
        // 표시 칸이 생기기 전 줄(linked_from_market 비어 있음)도 남의 봇이면 가린다
        { id: 't3', mentor_id: 'm-old', role: 'helper', shape: 'circle', color: 'green', one_liner: null, approval_mode: 'always_ask', pinned: false, hidden: false, sort_order: 2, created_at: '', linked_from_market: null,
          mentors: { name: '옛 남의 봇', avatar_url: null, greeting_message: '', system_prompt: '옛 비밀 지시문', is_active: true, slug: 'c', creator_id: 'creator-other' } },
    ]
    return {
        from(table: string) {
            const q: Record<string, unknown> = {}
            const self = () => q
            Object.assign(q, { select: self, eq: self, in: self, order: self })
            if (table === 'team_bots') Object.assign(q, { then: (r: (v: unknown) => void) => r({ data: rows, error: null }) })
            if (table === 'knowledge_sources') Object.assign(q, { then: (r: (v: unknown) => void) => r({ data: [], error: null }) })
            if (table === 'creator_profiles') Object.assign(q, { maybeSingle: async () => ({ data: creatorId ? { id: creatorId } : null, error: null }) })
            return q
        },
    }
}

describe('os/team — listTeam 지시문', () => {
    it('내가 만든 봇만 지시문이 실리고, 남의 봇은 빈 글', async () => {
        const team = await listTeam(fakeDb(MY_CREATOR) as never, ME)
        expect(team.find(b => b.id === 't1')?.systemPrompt).toBe('내 지시문')
        expect(team.find(b => b.id === 't2')?.systemPrompt).toBe('')
        expect(team.find(b => b.id === 't3')?.systemPrompt).toBe('')
        expect(JSON.stringify(team)).not.toContain('비밀 지시문')
    })

    it('크리에이터 프로필이 없으면 지시문은 하나도 안 실린다', async () => {
        const team = await listTeam(fakeDb(null) as never, ME)
        expect(team.every(b => b.systemPrompt === '')).toBe(true)
    })
})
