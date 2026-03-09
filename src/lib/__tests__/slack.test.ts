import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    sendSlackNotification,
    buildPaymentStatusMessage,
    buildCancelStatusMessage,
    buildGeminiCostAlert,
} from '../slack'

describe('lib/slack', () => {
    describe('buildPaymentStatusMessage', () => {
        it('결제 완료 메시지 포맷', () => {
            const { text, blocks } = buildPaymentStatusMessage({
                paymentKey: 'pk-123',
                orderId: 'ord-123',
                status: 'DONE',
                totalAmount: 9900,
                method: '카드',
                orderName: '월간 구독',
                payer: {
                    userId: 'user-1',
                    displayName: '김큐리',
                    email: 'curi@test.com',
                },
            })

            expect(text).toContain('✅')
            expect(text).toContain('결제 완료')
            expect(text).toContain('9,900원')
            expect(text).toContain('김큐리')
            expect(blocks).toHaveLength(3) // header, section, context
        })

        it('금액 없는 경우 "금액 미상"', () => {
            const { text } = buildPaymentStatusMessage({
                status: 'DONE',
            })
            expect(text).toContain('금액 미상')
        })

        it('결제자 없는 경우 "(미확인)"', () => {
            const { text } = buildPaymentStatusMessage({
                status: 'DONE',
                totalAmount: 9900,
            })
            expect(text).toContain('(미확인)')
        })

        it('알 수 없는 상태', () => {
            const { text } = buildPaymentStatusMessage({
                status: 'UNKNOWN_STATUS',
                totalAmount: 5000,
            })
            expect(text).toContain('📌')
            expect(text).toContain('UNKNOWN_STATUS')
        })

        it.each([
            ['DONE', '✅', '결제 완료'],
            ['CANCELED', '🔴', '결제 취소'],
            ['ABORTED', '⛔', '결제 중단'],
            ['EXPIRED', '⏰', '결제 만료'],
        ])('상태 %s → 이모지 %s, 라벨 %s', (status, emoji, label) => {
            const { text } = buildPaymentStatusMessage({ status, totalAmount: 1000 })
            expect(text).toContain(emoji)
            expect(text).toContain(label)
        })
    })

    describe('buildCancelStatusMessage', () => {
        it('취소 메시지 포맷', () => {
            const { text, blocks } = buildCancelStatusMessage({
                paymentKey: 'pk-123',
                orderId: 'ord-123',
                cancelAmount: 9900,
                cancelReason: '사용자 요청',
                payer: {
                    userId: 'user-1',
                    displayName: '김큐리',
                    email: 'curi@test.com',
                },
            })

            expect(text).toContain('🔴')
            expect(text).toContain('9,900')
            expect(text).toContain('김큐리')
            expect(blocks).toHaveLength(3)
        })
    })

    describe('sendSlackNotification', () => {
        it('webhook URL 미설정 시 graceful skip', async () => {
            const original = process.env.SLACK_WEBHOOK_URL
            delete process.env.SLACK_WEBHOOK_URL

            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })

            await sendSlackNotification('test message')

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('SLACK_WEBHOOK_URL')
            )

            warnSpy.mockRestore()
            if (original) process.env.SLACK_WEBHOOK_URL = original
        })
    })

    describe('buildGeminiCostAlert', () => {
        it('임계치 미만: 정상 상태', () => {
            const { text, isOver } = buildGeminiCostAlert(30, 50)
            expect(text).toContain('🟡')
            expect(text).toContain('60%')
            expect(isOver).toBe(false)
        })

        it('임계치 초과: 경고 상태', () => {
            const { text, isOver } = buildGeminiCostAlert(55, 50)
            expect(text).toContain('🔴')
            expect(text).toContain('110%')
            expect(isOver).toBe(true)
        })

        it('기본 임계치 $50', () => {
            const { text } = buildGeminiCostAlert(25)
            expect(text).toContain('$50')
        })
    })
})
