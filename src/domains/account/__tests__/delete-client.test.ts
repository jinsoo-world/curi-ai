// 웹 회원 탈퇴 화면이 쓰는 판단 (1002). 서버 규칙(delete.ts)과 같아야 한다.
import { describe, it, expect } from 'vitest'
import { isDeleteWordTyped, interpretDeleteResponse, DELETE_WARNING } from '../delete-client'
import { CONFIRM_WORD } from '../delete'

describe('웹 탈퇴 판단', () => {
    it('「탈퇴」를 정확히 적어야 버튼이 켜진다 (서버 확인 단어와 같다)', () => {
        expect(CONFIRM_WORD).toBe('탈퇴')
        expect(isDeleteWordTyped('탈퇴')).toBe(true)
        expect(isDeleteWordTyped(' 탈퇴 ')).toBe(true)
        expect(isDeleteWordTyped('탈퇴할래')).toBe(false)
        expect(isDeleteWordTyped('')).toBe(false)
    })
    it('안내 글은 앱과 같다', () => {
        expect(DELETE_WARNING).toBe('내가 만든 봇, 대화, 자료가 모두 지워지고 되돌릴 수 없어요. 결제 기록은 법에 따라 5년 보관돼요.')
    })
    it('응답 해석: 200 완료, 409 구독 있음은 서버 안내 그대로, 그 밖은 오류', () => {
        expect(interpretDeleteResponse(200, { ok: true })).toEqual({ kind: 'done' })
        expect(interpretDeleteResponse(409, { code: 'ACTIVE_SUBSCRIPTION', error: '이용 중인 구독이 있어요.' }))
            .toEqual({ kind: 'active_subscription', message: '이용 중인 구독이 있어요.' })
        expect(interpretDeleteResponse(429, { error: '너무 잦아요' })).toEqual({ kind: 'error', message: '너무 잦아요' })
        expect(interpretDeleteResponse(500, null)).toEqual({ kind: 'error', message: '잠시 후 다시 해 주세요.' })
    })
})
