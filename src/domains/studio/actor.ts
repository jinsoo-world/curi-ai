// 배우 프로필 사진 만들기 — 대표 확정 2026-09-15
//
// 「배우 프로필 사진 만들기」는 재취업용과 다르다.
// 재취업용은 「반듯하고 믿음직한가」를 본다. 배우 프로필은 「어떤 역할이 보이는가」를 본다.
// 그래서 정장·사무실이 아니라 무채색 스튜디오와 표정·분위기를 고르게 한다.
// 참고 = jactors.kr · plfil.com 의 실제 배우 프로필

import type { Choice } from './photo'
import { 나이문장 } from './photo'

/** 결이 되는 분위기 */
export const ACTOR_MOODS: Choice[] = [
    {
        id: 'warm',
        label: '따뜻한 어른',
        prompt: 'a warm, kind expression with a soft closed-lip smile and relaxed eyes, wearing a plain fine-knit sweater in a muted tone',
        swatch: '#b8a58c',
        sample: '/samples/act-m8.webp',
    },
    {
        id: 'strong',
        label: '단단한 인물',
        prompt: 'a composed, steady expression with a direct gaze and no smile, wearing a plain black shirt or jacket',
        swatch: '#27272a',
        sample: '/samples/act-m1.webp',
    },
    {
        id: 'elegant',
        label: '기품 있는',
        prompt: 'a dignified, calm expression with a slight head tilt, wearing a well-cut jacket over a simple top',
        swatch: '#6b7280',
        sample: '/samples/act-w2.webp',
    },
    {
        id: 'bright',
        label: '밝고 친근한',
        prompt: 'a genuine open smile with real laugh lines around the eyes, wearing a light casual shirt',
        swatch: '#e7c9a9',
        sample: '/samples/act-w5.webp',
    },
]

/** 스튜디오 바탕 */
export const ACTOR_BACKDROPS: Choice[] = [
    {
        id: 'dark',
        label: '어두운 스튜디오',
        prompt: 'a dark charcoal seamless studio backdrop with a soft rim light separating the shoulder from the background',
        swatch: '#2b2b2f',
        bg: 'linear-gradient(140deg,#3f3f46,#18181b)',
        sample: '/samples/act-m1.webp',
    },
    {
        id: 'grey',
        label: '회색 벽',
        prompt: 'a plain mid-grey studio wall with a visible soft shadow cast behind the shoulder',
        swatch: '#9ca3af',
        bg: 'linear-gradient(140deg,#e5e7eb,#6b7280)',
        sample: '/samples/act-w1.webp',
    },
    {
        id: 'white',
        label: '흰 배경',
        prompt: 'a clean bright white studio backdrop with even lighting, the standard casting-profile look',
        swatch: '#f4f4f5',
        bg: 'linear-gradient(140deg,#ffffff,#d4d4d8)',
        sample: '/samples/act-m5.webp',
    },
    {
        id: 'window',
        label: '창가 빛',
        prompt: 'standing beside a tall window with hard directional daylight raking across the face and an aged plaster wall behind',
        swatch: '#d9c3a5',
        bg: 'linear-gradient(140deg,#fef3c7,#a16207)',
        sample: '/samples/act-m3.webp',
    },
]

export function getActorMood(id: string) { return ACTOR_MOODS.find(m => m.id === id) }
export function getActorBackdrop(id: string) { return ACTOR_BACKDROPS.find(b => b.id === id) }
export function isValidActorMood(v: unknown): v is string { return typeof v === 'string' && ACTOR_MOODS.some(m => m.id === v) }
export function isValidActorBackdrop(v: unknown): v is string { return typeof v === 'string' && ACTOR_BACKDROPS.some(b => b.id === v) }

/**
 * 배우 프로필용 글
 *
 * 재취업용과 갈리는 곳 = 「반듯함」 대신 「사람으로 보이는가」에 무게를 둔다.
 * 캐스팅 담당은 매끈한 사진을 반기지 않는다. 실물과 다르면 현장에서 문제가 되기 때문이다.
 */
export function buildActorPrompt(mood: Choice, backdrop: Choice, ratioLabel = '4:5', ageMinus = 0): string {
    const 나이줄 = 나이문장(ageMinus)

    return [
        'Create a professional Korean casting profile photograph (actor headshot) from this person.',
        'Keep the same face and the same identity as the uploaded photo — a casting director must recognise this person in the room.',
        나이줄,
        `Expression and clothing: ${mood.prompt}.`,
        `Background: ${backdrop.prompt}.`,
        'Shot on a full-frame camera with an 85mm f/1.4 lens, single large softbox key light, real shadow falloff, faint film grain.',
        'Keep visible skin pores, fine lines, uneven natural skin tone, a few stray hair strands and slight facial asymmetry.',
        'Minimal retouching — a casting profile that looks different from the real person is useless.',
        `Chest-up framing, ${ratioLabel} composition, sharp focus on the eyes.`,
        'No text, no logos, no watermark, no extra hands.',
        'Avoid the AI look: no waxy plastic skin, no airbrushed glow, no perfect symmetry, no oversaturated colour, no sharpening halo.',
    ].join(' ')
}
