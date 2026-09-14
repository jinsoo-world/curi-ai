/**
 * 문자 보내기 — 솔라피
 *
 * 대표 지시 2026-09-14 = 「무료체험권은 휴대폰 인증하게 해」
 *
 * 회사가 이미 쓰는 솔라피를 그대로 쓴다. 열쇠 셋이 없으면 조용히 성공한 척하지 않고
 * 분명히 실패를 돌려준다(열쇠가 빠진 채로 배포되면 아무도 인증을 못 받는데,
 * 조용히 실패하면 그 사실을 며칠 뒤에야 알게 된다).
 */
import crypto from 'crypto'

const KEY = process.env.SOLAPI_API_KEY
const SECRET = process.env.SOLAPI_API_SECRET
const SENDER = process.env.SOLAPI_SENDER_NUMBER

export function smsReady(): boolean {
    return !!(KEY && SECRET && SENDER)
}

function auth(): string {
    const date = new Date().toISOString()
    const salt = crypto.randomBytes(16).toString('hex')
    const sig = crypto.createHmac('sha256', SECRET!).update(date + salt).digest('hex')
    return `HMAC-SHA256 apiKey=${KEY}, date=${date}, salt=${salt}, signature=${sig}`
}

/** 국내 번호만 받는다. 010xxxxxxxx 꼴로 다듬는다 */
export function normalizePhone(raw: unknown): string | null {
    if (typeof raw !== 'string') return null
    const only = raw.replace(/[^0-9]/g, '')
    if (/^01[0-9]{8,9}$/.test(only)) return only
    if (/^8201[0-9]{8,9}$/.test(only)) return '0' + only.slice(2)
    return null
}

export async function sendSms(to: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!smsReady()) return { ok: false, error: '문자 보내는 열쇠가 아직 연결되지 않았어요.' }

    try {
        const res = await fetch('https://api.solapi.com/messages/v4/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: auth() },
            body: JSON.stringify({ message: { to, from: SENDER, text } }),
            signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) {
            const body = await res.text().catch(() => '')
            console.error('[sms] 실패', res.status, body.slice(0, 200))
            return { ok: false, error: '문자를 보내지 못했어요. 잠시 뒤 다시 해주세요.' }
        }
        return { ok: true }
    } catch (e) {
        console.error('[sms] 오류', e)
        return { ok: false, error: '문자를 보내지 못했어요. 잠시 뒤 다시 해주세요.' }
    }
}
