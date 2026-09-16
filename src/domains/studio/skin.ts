/**
 * 피부 손보기 — 파파님 피드백 2026-09-16 「피부 보정 기능도 있으면 좋겠습니다」
 *
 * 나이 고르기와는 다른 일이다.
 *   나이 = 몇 살로 보이게 할까 (뼈대·주름의 깊이)
 *   피부 = 잡티·붉은기·번들거림을 어디까지 정돈할까 (표면)
 * 둘을 한 칸에 묶어 두었더니 「얼굴은 그대로 두고 피부만」을 고를 길이 없었다.
 *
 * ⚠️ 제일 센 단계에서도 모공과 잔주름은 남긴다. 그걸 지우는 순간 AI 티가 난다
 *    (대표 지시 0914 「이미지 AI처럼 만들지말고. 더 사람처럼」).
 */
export interface SkinOption {
    id: string
    label: string
    /** 칸 아래 작은 설명 */
    desc: string
    prompt: string
}

export const SKINS: SkinOption[] = [
    {
        id: 'as-is',
        label: '그대로',
        desc: '손대지 않아요',
        prompt:
            'Keep the skin exactly as it is in the uploaded photo: every pore, freckle, age spot, scar and fine line stays. ' +
            'Only the lighting may improve.',
    },
    {
        // 기본값. 사진관에서 찍으면 이 정도는 기본으로 해 준다.
        id: 'soft',
        label: '살짝 정돈',
        desc: '번들거림과 붉은기만',
        prompt:
            'Gently even out the skin the way a portrait studio would: reduce shine on the forehead and nose, ' +
            'calm redness and blotchy patches, soften dark circles a little. ' +
            'Keep every pore, fine line, freckle and age spot clearly visible — this is lighting and colour work, not retouching the face.',
    },
    {
        id: 'clear',
        label: '깨끗하게',
        desc: '잡티까지 정리',
        prompt:
            'Clean up the skin as a professional retoucher would for a magazine headshot: ' +
            'remove temporary blemishes (spots, pimples, flaking), even out pigmentation and age spots, calm redness, control shine, ' +
            'brighten under the eyes. ' +
            'But the skin must still read as real skin: keep visible pores, keep the fine lines and the deeper expression lines, ' +
            'keep the natural unevenness of tone. Never produce waxy, plastic, airbrushed or blurred skin.',
    },
]

export const DEFAULT_SKIN = 'soft'

export function getSkin(id: string) { return SKINS.find(s => s.id === id) }
export function isValidSkinId(v: unknown): v is string {
    return typeof v === 'string' && SKINS.some(s => s.id === v)
}

/** 프롬프트에 넣을 한 줄 — 못 찾으면 기본값으로 */
export function 피부문장(id: string | undefined): string {
    return (getSkin(id ?? DEFAULT_SKIN) ?? SKINS[1]).prompt
}
