/**
 * 봇 공유 주소 — 봇 링크를 복사하거나 카톡으로 보낼 때 모두 이 함수 하나를 쓴다.
 *
 * 누가 퍼뜨렸는지(ref = 공유한 사람 추천코드)와 어느 봇이었는지(utm_content = 봇 주인 추천코드, 없으면 봇 id)를
 * 주소에 붙인다. 미들웨어가 ?ref= 를 curi_ref 쿠키에 담아 가입까지 이어 준다.
 */
export const BOT_SHARE_UTM = { source: 'bot_share', medium: 'share' } as const

export function buildBotShareUrl(o: {
    origin: string
    botId: string
    /** 봇 주인 추천코드 — 없으면 봇 id 를 대신 쓴다 */
    ownerCode?: string | null
    /** 공유한 사람 추천코드 — 비회원이면 비운다 */
    sharerCode?: string | null
}): string {
    const base = o.origin.replace(/\/+$/, '')
    const q = new URLSearchParams()
    if (o.sharerCode) q.set('ref', o.sharerCode)
    q.set('utm_source', BOT_SHARE_UTM.source)
    q.set('utm_medium', BOT_SHARE_UTM.medium)
    q.set('utm_content', o.ownerCode || o.botId)
    return `${base}/chat/${encodeURIComponent(o.botId)}?${q.toString()}`
}

/** 첫 봇 안내 카드를 한 번만 띄우기 위한 저장 이름 */
export const FIRST_BOT_CARD_KEY = 'curi_first_bot_share_shown'

/** 첫 봇 카드를 띄울지 — 내 봇이 딱 하나이고, 지금 그 봇 대화이고, 아직 안 띄웠을 때 */
export function shouldShowFirstBotCard(o: { myBotIds: string[]; currentBotId: string; alreadyShown: boolean }): boolean {
    return !o.alreadyShown && o.myBotIds.length === 1 && o.myBotIds[0] === o.currentBotId
}
