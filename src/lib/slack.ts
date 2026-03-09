// 큐리 AI — Slack Incoming Webhook 유틸리티

interface SlackBlock {
    type: string
    text?: { type: string; text: string; emoji?: boolean }
    elements?: Array<{ type: string; text: string; emoji?: boolean }>
    fields?: Array<{ type: string; text: string }>
}

/**
 * Slack Incoming Webhook으로 메시지 전송
 */
export async function sendSlackNotification(
    text: string,
    blocks?: SlackBlock[],
) {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) {
        console.warn('[Slack] SLACK_WEBHOOK_URL 미설정 — 알림 건너뜀')
        return
    }

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, blocks }),
        })

        if (!res.ok) {
            console.error('[Slack] 전송 실패:', res.status, await res.text())
        }
    } catch (error) {
        console.error('[Slack] 전송 오류:', error)
    }
}

// ── 결제 알림 헬퍼 ──

const STATUS_EMOJI: Record<string, string> = {
    DONE: '✅',
    CANCELED: '🔴',
    PARTIAL_CANCELED: '🟠',
    ABORTED: '⛔',
    EXPIRED: '⏰',
    WAITING_FOR_DEPOSIT: '⏳',
    IN_PROGRESS: '🔄',
    READY: '📋',
}

const STATUS_LABEL: Record<string, string> = {
    DONE: '결제 완료',
    CANCELED: '결제 취소',
    PARTIAL_CANCELED: '부분 취소',
    ABORTED: '결제 중단',
    EXPIRED: '결제 만료',
    WAITING_FOR_DEPOSIT: '입금 대기',
    IN_PROGRESS: '진행 중',
    READY: '준비됨',
}

export function buildPaymentStatusMessage(data: {
    paymentKey?: string
    orderId?: string
    status?: string
    totalAmount?: number
    method?: string
    orderName?: string
    payer?: { userId: string; displayName: string; email: string }
}) {
    const emoji = STATUS_EMOJI[data.status || ''] || '📌'
    const label = STATUS_LABEL[data.status || ''] || data.status || '알 수 없음'
    const amount = data.totalAmount
        ? `${data.totalAmount.toLocaleString()}원`
        : '금액 미상'
    const payerName = data.payer ? `${data.payer.displayName} (${data.payer.email})` : '(미확인)'

    const text = `${emoji} [결제 상태 변경] ${label} — ${amount} / ${payerName}`

    const blocks: SlackBlock[] = [
        {
            type: 'header',
            text: { type: 'plain_text', text: `${emoji} 결제 상태 변경: ${label}`, emoji: true },
        },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: `*결제자:*\n${data.payer ? `${data.payer.displayName}` : '-'}` },
                { type: 'mrkdwn', text: `*이메일:*\n${data.payer?.email || '-'}` },
                { type: 'mrkdwn', text: `*주문명:*\n${data.orderName || '-'}` },
                { type: 'mrkdwn', text: `*금액:*\n${amount}` },
                { type: 'mrkdwn', text: `*주문번호:*\n${data.orderId || '-'}` },
                { type: 'mrkdwn', text: `*결제수단:*\n${data.method || '-'}` },
            ],
        },
        {
            type: 'context',
            elements: [
                { type: 'mrkdwn', text: `paymentKey: \`${data.paymentKey || '-'}\`` },
                { type: 'mrkdwn', text: `${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` },
            ],
        },
    ]

    return { text, blocks }
}

export function buildCancelStatusMessage(data: {
    paymentKey?: string
    orderId?: string
    cancelAmount?: number
    cancelReason?: string
    payer?: { userId: string; displayName: string; email: string }
}) {
    const payerName = data.payer ? `${data.payer.displayName} (${data.payer.email})` : '(미확인)'
    const text = `🔴 [취소 상태 변경] ${data.orderId} — ${data.cancelAmount?.toLocaleString() || '?'}원 / ${payerName}`

    const blocks: SlackBlock[] = [
        {
            type: 'header',
            text: { type: 'plain_text', text: '🔴 결제 취소 상태 변경', emoji: true },
        },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: `*결제자:*\n${data.payer ? `${data.payer.displayName} (${data.payer.email})` : '-'}` },
                { type: 'mrkdwn', text: `*주문번호:*\n${data.orderId || '-'}` },
                { type: 'mrkdwn', text: `*취소 금액:*\n${data.cancelAmount?.toLocaleString() || '?'}원` },
                { type: 'mrkdwn', text: `*취소 사유:*\n${data.cancelReason || '-'}` },
            ],
        },
        {
            type: 'context',
            elements: [
                { type: 'mrkdwn', text: `paymentKey: \`${data.paymentKey || '-'}\`` },
                { type: 'mrkdwn', text: `${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` },
            ],
        },
    ]

    return { text, blocks }
}

// ── 에러 알림 헬퍼 ──

/**
 * API 에러 발생 시 슬랙 알림 (서버 에러, 결제 실패 등)
 */
export async function sendErrorAlert(data: {
    source: string
    error: string
    userId?: string
    metadata?: Record<string, unknown>
}) {
    const text = `🚨 [에러 알림] ${data.source}: ${data.error}`
    const blocks: SlackBlock[] = [
        {
            type: 'header',
            text: { type: 'plain_text', text: `🚨 에러 발생: ${data.source}`, emoji: true },
        },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: `*에러:*\n\`${data.error}\`` },
                { type: 'mrkdwn', text: `*유저ID:*\n${data.userId || '-'}` },
            ],
        },
        {
            type: 'context',
            elements: [
                { type: 'mrkdwn', text: `${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` },
                ...(data.metadata ? [{ type: 'mrkdwn', text: `메타: \`${JSON.stringify(data.metadata)}\`` }] : []),
            ],
        },
    ]
    await sendSlackNotification(text, blocks)
}

/**
 * Gemini API 비용 임계치 알림 메시지 빌더
 * @param currentCost - 현재 누적 비용 (USD)
 * @param threshold - 임계치 (기본 $50)
 */
export function buildGeminiCostAlert(currentCost: number, threshold: number = 50) {
    const isOver = currentCost >= threshold
    const emoji = isOver ? '🔴' : '🟡'
    const text = `${emoji} [Gemini 비용] $${currentCost.toFixed(2)} / $${threshold} (${((currentCost / threshold) * 100).toFixed(0)}%)`

    const blocks: SlackBlock[] = [
        {
            type: 'header',
            text: { type: 'plain_text', text: `${emoji} Gemini API 비용 알림`, emoji: true },
        },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: `*현재 비용:*\n$${currentCost.toFixed(2)}` },
                { type: 'mrkdwn', text: `*임계치:*\n$${threshold}` },
                { type: 'mrkdwn', text: `*사용률:*\n${((currentCost / threshold) * 100).toFixed(0)}%` },
                { type: 'mrkdwn', text: `*상태:*\n${isOver ? '⚠️ 초과!' : '정상'}` },
            ],
        },
    ]

    return { text, blocks, isOver }
}
