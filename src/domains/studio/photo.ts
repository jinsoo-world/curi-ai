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
    /** 실제로 만들어본 예시 사진 */
    sample?: string
}

/** 차림새 */
export const STYLES: Choice[] = [
    { sample: '/samples/style-suit.webp', id: 'suit', label: '정장', prompt: 'wearing a well-tailored dark navy suit with a crisp white shirt', swatch: '#1e293b' },
    { sample: '/samples/style-jacket.webp', id: 'jacket', label: '재킷', prompt: 'wearing a soft unstructured blazer over a fine knit top, business casual', swatch: '#475569' },
    { sample: '/samples/style-knit.webp', id: 'knit', label: '단정한 니트', prompt: 'wearing a clean solid-color knit sweater, neat and approachable', swatch: '#92400e' },
    { sample: '/samples/style-shirt.webp', id: 'shirt', label: '셔츠', prompt: 'wearing a crisp button-up shirt, collar open, no tie', swatch: '#bfdbfe' },
]

/** 배경 */
export const BACKDROPS: Choice[] = [
    { sample: '/samples/bg-studio.webp', id: 'studio', label: '스튜디오', prompt: 'plain light grey studio backdrop, even softbox lighting', swatch: '#e5e7eb', bg: 'linear-gradient(140deg,#f8fafc,#d1d5db)' },
    { sample: '/samples/bg-office.webp', id: 'office', label: '사무실', prompt: 'modern bright office interior softly blurred in the background', swatch: '#cbd5e1', bg: 'linear-gradient(140deg,#eff6ff,#94a3b8)' },
    { sample: '/samples/bg-bookshelf.webp', id: 'bookshelf', label: '책장', prompt: 'a warm home study with a blurred bookshelf behind', swatch: '#b45309', bg: 'linear-gradient(140deg,#fef3c7,#92400e)' },
    { sample: '/samples/bg-outdoor.webp', id: 'outdoor', label: '야외', prompt: 'soft outdoor daylight with blurred green foliage behind', swatch: '#65a30d', bg: 'linear-gradient(140deg,#ecfccb,#4d7c0f)' },
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
/**
 * 나이 손보기 — 대표 지시 2026-09-14 「나이도 조정할 수 있도록」 「-10살까지」
 *
 * 위로는 올리지 않는다. 프로필 사진을 실제보다 늙게 만들고 싶은 사람은 없다.
 */
export interface AgeOption {
    id: string
    label: string
    /** 몇 살 젊게 */
    minus: number
}

export const AGES: AgeOption[] = [
    { id: 'as-is', label: '그대로', minus: 0 },
    { id: 'm5', label: '5살 젊게', minus: 5 },
    { id: 'm10', label: '10살 젊게', minus: 10 },
]

export const DEFAULT_AGE_ID = 'as-is'

export function isValidAgeId(v: unknown): v is string {
    return typeof v === 'string' && AGES.some(a => a.id === v)
}

export function getAge(id: string): AgeOption | undefined {
    return AGES.find(a => a.id === id)
}

export function buildPhotoPrompt(style: Choice, backdrop: Choice, ratioLabel = '4:5', ageMinus = 0): string {
    const 나이줄 = ageMinus > 0
        ? `Make the subject look about ${ageMinus} years younger than in the uploaded photo, while keeping the same face and identity: softer fine lines, firmer skin, slightly fuller darker hair. Never change the bone structure or facial features.`
        : 'Match the age in the uploaded photo exactly — do not add years, do not deepen wrinkles, do not grey the hair, do not hollow the cheeks or eyes.'
    return [
        'Retouch this person into a professional headshot portrait.',
        `The subject is ${style.prompt}.`,
        `Background: ${backdrop.prompt}.`,
        'Keep the same face and the same identity as the uploaded photo — this must clearly look like the same person.',
        // 대표 지적 0914 = 「프로필이 더 나이들어보이는데」
        // 전에는 「더 젊게 만들지 마라」라고 적었는데, 그 한 줄이 모델을 늙는 쪽으로 밀었다.
        // 주름을 지우라는 게 아니라 없던 나이를 더하지 말라고 적는다.
        나이줄,
        'Keep natural skin texture and pores, but render the subject on their best day: rested, healthy, even skin tone.',
        'Soft diffused key light with gentle fill from below to avoid harsh shadows in the nasolabial folds and under the eyes.',
        'Eye level, looking at the lens, sharp focus on the eyes.',
        `Upper body, ${ratioLabel} composition suitable for a profile picture.`,
        // 대표 지시 0914 = 「이미지 AI처럼 만들지말고. 더 사람처럼」 (배우 프로필 사진을 보여주며)
        // 「AI 같지 않게」라고만 적으면 모델이 잘 못 알아듣는다. 카메라와 빛을 구체로 적고,
        // 사람 얼굴에 원래 있는 것(모공·잔주름·비대칭·흐트러진 머리카락)을 이름으로 불러줘야 한다.
        'Shot on a full-frame camera with an 85mm f/1.4 lens, single large softbox key light, real shadow falloff, faint film grain.',
        'Keep visible skin pores, fine lines, uneven natural skin tone, a few stray hair strands and slight facial asymmetry.',
        'It must read as a real photograph of a real person, not a rendering.',
        'No text, no logos, no watermark, no extra hands. Avoid the AI look: no waxy plastic skin, no airbrushed glow, no perfect symmetry, no oversaturated colour, no sharpening halo.',
    ].join(' ')
}
