import { describe, it, expect } from 'vitest'
import { iga, josa, p001RoutineDone, p014PermissionPending, p025GroupReplied, p033Published, p035NeedsFix, fixHint } from '../catalog'

describe('확정 5종 문구', () => {
    it('조사는 받침을 따른다', () => {
        expect(iga('기획팀장')).toBe('기획팀장이')
        expect(iga('홍보봇')).toBe('홍보봇이')
        expect(iga('조사')).toBe('조사가')
        expect(iga('Grok')).toBe('Grok이(가)')
        expect(josa('아침 정리', '을', '를')).toBe('아침 정리를')
    })
    it('P001 은 하루 1번(서울 날짜 열쇠), 봇 방으로 간다', () => {
        const p = p001RoutineDone({ userId: 'u', mentorId: 'm1', botName: '기획팀장', routineTitle: '아침 정리', now: new Date('2026-10-01T23:30:00Z') })
        expect(p).toMatchObject({ type: 'P001', category: 'info', title: '기획팀장이 아침 정리를 마쳤어요', deeplink: 'curiai://bot/m1', dedupe: { key: 'day:2026-10-02' } })
    })
    it('P014 는 10분 안의 여러 건을 1개로', () => {
        const p = p014PermissionPending({ userId: 'u', mentorId: 'm1', botName: '홍보팀장', summary: '팬 3분께 답장 보내기' })
        expect(p).toMatchObject({ type: 'P014', title: '홍보팀장이 허락을 기다려요', dedupe: { key: 'pending', withinMinutes: 10 } })
        expect(p014PermissionPending({ userId: 'u', mentorId: null, summary: 'x' }).deeplink).toBeNull()
    })
    it('P025 는 방마다 10분 1개, 단체방으로 간다', () => {
        const p = p025GroupReplied({ userId: 'u', channelId: 'c1', roomName: '북토크 준비방', botNames: ['기획팀장', '홍보팀장'] })
        expect(p).toMatchObject({ type: 'P025', title: '북토크 준비방에 답이 모였어요', body: '기획팀장, 홍보팀장 봇이 답했어요.', deeplink: 'curiai://group/c1', dedupe: { key: 'room:c1', withinMinutes: 10 } })
    })
    it('P033 은 봇마다 평생 1번, P035 는 검사 1번당 1번이고 분류를 쉬운 말로 바꾼다', () => {
        expect(p033Published({ userId: 'u', mentorId: 'm1', botName: '김선생 글쓰기 봇' }).dedupe).toEqual({ key: 'm1' })
        const p = p035NeedsFix({ userId: 'u', mentorId: 'm1', botName: '글쓰기봇', categories: ['personal_data'], checkKey: 'h1' })
        expect(p.body).toContain('개인정보')
        expect(p.dedupe).toEqual({ key: 'm1:h1' })
        expect(fixHint(['모름'])).toBe('공개 기준에 맞지 않는 곳이 있어요.')
    })
    it('확정 5종은 전부 정보 알림이다(광고 아님)', () => {
        for (const p of [
            p001RoutineDone({ userId: 'u', mentorId: 'm', routineTitle: 't' }),
            p014PermissionPending({ userId: 'u', mentorId: 'm', summary: 's' }),
            p025GroupReplied({ userId: 'u', channelId: 'c', botNames: [] }),
            p033Published({ userId: 'u', mentorId: 'm' }),
        ]) expect(p.category).toBe('info')
    })
})
