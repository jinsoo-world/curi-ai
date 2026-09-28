// domains/connectors  -  서비스 공급자 등록표 14개.
//
// 「내 걸로 한다는 게 아니고, 큐리AI 사용자들의 계정으로 연동할 수 있게」(대표 0930)
//  = 사용자 본인 계정으로 로그인해서 붙이는 OAuth. 우리 회사 계정을 붙이는 게 아니다.
//
// 규칙
//  - 열쇠(client id, secret)는 환경변수에만 있다. 이 파일에는 **이름**만 적는다.
//  - 환경변수가 없는 공급자는 화면에 「준비 중」으로 나온다.
//  - 권한(scopes)은 읽기 위주 최소. 쓰기 권한은 이미 승인 카드 뒤에서 쓰는 것(슬랙 글 올리기)만.
//  - 발급 절차(콘솔에서 무엇을 만들고 어디에 무엇을 적는가)는 docs/connect/공급자_열쇠_발급.md.

import { connectorsEnabled } from './crypto'

/** 공급자 14개 (connectors.kind 와 같은 글자) */
export const PROVIDER_IDS = [
    'notion', 'instagram', 'kakao', 'threads', 'naver_blog', 'naver_calendar',
    'gmail', 'google_calendar', 'google_drive', 'github', 'zoom',
    'slack', 'youtube', 'curious',
] as const
export type ProviderId = typeof PROVIDER_IDS[number]

/** 환경변수 모양(시험에서 가짜를 넣기 쉽게 느슨하게) */
export type Env = Record<string, string | undefined>

/** 토큰 응답 모양(공급자마다 조금씩 다르다) */
export type TokenJson = Record<string, unknown>

export interface Provider {
    id: ProviderId
    /** 화면 이름 */
    name: string
    /** public/logos/ 의 벡터 마크 */
    logo: string
    /** 한 줄 설명(비개발자 말) */
    hint: string
    /** 이 연결로 봇이 하는 일 */
    can: string
    /** 사용자를 보내는 로그인 주소 */
    authUrl: string
    /** code 를 토큰으로 바꾸는 주소 */
    tokenUrl: string
    /** 요청할 권한(읽기 위주 최소). 비면 scope 값을 안 보낸다(공급자 콘솔에서 정하는 곳) */
    scopes: readonly string[]
    /** scope 를 이어 붙일 때 쓰는 글자(구글은 띄어쓰기, 슬랙, 카카오는 쉼표) */
    scopeSeparator: ' ' | ','
    /** 환경변수 이름 */
    envClientId: string
    envClientSecret: string
    /** PKCE(code_challenge)를 받는 공급자인가 */
    pkce: boolean
    /** 토큰 받을 때 열쇠를 어디에 넣나: body = 본문 칸, basic = Authorization 머리글 */
    tokenAuth: 'body' | 'basic'
    /** 로그인 주소에 더 붙이는 값 */
    extraAuthParams?: Record<string, string>
    /** 토큰 요청에 더 붙이는 값(네이버는 state 를 다시 요구한다) */
    tokenNeedsState?: boolean
    /** 계정 힌트(이름 일부)를 어디서 읽나 */
    account?: {
        /** 토큰 응답 안에서 바로 읽는다 */
        fromToken?: (t: TokenJson) => string | null
        /** 「내 정보」 창구를 한 번 불러 읽는다 */
        url?: string
        pick?: (json: Record<string, unknown>) => string | null
    }
    /**
     * 열쇠가 있어도 열지 않는 것 = 봇이 이 토큰을 아직 읽지 않는 서비스(대표 0928: 반쯤 되는 카드를 열지 않는다).
     * 봇이 읽는 도구를 붙이는 날 그 줄의 comingSoon 을 지운다. 지금 열 수 있는 것: 노션(붙여 넣기), 구글 드라이브, 큐리어스(열쇠 있을 때)
     */
    comingSoon?: boolean
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {})

/** 큐리어스 본체 창구 주소(명세 docs/connect/큐리어스_연결_명세.md 와 글자 하나까지 같다) */
export const CURIOUS_ORIGIN = 'https://curious-500.com'
export const CURIOUS_AUTHORIZE_URL = `${CURIOUS_ORIGIN}/oauth/authorize`
export const CURIOUS_TOKEN_URL = `${CURIOUS_ORIGIN}/api/v2/oauth/token`
export const CURIOUS_PARTNER_API = `${CURIOUS_ORIGIN}/api/v2/partner`

