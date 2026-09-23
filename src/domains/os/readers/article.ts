// domains/os/readers = 웹페이지 HTML 에서 「본문」만 뽑는다.
//
// 도구 = @mozilla/readability (파이어폭스 「읽기 모드」와 같은 엔진) + linkedom (가벼운 DOM).
// 왜 이 둘인가 = docs/readers/링크_영상_읽기_도구_조사_0923.md 에 표로 정리. 요약:
//   - 우리 서버(Vercel, Node)에서 그대로 돈다. 바이너리, 외부 서비스 없음 = 자료가 밖으로 안 나간다.
//   - jsdom 대신 linkedom = 20배 가볍고 서버리스 첫 실행이 빠르다. readability 는 DOM 만 있으면 된다.
//   - 실측 0923: 티스토리(notice.tistory.com), 브런치(brunch.co.kr) 본문 추출 성공.
//     네이버 블로그는 fetch-url.ts 의 normalizeUrl 이 액자 안 주소(PostView)로 바꿔 준 뒤 여기로 온다.
//
// readability 가 본문을 못 찾으면(짧은 글, 목록 페이지) 옛 방식(태그만 걷어내기)으로 되돌아간다.
// 어느 쪽이든 「지어내지 않는다」 = 못 읽으면 못 읽었다고 돌려준다.

import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { htmlToText, pickMeta, pickTitle } from '@/domains/agent/fetch-url'

export interface Article {
    title: string
    text: string
    /** readability 가 본문을 찾았나(readability), 아니면 태그만 걷어냈나(plain) */
    method: 'readability' | 'plain'
}

/** 이 글자 수보다 짧으면 「본문을 못 찾았다」로 본다 */
export const MIN_ARTICLE_CHARS = 30

/**
 * HTML → 본문 글. 절대 던지지 않는다.
 * @param html 가져온 원문
 * @param url  상대 주소를 절대 주소로 바꿀 때 쓰는 기준 (없어도 된다)
 */
export function extractArticle(html: string, url = ''): Article | null {
    const raw = String(html ?? '')
    if (!raw.trim()) return null

    let title = ''
    let text = ''
    try {
        const { document } = parseHTML(raw)
        // readability 는 문서를 고쳐 쓰므로 제목은 먼저 뽑아 둔다
        title = pickTitle(raw, '')
        const parsed = new Readability(document as unknown as Document, { charThreshold: 100 }).parse()
        if (parsed?.textContent) {
            text = tidy(parsed.textContent)
            if (!title && parsed.title) title = parsed.title.trim().slice(0, 120)
        }
    } catch {
        // DOM 을 못 만들었으면 아래 옛 방식으로
    }

    if (text.length >= MIN_ARTICLE_CHARS) {
        return { title: title || fallbackTitle(url), text, method: 'readability' }
    }

    // 되돌아가기 = 태그만 걷어낸 글. 본문이 있는데 readability 가 놓친 경우(짧은 안내글 등)를 살린다.
    const plain = tidy(htmlToText(raw))
    if (plain.length >= MIN_ARTICLE_CHARS) {
        return { title: title || pickMeta(raw, 'og:title') || fallbackTitle(url), text: plain, method: 'plain' }
    }
    return null
}

/** 줄 정리 = 줄마다 앞뒤 공백 제거, 빈 줄은 두 줄까지 */
function tidy(s: string): string {
    return String(s ?? '')
        .split('\n')
        .map(l => l.replace(/[ \t ]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

function fallbackTitle(url: string): string {
    try { return new URL(url).hostname } catch { return url || '제목 없는 글' }
}
