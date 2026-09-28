// domains/os: 자동으로 읽지 않는 곳 (대표 결정 0928 23:53, 약관 위험 제거).
// 네이버 블로그와 브런치는 robots.txt 와 약관이 자동 수집을 막는다. 피드, 자료 넣기, 대화 속 링크 어디서도 열지 않고
// 글을 붙여넣어 달라는 한 줄만 돌려준다. (다른 모듈을 부르지 않는 작은 파일 = 서로 부르는 고리가 안 생긴다)

/** 계정 연결, 자료 가져오기에서 */
export const PASTE_ONLY_NOTE = '네이버 블로그와 브런치는 설정에서 글을 붙여넣어 주세요'
/** 대화, 자료 넣기에 링크 하나를 붙였을 때 */
export const PASTE_ONLY_CHAT_NOTE = '네이버 블로그와 브런치 글은 열지 않아요. 본문을 복사해 붙여넣어 주세요'

export function isPasteOnlyHost(url: string): boolean {
    const t = String(url ?? '').trim()
    if (!t) return false
    try {
        const h = new URL(/^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`).hostname.toLowerCase().replace(/^(www|m)\./, '')
        return h === 'blog.naver.com' || h === 'rss.blog.naver.com' || h === 'brunch.co.kr' || h.endsWith('.brunch.co.kr')
    } catch { return false }
}
