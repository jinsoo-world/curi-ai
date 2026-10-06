// 토스 웹훅이 진짜 토스에서 왔는지 확인하는 규칙 (2026-10-06).
//
// 토스 공식 방식 두 갈래:
//  ① 결제·취소 상태 웹훅(PAYMENT_STATUS_CHANGED · CANCEL_STATUS_CHANGED)에는 서명이 없다.
//     → 본문의 paymentKey 로 토스 결제 조회 API 를 서버가 다시 불러, 토스가 직접 알려 준 상태·금액만 쓴다(본문 값은 믿지 않는다).
//  ② 서명 머리글(tosspayments-webhook-signature)이 붙어 오는 이벤트(지급대행 등)는 서명을 검증한다.
//     서명 = HMAC-SHA256(보안 키, `${본문}:${tosspayments-webhook-transmission-time}`) 의 base64, 머리글 값 「v1:서명[,v1:서명]」.
//     보안 키 = 환경변수 TOSS_WEBHOOK_SECRET (토스 개발자센터 웹훅 보안 키).
import { createHmac, timingSafeEqual } from 'node:crypto'

export const TOSS_SIGNATURE_HEADER = 'tosspayments-webhook-signature'
export const TOSS_TRANSMISSION_TIME_HEADER = 'tosspayments-webhook-transmission-time'

export function verifyTossSignature(rawBody: string, signatureHeader: string | null, transmissionTime: string | null, secret: string | undefined): boolean {
    if (!signatureHeader || !transmissionTime || !secret) return false
    const expected = createHmac('sha256', secret).update(`${rawBody}:${transmissionTime}`).digest()
    return signatureHeader.split(',').some(part => {
        const v = part.trim().replace(/^v1:/, '')
        let given: Buffer
        try { given = Buffer.from(v, 'base64') } catch { return false }
        return given.length === expected.length && timingSafeEqual(given, expected)
    })
}
