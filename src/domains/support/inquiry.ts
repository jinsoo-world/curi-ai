// 고객센터 문의 (2026-10-02). 앱스토어 심사가 요구하는 「지원 주소」가 진짜 연락 창구로 이어지게 한다.
// 화면(/support), 창구(/api/support/inquiry), 관리자 목록(/admin/os/inquiries)이 같이 쓴다.

export const SUPPORT_EMAIL = 'curious@mission-driven.kr'

export const INQUIRY_CATEGORIES = [
    { value: 'account', label: '계정' },
    { value: 'billing', label: '결제와 환불' },
    { value: 'bot', label: '봇과 대화' },
    { value: 'report', label: '신고' },
    { value: 'other', label: '기타' },
] as const

export type InquiryCategory = (typeof INQUIRY_CATEGORIES)[number]['value']

export const INQUIRY_STATUSES = ['open', 'answered', 'closed'] as const
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number]

export const BODY_MIN = 10
export const BODY_MAX = 2000
const PLATFORMS = ['ios', 'android', 'web'] as const
const VERSION_RE = /^[0-9A-Za-z.+-]{1,32}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface InquiryInput {
    category: InquiryCategory
    email: string
    body: string
    platform: string | null
    appVersion: string | null
}

export function categoryLabel(v: string): string {
    return INQUIRY_CATEGORIES.find(c => c.value === v)?.label ?? v
}

export function validateInquiry(raw: unknown): { ok: true; value: InquiryInput } | { ok: false; error: string } {
    const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const category = String(b.category ?? '')
    if (!INQUIRY_CATEGORIES.some(c => c.value === category)) return { ok: false, error: '문의 유형을 골라 주세요' }
    const email = String(b.email ?? '').trim().toLowerCase()
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, error: '답을 받을 이메일 주소를 확인해 주세요' }
    const body = String(b.body ?? '').trim()
    if (body.length < BODY_MIN) return { ok: false, error: `내용을 ${BODY_MIN}자 이상 적어 주세요` }
    if (body.length > BODY_MAX) return { ok: false, error: `내용은 ${BODY_MAX}자까지 적을 수 있어요` }
    const p = String(b.platform ?? '').trim().toLowerCase()
    const platform = (PLATFORMS as readonly string[]).includes(p) ? p : null
    const v = String(b.appVersion ?? '').trim()
    const appVersion = VERSION_RE.test(v) ? v : null
    return { ok: true, value: { category: category as InquiryCategory, email, body, platform, appVersion } }
}

/** 고객센터 메일로 보낼 알림 글. 내용은 앞 300자만 */
export function notificationText(i: InquiryInput): { subject: string; body: string } {
    const preview = i.body.length > 300 ? `${i.body.slice(0, 300)}…` : i.body
    return {
        subject: `[큐리AI 문의] ${categoryLabel(i.category)}`,
        body: [
            `유형: ${categoryLabel(i.category)}`,
            `이메일: ${i.email}`,
            i.platform ? `앱: ${i.platform} ${i.appVersion ?? ''}`.trim() : null,
            '',
            preview,
            '',
            '전체 내용과 처리는 관리자 화면 /admin/os/inquiries 에서 봐요.',
        ].filter(l => l !== null).join('\n'),
    }
}
