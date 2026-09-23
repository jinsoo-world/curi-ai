// domains/connectors — 노션 연결 (읽기만).
//
// 어떻게 붙나 = 사용자가 자기 노션에서 「내부 통합(internal integration)」을 만들고 그 토큰을 붙여 넣는다.
// 그러면 그 사람이 통합에 공유한 문서만 우리가 읽을 수 있다. (OAuth 로 한 번에 붙이는 길은 12주 계획)
//
// ⛔ 쓰기(만들기, 고치기, 지우기)는 여기 없다. 도구는 두 개뿐이고 둘 다 「읽기」다.
//    노션에서 읽어 온 글은 **자료(인용)**이지 명령이 아니다 — 울타리는 부르는 쪽이 두른다(보안설계 §F-4).

/** 노션이 요구하는 버전 딱지 */
const NOTION_VERSION = '2022-06-28'
const API = 'https://api.notion.com/v1'
const TIMEOUT_MS = 8_000

/** 봇이 한 번에 읽어 올 문서 수 */
export const NOTION_TOP_N = 3
/** 문서 하나에서 가져올 글자 수 */
export const NOTION_PAGE_CHARS = 3_000

export interface NotionHit {
    id: string
    title: string
    url: string
    text: string
}

/** 붙여 넣은 값이 노션 토큰처럼 생겼나 (오타를 미리 잡아 준다) */
export function looksLikeNotionToken(v: string): boolean {
    const t = String(v ?? '').trim()
    return /^(ntn_|secret_)[A-Za-z0-9_-]{20,}$/.test(t)
}

