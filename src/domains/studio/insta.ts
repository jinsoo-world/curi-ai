// 인스타 프로필 사진 만들기 — 대표 지시 2026-09-14 「인스타 프로필 생성기도 하나 만들어줘」
//
// 전문가 프로필 사진과 무엇이 다른가
//  · 전문가용 = 증명사진처럼 반듯하게, 세로 4:5, 정장·사무실
//  · 인스타용 = **정사각형**이고 화면에서 **동그랗게 잘려 보인다**. 그래서 얼굴을 조금 크게
//    잡고, 가장자리에 중요한 것이 걸리지 않게 해야 한다. 분위기도 밝고 개성 있게.

export interface InstaChoice { id: string; label: string; prompt: string }

/** 분위기 */
export const MOODS: InstaChoice[] = [
    { id: 'bright', label: '밝고 환하게', prompt: 'bright cheerful mood, soft high-key lighting, warm genuine smile' },
    { id: 'calm', label: '차분하고 단정하게', prompt: 'calm composed mood, soft even lighting, gentle closed-mouth smile' },
    { id: 'chic', label: '세련되게', prompt: 'modern chic mood, clean directional light with soft contrast, confident relaxed expression' },
    { id: 'warm', label: '따뜻하고 친근하게', prompt: 'warm friendly mood, golden soft light, open approachable smile' },
]

/** 배경 색 */
export const TONES: InstaChoice[] = [
    { id: 'cream', label: '크림색', prompt: 'smooth solid cream beige background' },
    { id: 'grey', label: '연회색', prompt: 'smooth solid light grey background' },
    { id: 'green', label: '연한 초록', prompt: 'smooth solid soft sage green background' },
    { id: 'blue', label: '연한 하늘', prompt: 'smooth solid pastel sky blue background' },
]

export function getMood(id: string) { return MOODS.find(m => m.id === id) }
export function getTone(id: string) { return TONES.find(t => t.id === id) }
export function isValidMood(v: unknown): v is string { return typeof v === 'string' && MOODS.some(m => m.id === v) }
export function isValidTone(v: unknown): v is string { return typeof v === 'string' && TONES.some(t => t.id === v) }

/**
 * 인스타 프로필용 지시문.
 * ⚠️ 「동그랗게 잘려도 괜찮게」와 「같은 사람·같은 나이」를 반드시 넣는다.
 */
export function buildInstaPrompt(mood: InstaChoice, tone: InstaChoice): string {
    return [
        'Retouch this person into a clean social media profile picture.',
        `Mood: ${mood.prompt}.`,
        `Background: ${tone.prompt}, no clutter, no props.`,
        'Square 1:1 composition. Head and shoulders centered, with comfortable margin around the head',
        'so the image still looks right when cropped into a circle.',
        'Keep the same face, same age, same identity as the uploaded photo — this must clearly look like the same person.',
        'Do not make the subject look younger. Keep natural skin texture, pores and fine lines.',
        'Sharp focus on the eyes, looking at the lens.',
        'No text, no logos, no watermark, no extra hands. Avoid glossy over-retouched AI look.',
    ].join(' ')
}
