import { describe, it, expect } from 'vitest'
import { isQuietHours, localHHMM } from '../quiet-hours'

// 서울 시각으로 만든다 (UTC+9). 2026-09-23 23:30 KST = 14:30Z
const kst = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 23, h - 9, m))

describe('messaging/quiet-hours — 조용한 시간(기본 22:00~08:00 서울)', () => {
    it('서울 시각 HH:MM 을 뽑는다', () => {
        expect(localHHMM(kst(23, 30))).toBe('23:30')
        expect(localHHMM(kst(8, 0))).toBe('08:00')
    })

    it('밤 23:30 은 조용한 시간이다(기본값)', () => {
        expect(isQuietHours(kst(23, 30))).toBe(true)
    })
    it('새벽 03:00 도 조용한 시간이다(자정을 넘는 구간)', () => {
        expect(isQuietHours(kst(3, 0))).toBe(true)
    })
    it('아침 08:00 정각부터는 보낸다(끝은 열린 구간)', () => {
        expect(isQuietHours(kst(8, 0))).toBe(false)
    })
    it('저녁 22:00 정각부터 조용하다(시작은 닫힌 구간)', () => {
        expect(isQuietHours(kst(22, 0))).toBe(true)
    })
    it('낮 14:00 은 보낸다', () => {
        expect(isQuietHours(kst(14, 0))).toBe(false)
    })
    it('사용자가 정한 구간(13:00~15:00, 자정 안 넘음)', () => {
        expect(isQuietHours(kst(14, 0), '13:00', '15:00')).toBe(true)
        expect(isQuietHours(kst(16, 0), '13:00', '15:00')).toBe(false)
    })
    it('시작과 끝이 같으면 조용한 시간이 없는 것이다', () => {
        expect(isQuietHours(kst(3, 0), '09:00', '09:00')).toBe(false)
    })
    it('DB 에서 초까지 붙어 와도(22:00:00) 읽는다', () => {
        expect(isQuietHours(kst(23, 0), '22:00:00', '08:00:00')).toBe(true)
    })
})
