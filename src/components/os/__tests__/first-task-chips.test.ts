import { describe, it, expect } from 'vitest'
import { tasksFor } from '../FirstTaskChips'
import { JOBS } from '@/domains/os/presets'
import type { TeamBot } from '@/domains/os/types'

const botWith = (oneLiner: string | null, role: TeamBot['role'] = 'helper') => ({ oneLiner, role } as unknown as TeamBot)

describe('첫 화면 추천 질문 3개는 그 봇이 맡은 일에 맞는다', () => {
    it('시연 팀 4명(기획, 홍보, 개발, 조사)은 각자 다른 질문을 받는다', () => {
        const ids = ['planning_lead', 'marketing_lead', 'dev_lead', 'research_lead']
        const seen = new Set<string>()
        for (const id of ids) {
            const job = JOBS.find(j => j.id === id)!
            const tasks = tasksFor(botWith(job.oneLiner))
            expect(tasks).toHaveLength(3)
            seen.add(tasks[0])
        }
        expect(seen.size).toBe(4)
    })

    it('기획팀장 첫 질문은 프리셋의 첫 일과 같은 문장', () => {
        const job = JOBS.find(j => j.id === 'planning_lead')!
        expect(job.firstTask).toContain(tasksFor(botWith(job.oneLiner))[0])
    })

    it('모르는 봇이나 공개 봇은 공통 질문', () => {
        expect(tasksFor(null)).toHaveLength(3)
        expect(tasksFor(botWith('내가 직접 쓴 성격'))).toEqual(tasksFor(null))
    })

    it('질문 글에 가운뎃점이나 긴 줄표가 없다', () => {
        for (const j of JOBS) for (const t of tasksFor(botWith(j.oneLiner))) expect(t).not.toMatch(/[·—]/)
    })
})
