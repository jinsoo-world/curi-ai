// domains/os — 둘러보기 팀 · 봇 마켓 진열 (순수 계산)
//
// 가상 리더 10명 사용시험(2026-09-29, 02_제품/큐리스/가상리더10명_체험판_사용시험_0929.md)에서 나온 것:
//  ① 둘러보기(?demo=1)에서 칩을 눌러도 「로그인하면 대화할 수 있어요」만 떠서 10명 중 0명이 대답을 봤다
//     → 둘러보기 팀 4명은 로그인 전에도 대답한다(손님 하루 한도 MAX_DAILY_FREE_GUEST 는 chat 라우트가 그대로 센다)
//  ② 봇 마켓 맨 앞 7명이 리더가 아닌 예시 봇인데 「리더들이 만든 공개 봇」 아래 섞여 있었다 → 뒤로 보내고 「예시」 표시
//  ③ 시험용 봇(코덱스봇)이 공개돼 있었다 → 마켓 목록에서만 뺀다(봇 자체는 그대로)
//  ④ 소개 화면 질문 칩이 대화창으로 이동만 하고 질문은 안 보냈다 → 주소에 ask 를 실어 보낸다

/** OsShell DEMO_TEAM 의 mentorId 4개와 같다 (바뀌지 않는 id) */
export const DEMO_MENTOR_IDS: ReadonlySet<string> = new Set([
    '9fc9b3fa-1721-40c6-bc4e-1b544c117483', // 기획팀장
    'a5a7fc67-2238-4705-bcc7-505e52644e25', // 홍보팀장
    '91db92f7-5831-40a5-8941-4501fb543f56', // 개발팀장
    '94835097-6f27-4ee4-ab73-f423da271537', // 조사팀장
])

export function isDemoMentor(id: string | null | undefined): boolean {
    return !!id && DEMO_MENTOR_IDS.has(id)
}

/** 리더가 아닌 예시 봇 7명 (creator_id 없음). 지우지 않고 뒤로 보내 「예시」로 보인다 */
const SAMPLE_MARKET_IDS: ReadonlySet<string> = new Set([
    'b453ce4e-2bb3-4c10-8618-75037dcb292a', // 하선영
    '118bef35-26bc-4118-a446-aa96e977f9ee', // 오재현
    '509c022f-17aa-4f1a-8c86-6b8acfc8d170', // 서유경
    'ef9c3e97-2a7f-48e8-abde-75ff7a1ac5c3', // 남기훈
    '20728d0a-2aed-4c4c-bc48-f26be076d0bc', // 임보라
    '264ae26a-1b77-489c-abbd-9662b0b42e4c', // 유선희
    'f09dd647-a447-410e-b20d-f825f48341a7', // 노현석
])

/** 마켓 목록에서만 빼는 시험용 봇 */
const HIDDEN_MARKET_IDS: ReadonlySet<string> = new Set([
    '6c4f7434-01a5-4c37-9b52-efbc363e77d6', // 코덱스봇
])

export function isSampleMarketBot(id: string): boolean {
    return SAMPLE_MARKET_IDS.has(id)
}

/** 시험용은 빼고, 진짜 리더 봇 먼저 · 예시 봇은 뒤로 (각자 원래 순서 유지) */
export function arrangeMarket<T extends { id: string }>(list: T[]): T[] {
    const shown = list.filter(m => !HIDDEN_MARKET_IDS.has(m.id))
    return [...shown.filter(m => !isSampleMarketBot(m.id)), ...shown.filter(m => isSampleMarketBot(m.id))]
}

const ASK_MAX = 500

/** 대화 주소에 질문을 싣는다 (소개 화면 칩 → 대화창이 바로 보낸다) */
export function withAsk(href: string, question: string): string {
    const [path, query = ''] = href.split('?')
    const q = new URLSearchParams(query)
    q.set('ask', question)
    return `${path}?${q.toString()}`
}

/** 주소에서 ask 를 꺼내고, 남은 주소(새로고침 때 또 안 보내게)를 돌려준다 */
export function takeAsk(url: string): { ask: string | null; rest: string } {
    const u = new URL(url)
    const raw = u.searchParams.get('ask')
    u.searchParams.delete('ask')
    const ask = raw && raw.trim() ? raw.trim().slice(0, ASK_MAX) : null
    return { ask, rest: u.pathname + (u.search || '') + u.hash }
}
