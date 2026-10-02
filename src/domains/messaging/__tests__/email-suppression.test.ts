// 이메일 드라이버: SES 계정 반송·거부 명단 확인 (isSuppressedInSes)
import { describe, it, expect, beforeEach, vi } from 'vitest'

const state: { error: { name: string; message: string } | null; asked: unknown[] } = { error: null, asked: [] }
vi.mock('@aws-sdk/client-sesv2', () => ({
    SESv2Client: class {
        async send(cmd: { input: unknown }) {
            state.asked.push(cmd.input)
            if (state.error) { const e = new Error(state.error.message); e.name = state.error.name; throw e }
            return { SuppressedDestination: { EmailAddress: 'x', Reason: 'BOUNCE' } }
        }
    },
    SendEmailCommand: class { input: unknown; constructor(i: unknown) { this.input = i } },
    GetSuppressedDestinationCommand: class { input: unknown; constructor(i: unknown) { this.input = i } },
}))

beforeEach(() => {
    state.error = null; state.asked.length = 0
    process.env.SES_REGION = 'ap-northeast-2'; process.env.SES_FROM = 'noreply@curi-ai.com'
    process.env.AWS_ACCESS_KEY_ID = 'k'; process.env.AWS_SECRET_ACCESS_KEY = 's'
    vi.resetModules()
})

describe('isSuppressedInSes', () => {
    it('SES 가 명단에 있다고 하면 true', async () => {
        const { isSuppressedInSes } = await import('../drivers/email')
        expect(await isSuppressedInSes('fan@example.com')).toBe(true)
        expect(state.asked[0]).toEqual({ EmailAddress: 'fan@example.com' })
    })
    it('NotFoundException = 명단에 없음 → false (보낼 수 있다)', async () => {
        state.error = { name: 'NotFoundException', message: 'not found' }
        const { isSuppressedInSes } = await import('../drivers/email')
        expect(await isSuppressedInSes('fan@example.com')).toBe(false)
    })
    it('AccessDeniedException = 확인 못 함 → 던진다 (부르는 쪽이 503 으로 막는다)', async () => {
        state.error = { name: 'AccessDeniedException', message: 'not authorized to perform ses:GetSuppressedDestination' }
        const { isSuppressedInSes } = await import('../drivers/email')
        await expect(isSuppressedInSes('fan@example.com')).rejects.toThrow(/GetSuppressedDestination/)
    })
})
