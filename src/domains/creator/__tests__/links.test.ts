/**
 * 리더 개인 SNS 링크 — 대표 지시 2026-09-16
 *
 * 남이 적는 주소를 화면에 거는 일이라, 무엇이 통과하고 무엇이 막히는지를 시험으로 못 박는다.
 */
import { describe, it, expect } from 'vitest'
import { 주소정리, 종류추측, 링크정리, 보일이름 } from '../links'

describe('주소정리', () => {
    it('앞을 빼고 적어도 https 를 붙여 준다', () => {
        expect(주소정리('instagram.com/jin')).toBe('https://instagram.com/jin')
    })

    it('이미 https 면 그대로 둔다', () => {
        expect(주소정리('https://blog.naver.com/jin')).toBe('https://blog.naver.com/jin')
    })

    it('앞뒤 공백을 턴다', () => {
        expect(주소정리('  https://curious-500.com  ')).toBe('https://curious-500.com/')
    })

    it('javascript: 는 막는다 — 누른 사람 브라우저에서 코드가 돈다', () => {
        expect(주소정리('javascript:alert(1)')).toBeNull()
        expect(주소정리('JavaScript:alert(1)')).toBeNull()
        expect(주소정리('  javascript:alert(1)')).toBeNull()
    })

    it('data· file· vbscript 도 막는다', () => {
        expect(주소정리('data:text/html,<script>alert(1)</script>')).toBeNull()
        expect(주소정리('file:///etc/passwd')).toBeNull()
        expect(주소정리('vbscript:msgbox(1)')).toBeNull()
    })

    it('주소 모양이 아니면 막는다', () => {
        expect(주소정리('')).toBeNull()
        expect(주소정리('   ')).toBeNull()
        expect(주소정리('그냥 글자')).toBeNull()
        expect(주소정리('localhost')).toBeNull()
        expect(주소정리(123)).toBeNull()
        expect(주소정리(null)).toBeNull()
    })

    it('너무 긴 주소는 막는다', () => {
        expect(주소정리(`https://a.com/${'x'.repeat(600)}`)).toBeNull()
    })
})

describe('종류추측', () => {
    it('주소를 보고 채널을 알아맞힌다', () => {
        expect(종류추측('https://www.instagram.com/jin')).toBe('instagram')
        expect(종류추측('https://youtu.be/abc')).toBe('youtube')
        expect(종류추측('https://blog.naver.com/jin')).toBe('blog')
        expect(종류추측('https://open.kakao.com/o/abc')).toBe('kakao')
        expect(종류추측('https://curious-500.com/v2/study/1')).toBe('curious')
    })

    it('모르는 곳은 홈페이지로 둔다', () => {
        expect(종류추측('https://내주소.com')).toBe('home')
    })

    it('비슷한 이름의 남의 도메인에 속지 않는다', () => {
        // instagram.com.evil.com 은 인스타가 아니다
        expect(종류추측('https://instagram.com.evil.com/jin')).toBe('home')
    })
})

describe('링크정리', () => {
    it('못 쓰는 줄은 빼고 쓸 수 있는 것만 남긴다', () => {
        const 결과 = 링크정리([
            { url: 'instagram.com/jin' },
            { url: 'javascript:alert(1)' },
            { url: '' },
            { url: 'https://youtube.com/@jin' },
        ])
        expect(결과).toEqual([
            { kind: 'instagram', url: 'https://instagram.com/jin' },
            { kind: 'youtube', url: 'https://youtube.com/@jin' },
        ])
    })

    it('같은 주소를 두 번 넣지 않는다', () => {
        const 결과 = 링크정리([
            { url: 'https://curious-500.com/' },
            { url: 'https://curious-500.com/' },
        ])
        expect(결과).toHaveLength(1)
    })

    it('여덟 개까지만 받는다', () => {
        const 많이 = Array.from({ length: 20 }, (_, i) => ({ url: `https://a${i}.com` }))
        expect(링크정리(많이)).toHaveLength(8)
    })

    it('모르는 종류가 오면 주소를 보고 다시 고른다', () => {
        expect(링크정리([{ kind: '가짜종류', url: 'https://youtube.com/@jin' }]))
            .toEqual([{ kind: 'youtube', url: 'https://youtube.com/@jin' }])
    })

    it('배열이 아니면 빈 것을 준다', () => {
        expect(링크정리(null)).toEqual([])
        expect(링크정리('글자')).toEqual([])
        expect(링크정리({})).toEqual([])
    })
})

describe('보일이름', () => {
    it('아는 채널은 이름으로 보여준다', () => {
        expect(보일이름({ kind: 'instagram', url: 'https://instagram.com/jin' })).toBe('인스타그램')
    })

    it('홈페이지는 주소를 보여준다', () => {
        expect(보일이름({ kind: 'home', url: 'https://www.mysite.com/a' })).toBe('mysite.com')
    })
})
