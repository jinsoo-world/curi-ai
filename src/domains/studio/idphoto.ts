import { 나이문장 } from './photo'
// 증명사진 만들기 — 대표 확정 2026-09-15
//
// 다른 도구와 다른 점 = 여기는 「예쁘게」가 아니라 「규격에 맞게」다.
// 여권·주민등록·이력서는 규격을 어기면 반려된다. 그래서 고를 것을 배경과 옷 둘로만 줄이고
// 나머지(정면·무표정·양쪽 귀·그림자 없음)는 우리가 고정한다.

export const ID_COST = 20

export interface IdChoice {
    id: string
    label: string
    desc?: string
    prompt: string
    swatch: string
    sample?: string
}

/** 배경 — 기관마다 받는 색이 다르다 */
export const ID_BACKGROUNDS: IdChoice[] = [
    { id: 'white', label: '흰색', desc: '여권·비자', prompt: 'a pure white background', swatch: '#ffffff', sample: '/samples/id-m1.webp' },
    { id: 'lightgrey', label: '밝은 회색', desc: '이력서·사원증', prompt: 'a plain light grey background', swatch: '#e5e7eb', sample: '/samples/id-m2.webp' },
    { id: 'skyblue', label: '하늘색', desc: '학교·관공서', prompt: 'a plain light sky blue background', swatch: '#dbeafe' },
    { id: 'ivory', label: '아이보리', desc: '부드러운 느낌', prompt: 'a plain warm ivory background', swatch: '#faf5eb' },
]

/** 차림새 */
export const ID_OUTFITS: IdChoice[] = [
    { id: 'suit', label: '정장', prompt: 'a well-fitted dark navy suit jacket with a crisp white shirt', swatch: '#1e293b', sample: '/samples/id-m1.webp' },
    { id: 'jacket', label: '재킷', prompt: 'a clean tailored jacket over a plain top, business casual', swatch: '#475569', sample: '/samples/id-w1.webp' },
    { id: 'shirt', label: '셔츠', prompt: 'a crisp plain button-up shirt with the collar closed, no tie', swatch: '#bfdbfe' },
    { id: 'keep', label: '지금 옷 그대로', prompt: 'the clothing from the uploaded photo, tidied and wrinkle-free', swatch: '#a3a3a3' },
]

/** 규격 — 나라·용도마다 크기가 다르다 */
export interface IdSize {
    id: string
    label: string
    use: string
    /** mm */
    w: number
    h: number
    ratio: string
}

export const ID_SIZES: IdSize[] = [
    { id: 'kr-id', label: '3.5 × 4.5cm', use: '이력서·주민등록·운전면허', w: 35, h: 45, ratio: '4:5' },
    { id: 'kr-passport', label: '3.5 × 4.5cm (여권)', use: '여권·비자 — 얼굴을 더 크게', w: 35, h: 45, ratio: '4:5' },
    { id: 'half', label: '반명함 3 × 4cm', use: '학생증·각종 원서', w: 30, h: 40, ratio: '3:4' },
]

export function getIdBackground(id: string) { return ID_BACKGROUNDS.find(b => b.id === id) }
export function getIdOutfit(id: string) { return ID_OUTFITS.find(o => o.id === id) }
export function getIdSize(id: string) { return ID_SIZES.find(s => s.id === id) }
export function isValidIdBackground(v: unknown): v is string { return typeof v === 'string' && ID_BACKGROUNDS.some(b => b.id === v) }
export function isValidIdOutfit(v: unknown): v is string { return typeof v === 'string' && ID_OUTFITS.some(o => o.id === v) }
export function isValidIdSize(v: unknown): v is string { return typeof v === 'string' && ID_SIZES.some(s => s.id === v) }

/**
 * 증명사진 지시문
 *
 * ⚠️ 규격을 어기면 관공서에서 반려된다. 그래서 「하지 말 것」을 길게 적는다.
 *    웃는 얼굴·기울어진 고개·머리카락이 눈썹을 덮는 것·그림자가 대표적인 반려 사유다.
 */
export function buildIdPhotoPrompt(bg: IdChoice, outfit: IdChoice, size: IdSize, ageMinus = 0): string {
    const 나이줄 = 나이문장(ageMinus)

    return [
        'Create a formal Korean ID photograph from this person.',
        'Keep the same face and the same identity as the uploaded photo — an official photo that does not look like the person is useless.',
        // 안경 — 2026-09-15 대조 시험에서 발견. 안경 쓴 5060 얼굴을 넣으면 둘 다 안경을 벗겨 놓았다.
        // 한국 증명사진은 안경을 써도 된다(선글라스·색렌즈만 안 된다). 안경은 그 사람의 얼굴이다.
        'If the person wears glasses in the uploaded photo, keep the exact same glasses on — Korean ID photographs allow clear prescription glasses. Keep the same frame shape and colour. The lenses must be clear with no glare or reflection, and the frame must not cover the eyes or eyebrows. If the person wears no glasses, do not add any.',
        나이줄,
        `Clothing: ${outfit.prompt}.`,
        `Background: ${bg.prompt}, perfectly even, with no shadow cast behind the head or shoulders.`,
        size.id === 'kr-passport'
            ? 'Passport composition: the head takes about 70 to 80 percent of the frame height, with even space above the hair.'
            : 'Standard ID composition: the head is centred with comfortable headroom, shoulders squared to the camera.',
        'MUST: straight-on frontal view, head upright and not tilted, both ears visible, eyes open and looking directly at the lens,',
        // 대표 지적 2026-09-15 = 「증명사진이 다 표정이 좀 어두워보여. 무서워」
        // 관공서 규격은 이를 드러낸 웃음을 반려한다. 그래서 「무표정」이 아니라
        // 「입은 다물되 편안하고 다정한 얼굴」로 적는다. 규격도 지키고 무섭지도 않다.
        'a warm and approachable expression with the lips gently closed — the corners of the mouth lifted just slightly and the eyes soft and kind.',
        'The person must look pleasant and at ease, NOT stern, NOT grim, NOT sad, NOT like a mugshot.',
        'Hair away from the eyebrows and eyes, flat even lighting with no harsh shadow on the face.',
        'MUST NOT: smiling with teeth, head tilt, hat, sunglasses, coloured lenses, hair covering the eyes, background shadow, filters.',
        'Keep natural skin texture — visible pores and fine lines. Do not smooth or beautify the face.',
        'Shot with even studio lighting on a full-frame camera. It must look like a real photo taken in a photo studio.',
        'No text, no logos, no watermark.',
    ].join(' ')
}
