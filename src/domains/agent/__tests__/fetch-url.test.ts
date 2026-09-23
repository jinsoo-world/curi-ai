// 링크 바로 읽기 — 인터넷 없이 확인할 수 있는 「셈만 하는」 함수들만 시험한다.
import { describe, it, expect } from 'vitest'
import {
    extractUrls, htmlToText, isBlockedHost, isPrivateIp, isSafeFetchUrl,
    isYoutubeUrl, normalizeUrl, pickCharset, pickMeta, pickTitle,
} from '../fetch-url'

describe('안쪽 주소는 막는다 (SSRF)', () => {
    it('내 컴퓨터·사내망·클라우드 메타데이터 번호는 전부 사설로 본다', () => {
        for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.169.254', '0.0.0.0', '::1']) {
            expect(isPrivateIp(ip), ip).toBe(true)
        }
        expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true)   // IPv6 가 품은 사설 IPv4
        expect(isPrivateIp('fe80::1')).toBe(true)
    })

    it('평범한 바깥 번호는 통과한다', () => {
        expect(isPrivateIp('8.8.8.8')).toBe(false)
        expect(isPrivateIp('172.32.0.1')).toBe(false)   // 172.16~31 만 사설이다
        expect(isPrivateIp('2606:4700::1111')).toBe(false)
    })

    it('이름으로도 막는다 — localhost·우리 저장소·우리 배포 주소', () => {
        expect(isBlockedHost('localhost')).toBe(true)
        expect(isBlockedHost('nas.local')).toBe(true)
        expect(isBlockedHost('metadata.google.internal')).toBe(true)
        expect(isBlockedHost('abcd.supabase.co')).toBe(true)
        expect(isBlockedHost('curi-ai.vercel.app')).toBe(true)
        expect(isBlockedHost('127.0.0.1')).toBe(true)
        expect(isBlockedHost('example.com')).toBe(false)
    })

    it('http·https 가 아니거나 안쪽 주소면 열지 않는다', () => {
        expect(isSafeFetchUrl('https://curious-500.com/a')).toBe(true)
        expect(isSafeFetchUrl('http://example.com')).toBe(true)
        expect(isSafeFetchUrl('file:///etc/passwd')).toBe(false)
        expect(isSafeFetchUrl('ftp://example.com')).toBe(false)
        expect(isSafeFetchUrl('javascript:alert(1)')).toBe(false)
        expect(isSafeFetchUrl('http://localhost:3000/api')).toBe(false)
        expect(isSafeFetchUrl('http://169.254.169.254/latest/meta-data/')).toBe(false)
        expect(isSafeFetchUrl('그냥 글')).toBe(false)
    })

    it('주소에 아이디·비번을 붙여 우리 주소인 척하는 것도 막는다', () => {
        expect(isSafeFetchUrl('https://abcd.supabase.co@남의서버.com/')).toBe(false)
    })
})

describe('네이버 블로그는 액자 안 주소로 바꿔 읽는다', () => {
    it('아이디/글번호 모양을 PostView 주소로 바꾼다', () => {
        expect(normalizeUrl('https://blog.naver.com/curious_kr/223456789'))
            .toBe('https://blog.naver.com/PostView.naver?blogId=curious_kr&logNo=223456789')
        expect(normalizeUrl('https://m.blog.naver.com/curious_kr/223456789/'))
            .toBe('https://blog.naver.com/PostView.naver?blogId=curious_kr&logNo=223456789')
    })

    it('물음표 모양으로 온 것도 맞춰 준다', () => {
        expect(normalizeUrl('https://blog.naver.com/?blogId=abc&logNo=12345'))
            .toBe('https://blog.naver.com/PostView.naver?blogId=abc&logNo=12345')
    })

    it('네이버가 아니면 그대로 둔다', () => {
        expect(normalizeUrl('https://curious-500.com/v2/community/post/2665'))
            .toBe('https://curious-500.com/v2/community/post/2665')
    })
})

describe('사람 말에서 주소 고르기', () => {
    it('최대 3개까지, 문장 끝 마침표는 뗀다', () => {
        const 말 = '이거 https://a.com/1. 하고 https://b.com/2, https://c.com/3 https://d.com/4 읽어와'
        expect(extractUrls(말)).toEqual(['https://a.com/1', 'https://b.com/2', 'https://c.com/3'])
    })

    it('같은 주소는 한 번만, 안쪽 주소는 빼고 센다', () => {
        expect(extractUrls('https://a.com/1 https://a.com/1 http://localhost/x'))
            .toEqual(['https://a.com/1'])
        expect(extractUrls('주소가 없는 말')).toEqual([])
    })
})

describe('웹페이지에서 글만 뽑기', () => {
    it('스크립트·스타일·태그는 빼고 글만 남긴다', () => {
        const html = '<html><head><title>제목이다</title><style>p{color:red}</style></head>' +
            '<body><script>var a=1</script><h1>머리글</h1><p>본문 &amp; 이야기</p><p>둘째 줄</p></body></html>'
        const text = htmlToText(html)
        expect(text).toContain('머리글')
        expect(text).toContain('본문 & 이야기')
        expect(text).not.toContain('var a=1')
        expect(text).not.toContain('color:red')
        expect(text).not.toContain('<')
    })

    it('제목은 title, 없으면 og:title, 그것도 없으면 대신 준 값', () => {
        expect(pickTitle('<title>글 제목</title>', 'example.com')).toBe('글 제목')
        expect(pickTitle('<meta property="og:title" content="열린 제목">', 'example.com')).toBe('열린 제목')
        expect(pickTitle('<p>제목 없음</p>', 'example.com')).toBe('example.com')
    })

    it('유튜브는 설명 칸을 읽어 쓴다', () => {
        const html = '<meta property="og:description" content="이 영상은 큐리어스 소개입니다">'
        expect(pickMeta(html, 'og:description')).toBe('이 영상은 큐리어스 소개입니다')
        expect(pickMeta(html, 'og:image')).toBe('')
        expect(isYoutubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true)
        expect(isYoutubeUrl('https://youtu.be/abc')).toBe(true)
        expect(isYoutubeUrl('https://curious-500.com')).toBe(false)
    })

    it('한국 옛 사이트의 글자 인코딩도 알아본다', () => {
        expect(pickCharset('text/html; charset=EUC-KR')).toBe('euc-kr')
        expect(pickCharset('text/html', '<meta charset="utf-8">')).toBe('utf-8')
        expect(pickCharset('')).toBe('utf-8')
    })
})
