/**
 * 로그인 뒤 돌아갈 주소(next) 검사.
 *
 * 로그인 화면 → 카카오/구글 → /auth/callback 까지 next 를 들고 다니는데,
 * 남이 만든 링크에 next=//다른사이트 를 끼워 넣으면 로그인 직후 그리로 튕길 수 있다.
 * 그래서 「우리 사이트 안의 경로」만 통과시킨다. 나머지는 전부 null(= 기본 주소로).
 */
export function safeNextPath(raw: string | null | undefined): string | null {
    if (!raw) return null
    if (/[\r\n\0]/.test(raw)) return null         // 줄바꿈·제어문자 차단 (trim 전에 본다)
    const v = raw.trim()
    if (!v) return null
    if (!v.startsWith('/')) return null           // 반드시 / 로 시작
    if (v.startsWith('//')) return null           // //다른사이트 형태 차단
    if (v.startsWith('/\\')) return null          // /\다른사이트 (브라우저가 // 로 읽음) 차단
    if (/^\/*[a-z][a-z0-9+.-]*:/i.test(v)) return null   // http: javascript: 같은 스킴 차단
    return v
}