const GOOGLE = {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    envClientId: 'GOOGLE_OAUTH_CLIENT_ID',
    envClientSecret: 'GOOGLE_OAUTH_CLIENT_SECRET',
    pkce: true,
    tokenAuth: 'body' as const,
    scopeSeparator: ' ' as const,
    // refresh_token 을 받으려면 offline + consent
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    account: { url: 'https://www.googleapis.com/oauth2/v3/userinfo', pick: (j: Record<string, unknown>) => str(j.email) },
}

const NAVER = {
    authUrl: 'https://nid.naver.com/oauth2.0/authorize',
    tokenUrl: 'https://nid.naver.com/oauth2.0/token',
    envClientId: 'NAVER_CLIENT_ID',
    envClientSecret: 'NAVER_CLIENT_SECRET',
    pkce: false,
    tokenAuth: 'body' as const,
    scopeSeparator: ' ' as const,
    scopes: [] as const,      // 네이버는 권한을 콘솔(API 설정)에서 정한다. scope 값을 안 보낸다
    tokenNeedsState: true,
    account: { url: 'https://openapi.naver.com/v1/nid/me', pick: (j: Record<string, unknown>) => str(obj(j.response).email) ?? str(obj(j.response).nickname) },
}

export const PROVIDERS: readonly Provider[] = [
    {
        id: 'notion', name: '노션', logo: '/logos/notion.svg',
        hint: '내 노션 문서를 봇이 찾아 읽어요. 쓰지는 않아요.', can: '읽기만',
        authUrl: 'https://api.notion.com/v1/oauth/authorize', tokenUrl: 'https://api.notion.com/v1/oauth/token',
        scopes: [], scopeSeparator: ' ',       // 노션은 scope 가 없다(통합 설정에서 「읽기」만 켠다)
        envClientId: 'NOTION_CLIENT_ID', envClientSecret: 'NOTION_CLIENT_SECRET',
        pkce: false, tokenAuth: 'basic', extraAuthParams: { owner: 'user' },
        account: { fromToken: t => str(obj(obj(obj(t.owner).user).person).email) ?? str(t.workspace_name) },
    },
    {
        id: 'instagram', name: '인스타그램', logo: '/logos/instagram.svg',
        hint: '내 게시물과 댓글을 봇이 읽어요.', can: '읽기만',
        authUrl: 'https://www.instagram.com/oauth/authorize', tokenUrl: 'https://api.instagram.com/oauth/access_token',
        // 옛 instagram_basic(기본 표시 API)은 2024-12 에 닫혔다. 지금 살아 있는 이름은 instagram_business_basic
        scopes: ['instagram_business_basic'], scopeSeparator: ',',
        envClientId: 'INSTAGRAM_APP_ID', envClientSecret: 'INSTAGRAM_APP_SECRET',
        pkce: false, tokenAuth: 'body',
        account: { url: 'https://graph.instagram.com/me?fields=username', pick: j => str(j.username) },
        comingSoon: true,      // 봇이 이 토큰을 아직 안 읽는다(대표 0928). 열쇠를 넣어도 「곧 열려요」
    },
    {
        id: 'kakao', name: '카카오톡', logo: '/logos/kakao.svg',
        hint: '내 카카오 계정으로 붙어요. 나에게 보내는 메시지만 써요.', can: '프로필 읽기, 나에게 보내기(승인 카드 뒤에서만)',
        authUrl: 'https://kauth.kakao.com/oauth/authorize', tokenUrl: 'https://kauth.kakao.com/oauth/token',
        scopes: ['profile_nickname', 'talk_message'], scopeSeparator: ',',
        envClientId: 'KAKAO_REST_API_KEY', envClientSecret: 'KAKAO_CLIENT_SECRET',
        pkce: true, tokenAuth: 'body',
        account: { url: 'https://kapi.kakao.com/v2/user/me', pick: j => str(obj(obj(j.kakao_account).profile).nickname) },
        comingSoon: true,      // 봇이 이 토큰을 아직 안 읽는다(대표 0928). 열쇠를 넣어도 「곧 열려요」
    },
    {
        id: 'threads', name: '스레드', logo: '/logos/threads.svg',
        hint: '내 스레드 글을 봇이 읽어요.', can: '읽기만',
        authUrl: 'https://threads.net/oauth/authorize', tokenUrl: 'https://graph.threads.net/oauth/access_token',
        scopes: ['threads_basic'], scopeSeparator: ',',
        envClientId: 'THREADS_APP_ID', envClientSecret: 'THREADS_APP_SECRET',
        pkce: false, tokenAuth: 'body',
        account: { url: 'https://graph.threads.net/v1.0/me?fields=username', pick: j => str(j.username) },
        comingSoon: true,      // 봇이 이 토큰을 아직 안 읽는다(대표 0928). 열쇠를 넣어도 「곧 열려요」
    },
    {
        id: 'naver_blog', name: '네이버 블로그', logo: '/logos/naver_blog.svg',
        hint: '내 블로그 글을 봇이 읽어요. 올리기 전엔 꼭 물어봐요.', can: '읽기, 올리기(승인 카드 뒤에서만)',
        ...NAVER,
        comingSoon: true,      // 봇이 이 토큰을 아직 안 읽는다(대표 0928). 열쇠를 넣어도 「곧 열려요」
    },
    {
        id: 'naver_calendar', name: '네이버 캘린더', logo: '/logos/naver_calendar.svg',
        hint: '내 네이버 일정을 봇이 읽어요.', can: '읽기만',
        ...NAVER,
        comingSoon: true,      // 봇이 이 토큰을 아직 안 읽는다(대표 0928). 열쇠를 넣어도 「곧 열려요」
    },
    {
        id: 'gmail', name: '지메일', logo: '/logos/gmail.svg',
        hint: '내 메일을 봇이 읽고 요약해요. 보내지는 않아요.', can: '읽기만',
        ...GOOGLE, scopes: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly'],
        comingSoon: true,      // 봇이 이 토큰을 아직 안 읽는다(대표 0928). 열쇠를 넣어도 「곧 열려요」
    },
    {
        id: 'google_calendar', name: '구글 캘린더', logo: '/logos/google_calendar.svg',
        hint: '내 일정을 봇이 읽어요. 바꾸지는 않아요.', can: '읽기만',
        ...GOOGLE, scopes: ['openid', 'email', 'https://www.googleapis.com/auth/calendar.readonly'],
        comingSoon: true,      // 봇이 이 토큰을 아직 안 읽는다(대표 0928). 열쇠를 넣어도 「곧 열려요」
    },
    {
        id: 'google_drive', name: '구글 드라이브', logo: '/logos/google_drive.svg',
        hint: '내 드라이브 폴더에 있는 문서를 봇이 읽어요. 하루에 한 번 새로 바뀐 것만 다시 읽어요.', can: '읽기만',
        ...GOOGLE, scopes: ['openid', 'email', 'https://www.googleapis.com/auth/drive.readonly'],
    },
    {
        id: 'github', name: '깃허브', logo: '/logos/github.svg',
        hint: '내 저장소 글과 이슈를 봇이 읽어요.', can: '읽기만',
        authUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://github.com/login/oauth/access_token',
        // 깃허브엔 「비공개 저장소 읽기만」 권한이 없다(repo 는 쓰기까지 열린다). 그래서 사용자 정보만 받고, 공개 저장소는 권한 없이 읽는다
        scopes: ['read:user'], scopeSeparator: ' ',
        envClientId: 'GITHUB_CLIENT_ID', envClientSecret: 'GITHUB_CLIENT_SECRET',
        pkce: false, tokenAuth: 'body',
        account: { url: 'https://api.github.com/user', pick: j => str(j.login) },
        comingSoon: true,      // 봇이 이 토큰을 아직 안 읽는다(대표 0928). 열쇠를 넣어도 「곧 열려요」
    },
    {
        id: 'zoom', name: 'Zoom', logo: '/logos/zoom.svg',
        hint: '내 회의 목록과 녹취를 봇이 읽어요.', can: '읽기만',
        authUrl: 'https://zoom.us/oauth/authorize', tokenUrl: 'https://zoom.us/oauth/token',
        scopes: [], scopeSeparator: ' ',       // Zoom 은 권한을 앱 콘솔(Scopes)에서 정한다
        envClientId: 'ZOOM_CLIENT_ID', envClientSecret: 'ZOOM_CLIENT_SECRET',
        pkce: true, tokenAuth: 'basic',
        account: { url: 'https://api.zoom.us/v2/users/me', pick: j => str(j.email) },
        comingSoon: true,      // 봇이 이 토큰을 아직 안 읽는다(대표 0928). 열쇠를 넣어도 「곧 열려요」
    },
    {
        id: 'slack', name: '슬랙', logo: '/logos/slack.svg',
        hint: '우리 방 글을 읽고, 올리기 전엔 꼭 물어봐요.', can: '읽기, 보내기(승인 카드 뒤에서만)',
        authUrl: 'https://slack.com/oauth/v2/authorize', tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scopes: ['channels:read', 'channels:history', 'chat:write'], scopeSeparator: ',',
        envClientId: 'SLACK_CLIENT_ID', envClientSecret: 'SLACK_CLIENT_SECRET',
        pkce: false, tokenAuth: 'body',
        account: { fromToken: t => str(obj(t.team).name) },
        // 봇이 슬랙을 실제로 쓰는 도구(읽기, 승인 뒤 올리기)가 아직 없다. 붙여도 아무 일이 안 생기므로
        // 열쇠가 있어도 「곧 열려요」에 둔다(대표 0928: 반쯤 되는 기능을 보이지 않는다)
        comingSoon: true,
    },
    {
        id: 'youtube', name: '유튜브', logo: '/logos/youtube.svg',
        hint: '내 채널 영상과 댓글을 봇이 읽어요.', can: '읽기만',
        ...GOOGLE, scopes: ['openid', 'email', 'https://www.googleapis.com/auth/youtube.readonly'],
        comingSoon: true,      // 봇이 이 토큰을 아직 안 읽는다(대표 0928). 열쇠를 넣어도 「곧 열려요」
    },
    {
        // 큐리어스 본체(curious-500.com) 계정. 본체에 OAuth 창구가 열려야 붙는다(명세 docs/connect/큐리어스_연결_명세.md).
        // 열쇠 두 개(CURIOUS_OAUTH_CLIENT_ID, _SECRET)가 Vercel 에 들어가기 전까지는 다른 것처럼 「곧 열려요」에 있다.
        id: 'curious', name: '큐리어스', logo: '/logos/curious.png',
        hint: '내 큐리어스 어울림, 신청자 수, 커뮤니티 글을 봇이 읽어요. 쓰지는 않아요.', can: '읽기만',
        authUrl: CURIOUS_AUTHORIZE_URL, tokenUrl: CURIOUS_TOKEN_URL,
        scopes: ['profile:read', 'studies:read', 'members:read', 'posts:read'], scopeSeparator: ' ',
        envClientId: 'CURIOUS_OAUTH_CLIENT_ID', envClientSecret: 'CURIOUS_OAUTH_CLIENT_SECRET',
        pkce: true, tokenAuth: 'body',
        account: { url: `${CURIOUS_PARTNER_API}/me`, pick: j => str(j.nickname) ?? str(j.name) },
    },

]

export function findProvider(id: unknown): Provider | null {
    return PROVIDERS.find(p => p.id === String(id)) ?? null
}

/** 이 공급자를 지금 붙일 수 있나 = 열쇠 2개 + 자물쇠(CONNECTOR_SECRET_KEY)가 다 있다 */
export function providerReady(p: Provider, env: Env = process.env): boolean {
    if (p.comingSoon) return false
    if (!connectorsEnabled(env.CONNECTOR_SECRET_KEY)) return false
    return !!(env[p.envClientId]?.trim() && env[p.envClientSecret]?.trim())
}

/** 화면에 보내는 모양(열쇠 없음) */
export interface ProviderView {
    id: ProviderId
    name: string
    logo: string
    hint: string
    can: string
    ready: boolean
    comingSoon: boolean
    /** 준비 안 됐을 때 한 줄 */
    missing: string | null
}

export function providerView(p: Provider, env: Env = process.env): ProviderView {
    const ready = providerReady(p, env)
    return {
        id: p.id, name: p.name, logo: p.logo, hint: p.hint, can: p.can, ready,
        comingSoon: !!p.comingSoon,
        missing: ready || p.comingSoon ? null : '준비 중',
    }
}
