// 이메일 드라이버 — AWS SES(v2). 열쇠 넷이 없으면 준비 안 됨(관문이 blocked 로 기록만 한다).

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import type { Driver, OutboundMessage, SendResult } from '../types'

const REGION = process.env.SES_REGION
const FROM = process.env.SES_FROM
const KEY = process.env.AWS_ACCESS_KEY_ID
const SECRET = process.env.AWS_SECRET_ACCESS_KEY

export function emailReady(): boolean {
    return !!(REGION && FROM && KEY && SECRET)
}

let client: SESv2Client | null = null
function getClient(): SESv2Client {
    if (!client) client = new SESv2Client({ region: REGION!, credentials: { accessKeyId: KEY!, secretAccessKey: SECRET! } })
    return client
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 글만 있으면 줄바꿈을 살려 HTML 로 감싼다 */
export function textToHtml(text: string): string {
    return `<div style="font-family:-apple-system,Pretendard,sans-serif;font-size:16px;line-height:1.6;color:#111;white-space:pre-wrap">${escapeHtml(text)}</div>`
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function createEmailDriver(): Driver {
    return {
        ready: emailReady,
        async send(msg: OutboundMessage): Promise<SendResult> {
            if (!emailReady()) return { ok: false, error: '이메일 보낼 열쇠가 아직 연결되지 않았어요.' }
            const to = (msg.to ?? '').trim()
            if (!EMAIL_RE.test(to)) return { ok: false, error: '받는 이메일 주소가 없거나 모양이 이상해요.' }
            try {
                const r = await getClient().send(new SendEmailCommand({
                    FromEmailAddress: FROM!,
                    Destination: { ToAddresses: [to] },
                    Content: {
                        Simple: {
                            Subject: { Data: msg.subject ?? '큐리AI', Charset: 'UTF-8' },
                            Body: {
                                Text: { Data: msg.body, Charset: 'UTF-8' },
                                Html: { Data: msg.html ?? textToHtml(msg.body), Charset: 'UTF-8' },
                            },
                        },
                    },
                }))
                return { ok: true, id: r.MessageId }
            } catch (e) {
                console.error('[email] 실패', e instanceof Error ? e.message : e)
                return { ok: false, error: '이메일을 보내지 못했어요. 잠시 뒤 다시 해 주세요.' }
            }
        },
    }
}
