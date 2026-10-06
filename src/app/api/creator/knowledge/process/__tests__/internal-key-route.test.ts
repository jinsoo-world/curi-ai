// 서버 안 예약 작업(드라이브·노션 가져오기)이 로그인 쿠키 없이 학습 창구를 부를 때의 주인 확인 갈래
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { requireMentorOwner, mentorOwnerForUser } = vi.hoisted(() => ({ requireMentorOwner: vi.fn(), mentorOwnerForUser: vi.fn() }))
vi.mock('@/lib/mentor-owner', () => ({ requireMentorOwner, mentorOwnerForUser }))

import { POST } from '../route'

function req(headers: Record<string, string>, body: unknown) {
    return new Request('https://x.test/api/creator/knowledge/process', { method: 'POST', headers, body: JSON.stringify(body) }) as never
}

beforeEach(() => {
    process.env.CRON_SECRET = 'cron-k'
    requireMentorOwner.mockReset().mockResolvedValue({ ok: false, error: '로그인이 필요합니다.', status: 401 })
    mentorOwnerForUser.mockReset().mockResolvedValue({ ok: false, error: '권한이 없습니다.', status: 403 })
})

describe('학습 창구 주인 확인', () => {
    it('내부 열쇠가 맞으면 actorUserId 로 같은 주인 확인을 한다(쿠키 확인을 건너뜀)', async () => {
        const res = await POST(req({ 'x-internal-key': 'cron-k' }, { sourceId: 's', mentorId: 'm', actorUserId: 'u' }))
        expect(mentorOwnerForUser).toHaveBeenCalledWith('u', 'm')
        expect(requireMentorOwner).not.toHaveBeenCalled()
        expect(res.status).toBe(403)
    })
    it('내부 열쇠가 틀리면 예전처럼 로그인 확인', async () => {
        const res = await POST(req({ 'x-internal-key': 'wrong' }, { sourceId: 's', mentorId: 'm', actorUserId: 'u' }))
        expect(requireMentorOwner).toHaveBeenCalledWith('m')
        expect(mentorOwnerForUser).not.toHaveBeenCalled()
        expect(res.status).toBe(401)
    })
    it('머리글이 없으면 로그인 확인', async () => {
        await POST(req({}, { sourceId: 's', mentorId: 'm', actorUserId: 'u' }))
        expect(requireMentorOwner).toHaveBeenCalled()
        expect(mentorOwnerForUser).not.toHaveBeenCalled()
    })
})
