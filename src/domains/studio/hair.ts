/**
 * 머리 모양 — 사진 도구 공용
 *
 * 대표 지적 2026-09-15 「머리는 왜 까냐」 → 「그리고 머리를 왜 까는거야 임마」 → 「옵션으로 하게 해. 덮머」
 *
 * 무슨 일이 있었나 = 모자를 쓴 사진을 넣으면 모자를 벗기면서 머리까지 지어냈다.
 * 이마를 훤히 까고 뒤로 넘긴 머리로 바꿔 놓는다. 머리는 그 사람 얼굴의 일부다.
 *
 * 그래서 두 가지를 한다.
 *  ① 기본은 「지금 머리 그대로」 — 아무것도 안 고르면 원본을 지킨다
 *  ② 바꾸고 싶은 사람만 고른다 (덮기·넘기기·단정하게)
 */
export interface HairChoice {
    id: string
    label: string
    desc: string
    prompt: string
}

export const HAIRS: HairChoice[] = [
    {
        id: 'keep',
        label: '지금 머리 그대로',
        desc: '올린 사진과 똑같이',
        prompt: 'Keep the hair EXACTLY as it is in the uploaded photo — the same length, the same parting, the same volume, the same hairline and the same amount of forehead shown. Do not restyle it, do not slick it back, do not expose more forehead than the original, do not add or remove hair.',
    },
    {
        id: 'tidy',
        label: '단정하게',
        desc: '흐트러진 곳만 정리',
        prompt: 'Keep the same hairstyle, length and parting as the uploaded photo, but tidy stray hairs and flyaways so it looks neatly groomed. Do not change the hairline or the amount of forehead shown.',
    },
    {
        id: 'down',
        label: '앞머리 덮기',
        desc: '이마를 덮게',
        prompt: 'Let the front hair fall naturally over the forehead, covering it, while keeping the same hair length and colour as the uploaded photo. The eyebrows and eyes must still be fully visible.',
    },
    {
        id: 'back',
        label: '이마 보이게',
        desc: '앞머리를 넘겨서',
        prompt: 'Comb the hair back so the forehead and eyebrows are clearly visible, keeping the same hair length and colour as the uploaded photo.',
    },
]

/** 모자를 벗겨도 머리는 지어내지 않는다 — 모든 도구가 함께 쓴다 */
export const 모자규칙 =
    'If the person wears a hat or cap in the uploaded photo, remove it, but keep the hair that the hat was covering as close to the original as possible — do not invent a different hairstyle and do not expose more forehead than the original.'

export function getHair(id: string) { return HAIRS.find(h => h.id === id) }
export function isValidHair(v: unknown): v is string { return typeof v === 'string' && HAIRS.some(h => h.id === v) }
export const DEFAULT_HAIR = 'keep'
