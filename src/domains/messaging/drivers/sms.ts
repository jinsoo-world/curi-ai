// 문자 드라이버 — 회사가 이미 쓰는 솔라피(src/lib/sms.ts)를 그대로 쓴다.
// 돈 드는 채널. 관문(dispatch)이 SMS_ENABLED=true 일 때만 여기까지 보낸다. 여기서도 한 번 더 막는다.

import { sendSms, smsReady, normalizePhone } from '@/lib/sms'
import type { Driver, OutboundMessage, SendResult } from '../types'

export function smsEnabled(): boolean {
    return process.env.SMS_ENABLED === 'true'
}

export function createSmsDriver(): Driver {
    return {
        ready: () => smsEnabled() && smsReady(),
        async send(msg: OutboundMessage): Promise<SendResult> {
            if (!smsEnabled()) return { ok: false, error: '문자는 아직 준비 중이에요.' }
            const to = normalizePhone(msg.to)
            if (!to) return { ok: false, error: '받는 전화번호가 없거나 모양이 이상해요.' }
            const text = msg.subject ? `[${msg.subject}] ${msg.body}` : msg.body
            return sendSms(to, text)
        },
    }
}
