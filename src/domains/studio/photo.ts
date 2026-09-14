// 전문가 프로필 사진 만들기 — 고르는 값과 프롬프트 조립
//
// 대표 지시 2026-09-14 = 「전문가 수준의 프로필 사진 제작하는 기능도 넣어줘」
// 참고 = ai.pfpmaker.com 은 성별을 먼저 고르게 하고 그 뒤에 차림새·배경을 연다.
// 우리는 중장년 대상이라 고를 것을 더 줄였다(차림새 4가지 · 배경 4가지).

/** 사진 한 장 만드는 데 드는 클로버 */
export const PHOTO_COST = 20

export interface Choice {
    id: string
    label: string
    prompt: string
    /** 화면에 보일 색 — 글자만 있으면 무엇이 다른지 안 보인다 */
    swatch: string
    /** 배경용 그라데이션 */
    bg?: string
}

/** 차림새 */
export const STYLES: Choice[] = [
    { id: 'suit', label: '정장', prompt: 'wearing a well-tailored dark navy suit with a crisp white shirt', swatch: '#1e293b' },
    { id: 'jacket', label: '재킷', prompt: 'wearing a soft unstructured blazer over a fine knit top, business casual', swatch: '#475569' },
    { id: 'knit', label: '단정한 니트', prompt: 'wearing a clean solid-color knit sweater, neat and approachable', swatch: '#92400e' },
    { id: 'shirt', label: '셔츠', prompt: 'wearing a crisp button-up shirt, collar open, no tie', swatch: '#bfdbfe' },
]

/** 배경 */
export const BACKDROPS: Choice[] = [
    { id: 'studio', label: '스튜디오', prompt: 'plain light grey studio backdrop, even softbox lighting', swatch: '#e5e7eb', bg: 'linear-gradient(140deg,#f8fafc,#d1d5db)' },
    { id: 'office', label: '사무실', prompt: 'modern bright office interior softly blurred in the background', swatch: '#cbd5e1', bg: 'linear-gradient(140deg,#eff6ff,#94a3b8)' },
    { id: 'bookshelf', label: '책장', prompt: 'a warm home study with a blurred bookshelf behind', swatch: '#b45309', bg: 'linear-gradient(140deg,#fef3c7,#92400e)' },
    { id: 'outdoor', label: '야외', prompt: 'soft outdoor daylight with blurred green foliage behind', swatch: '#65a30d', bg: 'linear-gradient(140deg,#ecfccb,#4d7c0f)' },
]

export function getStyle(id: string) { return STYLES.find(s => s.id === id) }
export function getBackdrop(id: string) { return BACKDROPS.find(b => b.id === id) }
export function isValidStyle(v: unknown): v is string { return typeof v === 'string' && STYLES.some(s => s.id === v) }
export function isValidBackdrop(v: unknown): v is string { return typeof v === 'string' && BACKDROPS.some(b => b.id === v) }

/**
 * 사진 만들 때 AI 에게 보낼 글.
 * ⚠️ 「같은 사람으로 보이게」와 「젊게 만들지 말 것」을 반드시 넣는다.
 *    안 넣으면 딴사람이 나오거나 20~30대처럼 나온다.
 */
export function buildPhotoPrompt(style: Choice, backdrop: Choice, ratioLabel = '4:5'): string {
    return [
        'Retouch this person into a professional headshot portrait.',
        `The subject is ${style.prompt}.`,
        `Background: ${backdrop.prompt}.`,
        'Keep the same face, same age, same identity as the uploaded photo — this must clearly look like the same person.',
        'Do not make the subject look younger. Keep natural skin texture, pores and fine lines.',
        'Professional headshot lighting, eye level, looking at the lens, sharp focus on the eyes.',
        `Upper body, ${ratioLabel} composition suitable for a profile picture.`,
        'No text, no logos, no watermark, no extra hands. Avoid glossy over-retouched AI look.',
    ].join(' ')
}
