/**
 * 앱 로그인 표시 (2026-10-01).
 * 웹은 로그인을 쿠키로 들고 다니지만, 아이폰·안드로이드 앱은 쿠키가 없어서 요청마다
 * 「Authorization: Bearer <Supabase 로그인 표시(access token)>」 를 붙여 보낸다.
 * 여기선 그 값을 꺼내고, 서버 코드 106곳이 쓰는 `supabase.auth.getUser()` (인자 없음)가
 * 그 표시로 Supabase 에 직접 물어 사용자를 확인하게 묶는다. 위조 표시는 Supabase 가 거절한다.
 */

/** 로그인 표시 최대 길이. 이보다 길면 정상 표시가 아니다 */
const MAX_TOKEN_LENGTH = 8192

export function bearerFromHeader(header: string | null | undefined): string | null {
    if (!header) return null
    const m = /^bearer\s+(.+)$/i.exec(header.trim())
    if (!m) return null
    const token = m[1].trim()
    if (!token || token.length > MAX_TOKEN_LENGTH) return null
    return token
}

type GetUser = (jwt?: string) => Promise<unknown>

/** getUser() 를 인자 없이 불러도 앱이 보낸 표시를 쓰게 한다. 직접 넘긴 값이 있으면 그걸 쓴다 */
export function bindBearerToAuth<T extends { auth: { getUser: GetUser } }>(client: T, token: string): T {
    const original = client.auth.getUser.bind(client.auth) as GetUser
    client.auth.getUser = ((jwt?: string) => original(jwt ?? token)) as T['auth']['getUser']
    return client
}
