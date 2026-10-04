// 옛 리더 화면(/creator/manage)은 회원 이름과 회원별 메시지 수를 보여 주지 않는다 (대표 승인 1005, 익명 요약만)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('리더 화면 익명 요약', () => {
    it('목록 API 가 회원별 목록(이름, 회원 번호, 메시지 수)을 내려주지 않는다', () => {
        const src = readFileSync('src/app/api/creator/mentor/list/route.ts', 'utf8')
        expect(src).not.toContain('userList')
        expect(src).not.toContain('displayName')
        expect(src).not.toMatch(/from\('users'\)\s*\n?\s*\.select\('id, display_name'\)/)
    })
    it('화면이 회원 이름 목록을 그리지 않는다', () => {
        const src = readFileSync('src/app/creator/manage/page.tsx', 'utf8')
        expect(src).not.toContain('userList')
        expect(src).not.toContain('u.displayName')
        expect(src).not.toContain('MentorUserStat')
    })
})
