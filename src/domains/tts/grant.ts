// 음성 통화용 「읽기표」.
// 통화 중에는 봇 답이 아직 저장되기 전(스트리밍 중)에 문장 단위로 소리를 만든다.
// 그래서 서버가 답 조각을 내려줄 때 「이 글은 우리 봇이 이 사람에게 한 말」이라는
// 도장(HMAC)을 같이 찍어 보내고, /api/tts 는 그 도장이 맞는 글 안의 문장만 읽는다.
//
// 길이 제한 = 도장은 「지금까지의 답 전체」가 아니라 최근 창(GRANT_WINDOW 자)에 찍는다.
// 그래서 답이 4,000자를 넘어도 서명이 끊기지 않는다(조각 단위 서명). from = 창이 답의 몇 번째 글자에서 시작하는지(0이면 답의 맨 처음).
import { createHmac, timingSafeEqual } from 'crypto'

/** 도장이 살아 있는 시간(통화 한 번에 충분한 길이) */
export const GRANT_TTL_MS = 15 * 60 * 1000
/** 도장을 찍는 창(최근 글) 최대 길이 */
export const GRANT_WINDOW = 2000
/** 검증할 때 받아주는 글 최대 길이 */
export const GRANT_TEXT_MAX = 2200

/** 열쇠 = TTS_GRANT_SECRET 이 있으면 그것, 없으면 예전 파생 방식(호환) */
function secret(): string | null {
    if (process.env.TTS_GRANT_SECRET) return `tts-grant-v2:${process.env.TTS_GRANT_SECRET}`
    const base = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CRON_SECRET
    return base ? `tts-grant:${base}` : null
}

function mac(userId: string, mentorId: string, ts: number, from: number, text: string): string | null {
    const key = secret()
    if (!key) return null
    return createHmac('sha256', key).update(`${userId}\n${mentorId}\n${ts}\n${from}\n${text}`).digest('hex')
}

export interface Grant { ts: number; sig: string; from: number }

/** 봇이 지금까지 한 말(answer) 중 최근 창에 도장을 찍는다. 열쇠가 없으면 null(통화 읽기 꺼짐). */
export function signGrant(userId: string, mentorId: string, answer: string, now = Date.now()): Grant | null {
    // 창 시작은 공백 뒤로 맞춘다(문장 중간에서 잘리지 않게)
    let from = Math.max(0, answer.length - GRANT_WINDOW)
    if (from > 0) {
        const sp = answer.indexOf(' ', from)
        from = sp === -1 ? answer.length : sp + 1
    }
    const sig = mac(userId, mentorId, now, from, answer.slice(from))
    return sig ? { ts: now, sig, from } : null
}

/** 도장이 진짜이고 아직 살아 있는지. text 는 answer.slice(from) */
export function verifyGrant(userId: string, mentorId: string, grant: { text: unknown; ts: unknown; sig: unknown; from: unknown }, now = Date.now()): boolean {
    const { text, ts, sig, from } = grant
    if (typeof text !== 'string' || typeof ts !== 'number' || typeof sig !== 'string') return false
    if (typeof from !== 'number' || !Number.isInteger(from) || from < 0) return false
    if (text.length > GRANT_TEXT_MAX) return false
    if (now - ts > GRANT_TTL_MS || ts > now + 60_000) return false
    const expected = mac(userId, mentorId, ts, from, text)
    if (!expected) return false
    const a = Buffer.from(expected)
    const b = Buffer.from(sig)
    return a.length === b.length && timingSafeEqual(a, b)
}
