import { describe, it, expect } from 'vitest'
import { parseScreenshotImages, cleanScreenshotText, SCREENSHOT_MAX_IMAGES } from '../screenshot-read'
import { snsLabelOf, captureBody } from '../sns-capture'
import { classifySnsLink } from '../sns-link'

const png = 'data:image/png;base64,' + 'A'.repeat(100)

describe('SNS 캡처 받기 (대표 결정 0929)', () => {
    it('인스타그램, 페이스북, 스레드는 캡처나 붙여넣기로 받는다. X, 틱톡은 링크만', () => {
        for (const u of ['https://www.instagram.com/curi', 'https://www.facebook.com/curi', 'https://www.threads.net/@curi']) {
            const t = classifySnsLink(u)
            expect(t.feed).toBeNull()
            expect(t.paste).toBe(true)
        }
        expect(classifySnsLink('https://x.com/curi').paste).toBeFalsy()
    })
    it('사진 모양 검사: PNG, JPG, WEBP 만, 5장까지', () => {
        expect(parseScreenshotImages([png])).toEqual([{ mimeType: 'image/png', data: 'A'.repeat(100) }])
        expect(parseScreenshotImages(undefined)).toEqual([])
        expect(() => parseScreenshotImages(['data:image/gif;base64,AAAA'])).toThrow('사진 파일')
        expect(() => parseScreenshotImages(['https://evil.com/a.png'])).toThrow()
        expect(() => parseScreenshotImages(Array(SCREENSHOT_MAX_IMAGES + 1).fill(png))).toThrow('5장')
    })
    it('옮겨 적은 글 정리: 「없음」은 빈 글', () => {
        expect(cleanScreenshotText('없음')).toBe('')
        expect(cleanScreenshotText('  오늘도 빵을 구웠어요 #베이킹 ')).toBe('오늘도 빵을 구웠어요 #베이킹')
        expect(cleanScreenshotText(null)).toBe('')
    })
    it('곳 이름과 자료 글 모양', () => {
        expect(snsLabelOf('https://www.instagram.com/curi')).toBe('인스타그램')
        expect(snsLabelOf('threads.net/@a')).toBe('스레드')
        expect(snsLabelOf('')).toBe('SNS')
        expect(captureBody('https://instagram.com/a', ['글1'], '붙인 글')).toBe('출처: https://instagram.com/a\n\n[캡처 1]\n글1\n\n[붙여넣은 글]\n붙인 글')
    })
})
