// 봇 마켓 연동 규칙 — 인터넷·DB 없이 확인한다.
import { describe, it, expect } from 'vitest'
import { decideLinkKind, kstDayKey, linkNoticeText, shouldNotifyOwner } from '../team-link'
import { getOwnedTeamBotMentor } from '../team'

describe('os/team-link — 연동 규칙', () => {
    it('내가 만든 봇을 넣으면 연동이 아니다(own). 남의 공개 봇이면 연동(link). 공개 안 된 봇은 없음', () => {
        expect(decideLinkKind({ mentorOwnerUserId: 'u1', userId: 'u1', isActive: true })).toBe('own')
        expect(decideLinkKind({ mentorOwnerUserId: 'u1', userId: 'u2', isActive: true })).toBe('link')
        expect(decideLinkKind({ mentorOwnerUserId: null, userId: 'u2', isActive: true })).toBe('link')
        expect(decideLinkKind({ mentorOwnerUserId: 'u1', userId: 'u2', isActive: false })).toBe('not_found')
    })

    it('봇 주인 알림은 같은 사람 × 같은 봇 = 한국 날짜 기준 하루 1회', () => {
        // 한국 9/23 10:00 = UTC 9/23 01:00
        const now = new Date('2026-09-23T01:00:00.000Z')
        expect(shouldNotifyOwner(null, now)).toBe(true)
        expect(shouldNotifyOwner(undefined, now)).toBe(true)
        expect(shouldNotifyOwner('2026-09-23T00:30:00.000Z', now)).toBe(false)   // 같은 한국 날짜
        expect(shouldNotifyOwner('2026-09-22T15:00:00.000Z', now)).toBe(false)   // UTC 는 어제지만 한국은 9/23 00:00 → 같은 날
        expect(shouldNotifyOwner('2026-09-22T14:59:00.000Z', now)).toBe(true)    // 한국 9/22 23:59 → 어제
        expect(shouldNotifyOwner('이상한 값', now)).toBe(true)
    })

    it('한국 날짜 열쇠', () => {
        expect(kstDayKey(new Date('2026-09-22T15:00:00.000Z'))).toBe('2026-09-23')
        expect(kstDayKey(new Date('2026-09-22T14:59:59.000Z'))).toBe('2026-09-22')
    })

    it('알림 글 = 「○○님이 [봇 이름]을 팀에 넣었어요 (누적 N명)」. 이름이 비면 누군가', () => {
        expect(linkNoticeText('민수', '답장봇', 3)).toBe('민수님이 [답장봇]을 팀에 넣었어요 (누적 3명)')
        expect(linkNoticeText('  ', '답장봇', 1)).toBe('누군가님이 [답장봇]을 팀에 넣었어요 (누적 1명)')
    })
})

describe('os/team — 내 봇 무료 판정에서 연동한 마켓 봇은 빠진다', () => {
    it('getOwnedTeamBotMentor 는 linked_from_market=false 인 줄만 본다', async () => {
        const eqCalls: [string, unknown][] = []
        const chain = {
            select() { return chain },
            eq(k: string, v: unknown) { eqCalls.push([k, v]); return chain },
            async maybeSingle() { return { data: null, error: null } },
        }
        const db = { from: () => chain }
        const out = await getOwnedTeamBotMentor(db as never, 'user-1', 'mentor-1')
        expect(out).toBeNull()
        expect(eqCalls).toContainEqual(['user_id', 'user-1'])
        expect(eqCalls).toContainEqual(['mentor_id', 'mentor-1'])
        expect(eqCalls).toContainEqual(['linked_from_market', false])
    })
})
