// domains/chat — 안전 가드레일 (위기상담 감지)

/**
 * 위기 상황 키워드 목록
 * 자살, 자해, 극단적 감정 표현 감지
 */
const CRISIS_KEYWORDS = [
    '죽고싶', '죽고 싶', '자살', '자해',
    '살고싶지않', '살고 싶지 않',
    '세상을 떠나', '목숨을 끊',
    '더이상 못살', '더 이상 못 살',
    '극단적', '유서',
]

/**
 * 위기 상담 안내 메시지 (멘토 톤)
 */
export const CRISIS_RESPONSE = `잠깐, 지금 많이 힘드신 것 같아서 걱정됩니다.

혼자 감당하지 않으셔도 돼요. 전문가의 도움을 받으실 수 있습니다.

📞 **자살예방상담전화 1393** (24시간)
📞 **정신건강위기상담전화 1577-0199**
📱 **카카오톡 상담**: 마음이음

저는 AI 멘토라 전문 상담을 드리기 어렵지만, 위 번호로 연락하시면 즉시 도움받으실 수 있어요.

언제든 다시 찾아와 주세요. 응원하고 있습니다. 💚`

/**
 * 사용자 메시지에 위기 키워드가 포함되어 있는지 확인
 */
export function detectCrisisKeywords(message: string): boolean {
    const normalized = message.replace(/\s+/g, '')
    return CRISIS_KEYWORDS.some(keyword =>
        normalized.includes(keyword.replace(/\s+/g, ''))
    )
}

/**
 * 에러 메시지 (멘토 톤)
 */
export const ERROR_MESSAGES = {
    /** 스트리밍 중 에러 */
    streamError: '앗, 잠깐 생각이 꼬였어요 😅 다시 한번 말씀해주실래요?',
    /** 서버 에러 (500) */
    serverError: '앗, 지금 제가 좀 바쁜가봐요. 잠시 후에 다시 시도해주세요!',
    /** 무료 대화 소진 */
    freeUsageExhausted: (remaining: number) =>
        remaining <= 2
            ? `오늘 무료 대화가 ${remaining}회 남았어요! 더 많은 대화를 원하시면 구독을 살펴보세요 😊`
            : '',
    /** 무료 대화 완전 소진 */
    freeUsageDone: '오늘의 무료 대화를 다 사용하셨어요! 🙏\n내일 다시 만나요, 아니면 프리미엄 구독으로 하루 500회 대화를 즐겨보세요 ✨\n\n👉 /pricing 에서 구독 플랜을 확인해보세요!',
} as const
