// 사진 화질 개선하기 — 대표 확정 2026-09-15
//
// 「화질 개선도 하나 넣자. 인생 2막 준비하기 대신 이거 넣어. 사진 화질 개선하기」
// 참고 = remini.ai
//
// 중장년에게 이 기능이 센 이유 = 옛날 사진이 많다. 필름으로 찍어 스캔한 사진, 저화질 폰 사진,
// 인화지에서 색이 빠진 사진. 새로 만드는 게 아니라 있던 것을 살리는 일이라 거부감도 적다.

export const ENHANCE_COST = 12

export interface EnhanceMode {
    id: string
    label: string
    desc: string
    prompt: string
    sample?: string
}

export const ENHANCE_MODES: EnhanceMode[] = [
    {
        id: 'sharpen',
        label: '흐릿한 사진 살리기',
        desc: '초점이 안 맞거나 뭉개진 사진',
        sample: '/samples/act-m3.webp',
        prompt:
            'Restore and sharpen this photograph. Recover fine detail in the eyes, eyelashes, hair strands and fabric texture. ' +
            'Remove blur and compression artefacts. Keep the original framing, colours and lighting.',
    },
    {
        id: 'old',
        label: '오래된 사진 복원',
        desc: '빛바래거나 긁힌 옛날 사진',
        sample: '/samples/act-w2.webp',
        prompt:
            'Restore this old photograph. Repair scratches, dust, creases and torn edges. Recover faded colours to a natural tone ' +
            'without making them oversaturated. Keep the period look of the clothing, hairstyle and background — do not modernise anything.',
    },
    {
        id: 'lowlight',
        label: '어두운 사진 밝게',
        desc: '실내나 밤에 찍어 어두운 사진',
        sample: '/samples/act-m8.webp',
        prompt:
            'Brighten this underexposed photograph. Lift the shadows and recover detail in dark areas while keeping the highlights intact. ' +
            'Reduce colour noise. Keep the original mood — do not turn night into day.',
    },
    {
        id: 'print',
        label: '인쇄용으로 크게',
        desc: '작게 저장돼 확대하면 깨지는 사진',
        sample: '/samples/act-w1.webp',
        prompt:
            'Upscale this photograph to a higher resolution suitable for print. Reconstruct natural detail and edges without ' +
            'creating a plastic or over-sharpened look. Keep every element of the original composition.',
    },
]

export function getEnhanceMode(id: string) { return ENHANCE_MODES.find(m => m.id === id) }
export function isValidEnhanceMode(v: unknown): v is string {
    return typeof v === 'string' && ENHANCE_MODES.some(m => m.id === v)
}

/**
 * 화질 개선 지시문
 *
 * ⚠️ 여기서 제일 위험한 것은 「예쁘게 고쳐주는 것」이다.
 * 복원을 시키면 모델이 얼굴을 다시 그려서 다른 사람을 만들어 놓는다.
 * 그래서 「같은 사람·같은 순간」을 맨 앞과 맨 뒤에 두 번 적는다.
 */
export function buildEnhancePrompt(mode: EnhanceMode): string {
    return [
        'This is a photo restoration task, not a photo generation task.',
        'Keep the exact same person, the same face, the same expression and the same moment as the original.',
        mode.prompt,
        'Keep natural skin texture — visible pores and fine lines must remain. Do not smooth, airbrush or beautify the face.',
        'Do not change the age, weight, hairstyle, clothing, background or composition.',
        'Do not add anything that was not in the original photograph.',
        'The result must look like the same photograph taken with a better camera, not a new picture of a similar person.',
        'No text, no logos, no watermark.',
    ].join(' ')
}
