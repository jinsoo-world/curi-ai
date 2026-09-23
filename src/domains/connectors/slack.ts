// domains/connectors — 슬랙 연결 (보내기).
//
// 어떻게 붙나 = 사용자가 자기 슬랙에서 「들어오는 웹훅(Incoming Webhook)」을 만들고 그 주소를 붙여 넣는다.
// 그 주소 하나가 「이 방에 글 올릴 수 있는 열쇠」라서 DB 에 잠가서 넣는다(crypto.ts).
//
// 🚨 슬랙에 글을 올리는 것은 **되돌릴 수 없는 일**이다(올라간 글은 남들이 이미 봤다).
//    그래서 도구 이름 `slack_post` 는 tool-gate 의 「되돌릴 수 없는 목록」에 있고,
//    사람이 허용한 승인 카드(permission_requests.status = allowed|edited_allowed) 없이는 절대 나가지 않는다.
//    이 파일의 함수를 직접 부르지 말고 항상 gateTool 을 지난 뒤에 부른다.

const TIMEOUT_MS = 8_000

/** 슬랙이 준 진짜 웹훅 주소인가 (아무 주소나 넣으면 우리 서버가 남의 서버를 대신 두드린다 = SSRF) */
export function isSlackWebhookUrl(raw: string): boolean {
    let u: URL
    try { u = new URL(String(raw ?? '').trim()) } catch { return false }
    return u.protocol === 'https:'
        && u.hostname.toLowerCase() === 'hooks.slack.com'
        && u.pathname.startsWith('/services/')
        && u.pathname.length > '/services/'.length + 10
}

/** 화면에 보여 줄 짧은 이름 (주소 전체는 다시 안 보여 준다) */
export function slackWebhookHint(raw: string): string {
    const tail = String(raw ?? '').split('/').filter(Boolean).pop() ?? ''
    return tail ? `••••${tail.slice(-4)}` : '••••'
}

/** 슬랙이 한 번에 받는 글 길이 */
export const SLACK_MAX_CHARS = 3_000

export interface SlackPostResult { ok: boolean; error?: string }

/**
 * 되돌릴 수 없는 도구 `slack_post` — 슬랙 방에 글 한 줄 올리기.
 * ⚠️ 부르기 전에 반드시 gateTool 로 승인 카드를 확인한다.
 */
export async function slackPost(webhookUrl: string, text: string): Promise<SlackPostResult> {
    if (!isSlackWebhookUrl(webhookUrl)) return { ok: false, error: '슬랙 웹훅 주소가 아니에요' }
    const body = String(text ?? '').trim().slice(0, SLACK_MAX_CHARS)
    if (!body) return { ok: false, error: '보낼 글이 비어 있어요' }
    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: body }),
        })
        if (!res.ok) {
            const why = await res.text().catch(() => '')
            return { ok: false, error: `슬랙이 받지 않았어요(${res.status} ${why.slice(0, 60)})` }
        }
        return { ok: true }
    } catch {
        return { ok: false, error: '슬랙에 닿지 못했어요. 잠시 뒤 다시 해 주세요' }
    }
}

/** 연결 확인 — 진짜로 글을 한 줄 올려 본다(웹훅은 확인만 하는 길이 없다) */
export async function slackPing(webhookUrl: string): Promise<SlackPostResult> {
    return slackPost(webhookUrl, '큐리AI 연결 확인이에요. 이 글이 보이면 연결된 거예요 🍀')
}
