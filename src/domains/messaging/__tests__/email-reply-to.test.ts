// 이메일 드라이버: 답장 주소(Reply-To)를 넘기면 SES 에 실어 보낸다 (고객센터 알림, 1002)
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sent: unknown[] = []
vi.mock('@aws-sdk/client-sesv2', () => ({
    SESv2Client: class { async send(cmd: { input: unknown }) { sent.push(cmd.input); return { MessageId: 'm1' } } },
    SendEmailCommand: class { input: unknown; constructor(i: unknown) { this.input = i } },
}))

beforeEach(() => {
    sent.length = 0
    process.env.SES_REGION = 'ap-northeast-2'; process.env.SES_FROM = 'noreply@curi-ai.com'
    process.env.AWS_ACCESS_KEY_ID = 'k'; process.env.AWS_SECRET_ACCESS_KEY = 's'
    vi.resetModules()
})

describe('email driver replyTo', () => {
    it('replyTo 가 있으면 ReplyToAddresses 로 보낸다', async () => {
        const { createEmailDriver } = await import('../drivers/email')
        const r = await createEmailDriver().send({ channel: 'email', userId: 'x', to: 'curious@mission-driven.kr', body: '안녕', replyTo: 'fan@example.com' })
        expect(r.ok).toBe(true)
        expect((sent[0] as { ReplyToAddresses?: string[] }).ReplyToAddresses).toEqual(['fan@example.com'])
    })
    it('없으면 넣지 않는다', async () => {
        const { createEmailDriver } = await import('../drivers/email')
        await createEmailDriver().send({ channel: 'email', userId: 'x', to: 'curious@mission-driven.kr', body: '안녕' })
        expect((sent[0] as { ReplyToAddresses?: string[] }).ReplyToAddresses).toBeUndefined()
    })
})
