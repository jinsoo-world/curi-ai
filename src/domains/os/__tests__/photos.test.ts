import { describe, it, expect } from 'vitest'
import {
    checkPhotoFiles, photoGridCols, photoPayload, runLimited,
    PHOTO_MAX_COUNT, PHOTO_MAX_BYTES, PHOTO_MSG_TOO_MANY, PHOTO_MSG_TOO_BIG, PHOTO_MSG_BAD_TYPE,
} from '../photos'

const jpg = (name: string, size = 1000) => ({ name, type: 'image/jpeg', size })

describe('os/photos — 사진 첨부 규칙', () => {
    it('10장을 넘기면 앞 10장만 받고 「10장까지만 붙일 수 있어요」', () => {
        const files = Array.from({ length: 12 }, (_, i) => jpg(`${i}.jpg`))
        const r = checkPhotoFiles(files)
        expect(r.ok).toHaveLength(PHOTO_MAX_COUNT)
        expect(r.rejected).toHaveLength(2)
        expect(r.notice).toBe(PHOTO_MSG_TOO_MANY)
    })

    it('이미 붙은 장 수를 더해 10장을 넘기지 않는다', () => {
        const r = checkPhotoFiles([jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')], 8)
        expect(r.ok.map(f => f.name)).toEqual(['a.jpg', 'b.jpg'])
        expect(r.notice).toBe(PHOTO_MSG_TOO_MANY)
        // 이미 10장이면 하나도 안 받는다
        expect(checkPhotoFiles([jpg('z.jpg')], 10).ok).toHaveLength(0)
    })

    it('4MB 넘는 장은 빼고 나머지는 받는다', () => {
        const r = checkPhotoFiles([jpg('big.jpg', PHOTO_MAX_BYTES + 1), jpg('ok.jpg', PHOTO_MAX_BYTES)])
        expect(r.ok.map(f => f.name)).toEqual(['ok.jpg'])
        expect(r.rejected[0].reason).toBe(PHOTO_MSG_TOO_BIG)
        expect(r.notice).toBe(PHOTO_MSG_TOO_BIG)
    })

    it('사진이 아닌 종류(PDF·GIF)는 거절, jpeg·png·webp·heic 는 통과', () => {
        const r = checkPhotoFiles([
            { name: 'a.pdf', type: 'application/pdf', size: 10 },
            { name: 'b.gif', type: 'image/gif', size: 10 },
            { name: 'c.png', type: 'image/png', size: 10 },
            { name: 'd.webp', type: 'image/webp', size: 10 },
            { name: 'e.heic', type: 'image/heic', size: 10 },
        ])
        expect(r.ok.map(f => f.name)).toEqual(['c.png', 'd.webp', 'e.heic'])
        expect(r.rejected).toHaveLength(2)
        expect(r.notice).toBe(PHOTO_MSG_BAD_TYPE)
    })

    it('뺀 게 없으면 안내는 null', () => {
        expect(checkPhotoFiles([jpg('a.jpg')]).notice).toBeNull()
        expect(checkPhotoFiles([]).ok).toEqual([])
    })

    it('격자 열 수: 1장=1열, 2~4장=2열, 5장 이상=3열', () => {
        expect(photoGridCols(0)).toBe(1)
        expect(photoGridCols(1)).toBe(1)
        expect(photoGridCols(2)).toBe(2)
        expect(photoGridCols(4)).toBe(2)
        expect(photoGridCols(5)).toBe(3)
        expect(photoGridCols(10)).toBe(3)
    })

    it('보낼 모양: 1장이면 imageUrl 만(옛 길), 여러 장이면 imageUrls 도. 최대 10', () => {
        expect(photoPayload([])).toEqual({})
        expect(photoPayload(['u1'])).toEqual({ imageUrl: 'u1' })
        expect(photoPayload(['u1', 'u2'])).toEqual({ imageUrl: 'u1', imageUrls: ['u1', 'u2'] })
        const many = Array.from({ length: 12 }, (_, i) => `u${i}`)
        expect(photoPayload(many).imageUrls).toHaveLength(10)
        expect(photoPayload(['', 'u1']).imageUrl).toBe('u1')
    })

    it('병렬 올리기는 동시에 3개까지, 하나 실패해도 나머지는 끝난다', async () => {
        let running = 0, peak = 0
        const task = (v: number, fail = false) => async () => {
            running++; peak = Math.max(peak, running)
            await new Promise(r => setTimeout(r, 5))
            running--
            if (fail) throw new Error(`실패 ${v}`)
            return v
        }
        const out = await runLimited([task(1), task(2, true), task(3), task(4), task(5)], 3)
        expect(peak).toBeLessThanOrEqual(3)
        expect(out[0]).toBe(1)
        expect(out[1]).toBeInstanceOf(Error)
        expect(out.slice(2)).toEqual([3, 4, 5])
    })
})

import { PHOTO_UPLOAD_MAX_EDGE, PHOTO_UPLOAD_QUALITY } from '../compress-photo'

describe('os/compress-photo — 올리기 전 줄이기 상수', () => {
    it('긴 변 한도와 품질이 합리적이다 (아바타·대화 공통)', () => {
        expect(PHOTO_UPLOAD_MAX_EDGE).toBeGreaterThanOrEqual(1024)
        expect(PHOTO_UPLOAD_MAX_EDGE).toBeLessThanOrEqual(2048)
        expect(PHOTO_UPLOAD_QUALITY).toBeGreaterThan(0.5)
        expect(PHOTO_UPLOAD_QUALITY).toBeLessThanOrEqual(0.95)
    })
})
