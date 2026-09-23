// 링크, 영상 읽기 = 인터넷 없이 확인할 수 있는 것만 시험한다 (안전 검사, 주소 해석, 본문 추출).
import { describe, it, expect } from 'vitest'
import { readUrl, extractArticle, youtubeVideoId, joinCaptions, KNOWLEDGE_READ_OPTIONS, CHAT_READ_OPTIONS } from '../index'

describe('readUrl = 안쪽 주소는 인터넷에 나가기 전에 막힌다 (SSRF)', () => {
    it.each([
        'http://localhost:3000/api/os/knowledge',
        'http://127.0.0.1/',
        'http://10.0.0.5/secret',
        'http://192.168.0.1/',
        'http://172.16.3.4/',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::1]/',
        'http://metadata.google.internal/',
        'https://ueemicebrauwddtzvuyb.supabase.co/rest/v1/team_bots',
        'https://curi-ai.vercel.app/api/chat',
        'https://abcd.supabase.co@evil.com/',
        'file:///etc/passwd',
        'javascript:alert(1)',
        'ftp://example.com/a',
        '그냥 글',
        '',
    ])('막힌다: %s', async (url) => {
        const r = await readUrl(url)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toContain('열 수 없는 주소')
    })

    it('유튜브 흉내 주소도 안전 검사에서 걸린다', async () => {
        const r = await readUrl('http://localhost/watch?v=dQw4w9WgXcQ')
        expect(r.ok).toBe(false)
    })

    it('자료용 한도는 대화용보다 크다 (20MB, 45초)', () => {
        expect(KNOWLEDGE_READ_OPTIONS.maxBytes).toBe(20 * 1024 * 1024)
        expect(KNOWLEDGE_READ_OPTIONS.timeoutMs).toBeLessThan(60_000)
        expect(CHAT_READ_OPTIONS.maxBytes).toBeLessThan(KNOWLEDGE_READ_OPTIONS.maxBytes)
    })
})

describe('youtubeVideoId = 여러 모양의 유튜브 주소에서 영상 번호를 꺼낸다', () => {
    it.each([
        ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://youtu.be/dQw4w9WgXcQ?t=10', 'dQw4w9WgXcQ'],
        ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=abc', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ])('%s → %s', (url, id) => {
        expect(youtubeVideoId(url)).toBe(id)
    })

    it('영상 하나가 아닌 주소는 null', () => {
        expect(youtubeVideoId('https://www.youtube.com/')).toBeNull()
        expect(youtubeVideoId('https://www.youtube.com/@channel')).toBeNull()
        expect(youtubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull()
        expect(youtubeVideoId('https://youtube.com.evil.net/watch?v=dQw4w9WgXcQ')).toBeNull()
        expect(youtubeVideoId('아무 글')).toBeNull()
    })
})

describe('joinCaptions', () => {
    it('자막 조각을 한 글로 잇고 줄바꿈과 반복 공백을 정리한다', () => {
        expect(joinCaptions([{ text: '세 번째 주제는\n야,' }, { text: '  이거 안 갖고  올 수 없었다 ' }, { text: '' }]))
            .toBe('세 번째 주제는 야, 이거 안 갖고 올 수 없었다')
    })
})

describe('extractArticle = HTML 에서 본문만', () => {
    const 본문 = '안녕하세요. 티스토리팀입니다. 항상 티스토리를 이용해 주셔서 감사합니다. 이미지 편집기의 스티커 기능과 글쓰기 에디터의 이모티콘 기능 제공을 종료하게 되어 안내해 드립니다. '.repeat(3)
    const html = `<!doctype html><html><head><title>[사전안내] 이모티콘 기능 종료 안내 :: 티스토리</title>
        <meta property="og:title" content="[사전안내] 이모티콘 기능 종료 안내"><script>window.x=1</script><style>.a{}</style></head>
        <body><nav><a href="/">홈</a><a href="/cat">카테고리</a><a href="/tag">태그</a></nav>
        <article><h1>[사전안내] 이모티콘 기능 종료 안내</h1><p>${본문}</p><p>${본문}</p></article>
        <footer>© 2026 티스토리 <a href="/policy">약관</a></footer><script>alert(1)</script></body></html>`

    it('readability 가 본문을 찾고 메뉴, 스크립트는 뺀다', () => {
        const a = extractArticle(html, 'https://notice.tistory.com/2704')
        expect(a).not.toBeNull()
        expect(a!.method).toBe('readability')
        expect(a!.title).toContain('이모티콘 기능 종료 안내')
        expect(a!.text).toContain('티스토리팀입니다')
        expect(a!.text).not.toContain('alert(1)')
        expect(a!.text).not.toContain('window.x')
        expect(a!.text).not.toContain('카테고리')
    })

    it('짧은 안내글도 글과 제목이 살아 나온다', () => {
        const a = extractArticle('<html><head><title>짧은 안내</title></head><body><p>내일 오전 10시에 라이브가 있어요. 링크는 톡으로 보내드릴게요.</p></body></html>')
        expect(a).not.toBeNull()
        expect(a!.text).toContain('라이브가 있어요')
        expect(a!.title).toBe('짧은 안내')
    })

    it('readability 가 못 다루는 조각 HTML(문서 뼈대 없음)도 태그만 걷어내 살린다', () => {
        const a = extractArticle('<p>내일 오전 10시에 라이브가 있어요. 링크는 톡으로 보내드릴게요.</p>')
        expect(a).not.toBeNull()
        expect(a!.text).toContain('라이브가 있어요')
    })

    it('읽을 글이 없으면 null (지어내지 않는다)', () => {
        expect(extractArticle('')).toBeNull()
        expect(extractArticle('<html><body><script>app()</script><div id="root"></div></body></html>')).toBeNull()
    })
})