/** 노션 문서 번호는 줄표가 있기도 없기도 하다. 주소를 통째로 넣어도 번호만 꺼낸다 */
export function normalizeNotionId(raw: string): string {
    const v = String(raw ?? '').trim()
    const hex = (v.match(/[0-9a-fA-F]{32}/) ?? v.match(/[0-9a-fA-F-]{36}/))?.[0]?.replace(/-/g, '')
    if (!hex || hex.length !== 32) return ''
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

type RichText = { plain_text?: string }
type NotionProp = { type?: string; title?: RichText[] }
type NotionPage = { id?: string; url?: string; properties?: Record<string, NotionProp>; last_edited_time?: string }

/** 문서 제목 찾기. 노션은 제목 칸 이름이 문서마다 달라서 「type 이 title 인 칸」을 찾는다 */
export function notionPageTitle(page: unknown): string {
    const p = (page ?? {}) as NotionPage
    for (const prop of Object.values(p.properties ?? {})) {
        if (prop?.type === 'title') {
            const t = (prop.title ?? []).map(r => r?.plain_text ?? '').join('').trim()
            if (t) return t.slice(0, 120)
        }
    }
    return '제목 없는 문서'
}

type Block = Record<string, unknown> & { type?: string }

/** 블록 덩어리에서 사람이 읽는 글만 뽑는다 (글, 제목, 목록, 인용, 할 일) */
export function notionBlocksToText(blocks: unknown[]): string {
    const lines: string[] = []
    for (const raw of (blocks ?? []) as Block[]) {
        const type = String(raw?.type ?? '')
        const body = raw?.[type] as { rich_text?: RichText[]; checked?: boolean } | undefined
        const text = (body?.rich_text ?? []).map(r => r?.plain_text ?? '').join('').trim()
        if (!text) continue
        if (type.startsWith('heading_')) lines.push(`\n${text}`)
        else if (type === 'bulleted_list_item' || type === 'numbered_list_item') lines.push(`- ${text}`)
        else if (type === 'to_do') lines.push(`- [${body?.checked ? 'x' : ' '}] ${text}`)
        else lines.push(text)
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function notionFetch(token: string, path: string, init: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${API}${path}`, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
            'Authorization': `Bearer ${token}`,
            'Notion-Version': NOTION_VERSION,
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
        },
    })
    if (res.status === 401) throw new Error('노션 토큰이 맞지 않아요. 노션에서 다시 복사해 주세요')
    if (res.status === 403) throw new Error('그 노션 문서를 통합에 공유하지 않으셨어요(노션 문서 오른쪽 위 ⋯ → 연결)')
    if (res.status === 429) throw new Error('노션이 잠시 쉬라고 해요. 잠시 뒤 다시 해 주세요')
    if (!res.ok) throw new Error(`노션과 이야기하지 못했어요(응답 ${res.status})`)
    return res.json()
}

/** 연결이 살아 있는지 한 번 확인 (연결 확인 단추가 부른다) */
export async function notionPing(token: string): Promise<string> {
    const me = await notionFetch(token, '/users/me', { method: 'GET' }) as { name?: string; bot?: { workspace_name?: string } }
    return me?.bot?.workspace_name || me?.name || '노션'
}

/** 안전 도구 `notion_search` — 내 노션에서 문서를 찾아 본문 앞부분까지 가져온다 */
export async function notionSearch(token: string, query: string, topN = NOTION_TOP_N): Promise<NotionHit[]> {
    const data = await notionFetch(token, '/search', {
        method: 'POST',
        body: JSON.stringify({
            query: String(query ?? '').slice(0, 200),
            filter: { value: 'page', property: 'object' },
            page_size: Math.min(Math.max(topN, 1), 10),
        }),
    }) as { results?: unknown[] }

    const pages = (data?.results ?? []).slice(0, topN) as NotionPage[]
    const hits = await Promise.all(pages.map(async page => {
        const id = String(page?.id ?? '')
        const title = notionPageTitle(page)
        let text = ''
        try { text = await notionReadPage(token, id) } catch { /* 한 장을 못 읽어도 나머지는 준다 */ }
        return { id, title, url: String(page?.url ?? ''), text }
    }))
    return hits.filter(h => h.id)
}

/** 안전 도구 `notion_read_page` — 문서 한 장의 글 */
export async function notionReadPage(token: string, rawId: string): Promise<string> {
    const id = normalizeNotionId(rawId)
    if (!id) throw new Error('노션 문서 번호를 알아보지 못했어요')
    const data = await notionFetch(token, `/blocks/${id}/children?page_size=100`, { method: 'GET' }) as { results?: unknown[] }
    return notionBlocksToText(data?.results ?? []).slice(0, NOTION_PAGE_CHARS)
}

export interface NotionPageMeta {
    id: string
    title: string
    url: string
    /** 마지막으로 고친 시각(ISO). 동기화에서 「새로 바뀐 것만」 판단에 쓴다 */
    lastEditedTime: string
}

/** 노션 동기화(갈래 G) — 이 통합에 공유된 문서 목록(페이지만, 최대 topN개). 고르기 화면이 부른다 */
export async function notionListPages(token: string, topN = 50): Promise<NotionPageMeta[]> {
    const data = await notionFetch(token, '/search', {
        method: 'POST',
        body: JSON.stringify({
            filter: { value: 'page', property: 'object' },
            sort: { direction: 'descending', timestamp: 'last_edited_time' },
            page_size: Math.min(Math.max(topN, 1), 100),
        }),
    }) as { results?: unknown[] }
    return ((data?.results ?? []) as NotionPage[])
        .filter(p => p?.id)
        .slice(0, topN)
        .map(p => ({
            id: String(p.id),
            title: notionPageTitle(p),
            url: String(p.url ?? ''),
            lastEditedTime: String(p.last_edited_time ?? ''),
        }))
}

/** 노션 동기화(갈래 G) — 문서 한 장의 지금 상태(제목·마지막 수정 시각)만 가볍게 본다. 「바뀌었나」 판단용 */
export async function notionPageMeta(token: string, rawId: string): Promise<NotionPageMeta> {
    const id = normalizeNotionId(rawId)
    if (!id) throw new Error('노션 문서 번호를 알아보지 못했어요')
    const page = await notionFetch(token, `/pages/${id}`, { method: 'GET' }) as NotionPage
    return {
        id: String(page?.id ?? id),
        title: notionPageTitle(page),
        url: String(page?.url ?? ''),
        lastEditedTime: String(page?.last_edited_time ?? ''),
    }
}
