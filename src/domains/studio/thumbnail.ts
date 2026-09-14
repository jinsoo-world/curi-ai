// 썸네일 만들기 — 대표 확정 2026-09-15
//
// 「썸네일 만들기 (유튜브, 어울림, 멤버십, 디콘 등)」
//
// 왜 필요한가 = 리더가 강의를 열 때마다 막히는 곳이 썸네일이다. 큐리어스에서는
// 상세페이지·썸네일이 이미지 한 장이라 강사가 날짜·가격조차 못 고친다(0815 기록).
// 그 앞단을 여기서 푼다. 글자는 우리가 또렷하게 얹고, 배경만 AI 가 만든다.

export const THUMBNAIL_COST = 15

export interface ThumbPlace {
    id: string
    label: string
    /** 어디에 쓰는지 */
    use: string
    ratio: string
    /** 만들 크기 */
    w: number
    h: number
}

/** 쓰는 곳에 따라 크기가 다르다 */
export const THUMB_PLACES: ThumbPlace[] = [
    { id: 'youtube', label: '유튜브', use: '영상 썸네일', ratio: '16:9', w: 1280, h: 720 },
    { id: 'study', label: '어울림·강의', use: '강의 표지', ratio: '4:3', w: 1200, h: 900 },
    { id: 'membership', label: '멤버십', use: '멤버십 표지', ratio: '1:1', w: 1000, h: 1000 },
    { id: 'dicon', label: '디지털 콘텐츠', use: '전자책·자료 표지', ratio: '3:4', w: 900, h: 1200 },
]

export interface ThumbLook {
    id: string
    label: string
    prompt: string
    /** 글자 색 — 배경 결에 맞춘다 */
    text: string
    sub: string
    /** 글자 뒤에 까는 그늘 */
    shade: string
}

export const THUMB_LOOKS: ThumbLook[] = [
    {
        id: 'clean',
        label: '깔끔한',
        prompt: 'a clean minimal background with a soft single-colour gradient and gentle light, plenty of empty space, no objects, no people',
        text: '#111813', sub: '#3f4a43', shade: 'rgba(255,255,255,0.72)',
    },
    {
        id: 'warm',
        label: '따뜻한',
        prompt: 'a warm cosy background with soft beige and cream tones, blurred home interior feel, plenty of empty space, no people',
        text: '#2a1d10', sub: '#5c4a38', shade: 'rgba(255,248,238,0.74)',
    },
    {
        id: 'bold',
        label: '눈에 띄는',
        prompt: 'a bold high-contrast background in deep green and near-black with a strong diagonal light sweep, plenty of empty space, no people',
        text: '#ffffff', sub: '#d8e6dd', shade: 'rgba(8,20,14,0.62)',
    },
    {
        id: 'paper',
        label: '종이 느낌',
        prompt: 'a textured off-white paper background with subtle grain and a soft shadow, like a book cover, plenty of empty space, no people',
        text: '#1b1b1a', sub: '#54534f', shade: 'rgba(255,255,255,0.78)',
    },
]

export function getThumbPlace(id: string) { return THUMB_PLACES.find(p => p.id === id) }
export function getThumbLook(id: string) { return THUMB_LOOKS.find(l => l.id === id) }
export function isValidThumbPlace(v: unknown): v is string { return typeof v === 'string' && THUMB_PLACES.some(p => p.id === v) }
export function isValidThumbLook(v: unknown): v is string { return typeof v === 'string' && THUMB_LOOKS.some(l => l.id === v) }

/** 제목은 우리가 얹는다. AI 에게 글자를 그리게 하면 한글이 깨진다 */
export const MAX_TITLE = 40
export const MAX_SUB = 40

export function cleanLine(raw: unknown, max: number): string {
    if (typeof raw !== 'string') return ''
    return raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function buildThumbnailPrompt(look: ThumbLook, place: ThumbPlace): string {
    return [
        `Create a background image for a Korean online course thumbnail, ${place.ratio} aspect ratio.`,
        look.prompt,
        'Leave the middle and lower area visually calm and uncluttered so that large Korean text can be placed on top later.',
        'ABSOLUTELY NO TEXT, no letters, no numbers, no logos, no watermark, no signature anywhere in the image.',
        'No people, no faces, no hands.',
        'Photographic quality with soft natural light and faint grain, not a flat vector illustration.',
    ].join(' ')
}
