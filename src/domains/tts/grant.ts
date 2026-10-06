// 음성 통화용 「읽기표」.
// 통화 중에는 봇 답이 아직 저장되기 전(스트리밍 중)에 문장 단위로 소리를 만든다.
// 그래서 서버가 답 조각을 내려줄 때 「이 글은 우리 봇이 이 사람에게 한 말」이라는
// 도장(HMAC)을 같이 찍어 보내고, /api/tts 는 그 도장이 맞는 글 안의 문장만 읽는다.
import { createHmac, timingSafeEqual } from 'crypto'

/** 도장이 살아 있는 시간(통화 한 번에 충분한 길이) */
export const GRANT_TTL_MS = 15 * 60 * 1000
/** 도장을 찍는 글(지금까지의 봇 답) 최대 길이 */
export const GRANT_TEXT_MAX = 4000

function secret(): string | null {
    const base = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CRON_SECRET
    return base ? `tts-grant:${base}` : null
}

function mac(userId: string, mentorId: string, ts: number, text: string): string | null {
    const key = secret()
    if (!key) return null
    return createHmac('sha256', key).update(`${userId}\n${mentorId}\n${ts}\n${text}`).digest('hex')
}

/** 봇이 지금까지 한 말(text)에 도장을 찍는다. 열쇠가 없으면 null(통화 읽기 꺼짐). */
export function signGrant(userId: string, mentorId: string, text: string, now = Date.now()): { ts: number; sig: string } | null {
    if (text.length > GRANT_TEXT_MAX) return null
    const sig = mac(userId, mentorId, now, text)
    return sig ? { ts: now, sig } : null
}

/** 도장이 진짜이고 아직 살아 있는지 */
export function verifyGrant(userId: string, mentorId: string, grant: { text: unknown; ts: unknown; sig: unknown }, now = Date.now()): boolean {
    const { text, ts, sig } = grant
    if (typeof text !== 'string' || typeof ts !== 'number' || typeof sig !== 'string') return false
    if (text.length > GRANT_TEXT_MAX) return false
    if (now - ts > GRANT_TTL_MS || ts > now + 60_000) return false
    const expected = mac(userId, mentorId, ts, text)
    if (!expected) return false
    const a = Buffer.from(expected)
    const b = Buffer.from(sig)
    return a.length === b.length && timingSafeEqual(a, b)
}
