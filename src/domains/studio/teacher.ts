// 강사 프로필 만들기 — 대표 확정 2026-09-15
//
// 이력서용과 다른 점 = 「믿음직한가」가 아니라 「이 사람 강의를 듣고 싶은가」로 본다.
// 큐리어스 리더가 강의를 열 때 바로 쓰는 사진이다.

import type { Choice } from './photo'
import { 나이문장 } from './photo'
import { HAIRS, 모자규칙, type HairChoice } from '@/domains/studio/hair'

/** 성별 — 대표 지시 0915 「남성 / 여성 클릭하게 해」
 *  견본이 남녀 섞여 있으면 「나랑 다른 사람」 사진을 보고 고르게 된다. */
export type 성별 = 'male' | 'female'

export const GENDERS: { id: 성별; label: string }[] = [
    { id: 'female', label: '여성' },
    { id: 'male', label: '남성' },
]

export const TEACHER_COST = 20

/**
 * 어떤 이미지로 보이고 싶은가 — 여섯 가지
 * 대표 지시 2026-09-15 「어떤 이미지로 보이고 싶나요로 바꾸고. 스타일도 6개로 표기해주고」
 * 참고로 주신 사진 = 손동작 있는 정장 · 앉은 편안한 자세 · 펜 든 설명 · 격식 있는 어두운 톤 등
 */
export const TEACHER_MOODS: Choice[] = [
    {
        id: 'warm',
        label: '따뜻하게',
        prompt: 'a warm inviting expression with a gentle closed-lip smile and relaxed shoulders, wearing a soft jacket or knit in a light tone',
        swatch: '#e7c9a9',
        sample: '/samples/style-warm.webp',
        sampleMale: '/samples/style-warm-m.webp',
    },
    {
        id: 'trust',
        label: '믿음직하게',
        prompt: 'a calm credible expression with steady eye contact and a light closed-lip smile, wearing a clean blazer over a crisp shirt',
        swatch: '#475569',
        sample: '/samples/style-trust-w.webp',
        sampleMale: '/samples/style-trust.webp',
    },
    {
        id: 'easy',
        label: '편안하게',
        prompt: 'a relaxed everyday expression with an easy natural smile, leaning slightly forward as if mid-conversation, wearing a soft jacket',
        swatch: '#93c5fd',
        sample: '/samples/style-easy.webp',
        sampleMale: '/samples/style-easy-m.webp',
    },
    {
        id: 'expert',
        label: '전문가답게',
        prompt: 'a composed expert expression with steady eye contact and a light smile, wearing a tidy blazer, as if explaining a point',
        swatch: '#1e293b',
        sample: '/samples/style-expert-w.webp',
        sampleMale: '/samples/style-expert.webp',
    },
    {
        id: 'lively',
        label: '활기차게',
        prompt: 'a bright animated expression with an open friendly smile and energetic upright posture, wearing a neat suit or jacket',
        swatch: '#f59e0b',
        sample: '/samples/style-lively-w.webp',
        sampleMale: '/samples/style-lively.webp',
    },
    {
        id: 'chic',
        label: '세련되게',
        prompt: 'a poised sophisticated expression with a subtle confident smile, wearing elegant dark clothing, soft rim light on the hair and shoulders',
        swatch: '#27272a',
        sample: '/samples/style-chic.webp',
        sampleMale: '/samples/style-chic-m.webp',
    },
]

/**
 * 어디서 찍은 것처럼 — 여섯 가지
 * 대표 지시 2026-09-15 「배경을 6개정도 표기해줘야지」
 */
export const TEACHER_PLACES: Choice[] = [
    { id: 'bright', label: '밝은 스튜디오', prompt: 'a clean bright studio background with soft even light', swatch: '#f4f4f5', bg: 'linear-gradient(140deg,#ffffff,#d4d4d8)', sample: '/samples/place-studio.webp' },
    { id: 'room', label: '환한 방', prompt: 'a bright airy room softly blurred behind, natural window light', swatch: '#e7eee9', bg: 'linear-gradient(140deg,#f0f7f3,#a8c4b5)', sample: '/samples/place-room.webp' },
    { id: 'study', label: '서재', prompt: 'a warm study with blurred bookshelves behind and a desk lamp', swatch: '#b45309', bg: 'linear-gradient(140deg,#fef3c7,#92400e)', sample: '/samples/place-study.webp' },
    { id: 'pastel', label: '파스텔 단색', prompt: 'a smooth solid pastel studio backdrop in a soft warm tone, the clean look used on Korean instructor profiles', swatch: '#f7d9c9', bg: 'linear-gradient(140deg,#fdeee6,#e8b39a)', sample: '/samples/place-pastel.webp' },
    { id: 'dark', label: '어두운 단색', prompt: 'a deep charcoal studio backdrop with soft rim light separating the hair and shoulders from the background', swatch: '#27272a', bg: 'linear-gradient(140deg,#3f3f46,#18181b)', sample: '/samples/place-dark.webp' },
    { id: 'office', label: '사무실', prompt: 'a modern office softly blurred behind, clean lines and natural daylight', swatch: '#cbd5e1', bg: 'linear-gradient(140deg,#e2e8f0,#94a3b8)', sample: '/samples/place-office.webp' },
]

export function getTeacherMood(id: string) { return TEACHER_MOODS.find(m => m.id === id) }
export function getTeacherPlace(id: string) { return TEACHER_PLACES.find(p => p.id === id) }
export function isValidTeacherMood(v: unknown): v is string { return typeof v === 'string' && TEACHER_MOODS.some(m => m.id === v) }
export function isValidTeacherPlace(v: unknown): v is string { return typeof v === 'string' && TEACHER_PLACES.some(p => p.id === v) }

export function buildTeacherPrompt(mood: Choice, place: Choice, ratioLabel = '4:5', ageMinus = 0, gender?: 성별, hair?: HairChoice): string {
    const 나이줄 = 나이문장(ageMinus)

    return [
        'Create a friendly instructor profile photograph for a Korean online course page.',
        gender === 'male' ? 'The subject is a man.' : gender === 'female' ? 'The subject is a woman.' : '',
        'Keep the same face and the same identity as the uploaded photo — students must recognise this person in the classroom.',
        // 머리 — 대표 지적 2026-09-15 「머리를 왜 까는거야」. 모자를 벗기면서 머리까지 지어냈다.
        (hair ?? HAIRS[0]).prompt,
        모자규칙,
        나이줄,
        `Expression and clothing: ${mood.prompt}.`,
        `Background: ${place.prompt}.`,
        'The photo should feel approachable and credible at the same time — someone you would want to learn from.',
        'A genuine confident smile showing teeth, direct eye contact with the lens, shoulders squared, upright posture.',
        // 대표 지적 0915 = 「사진이 바랬다니까」
        // 다른 도구와 달리 여기서는 film grain·muted 를 쓰지 않는다. 강사 프로필은
        // 밝고 선명한 것이 규범이다(대표가 준 한국 강사 프로필 견본 전부가 그랬다).
        'Bright even beauty-dish lighting from the front with soft fill — the face is fully lit with no dark areas.',
        'Rich saturated colour, high clarity, sharp focus across the face, crisp edges.',
        'Keep natural skin texture (pores and fine lines visible), but the skin must look healthy, rested and well lit.',
        'NO film grain, NO muted or faded tone, NO grey cast, NO dark shadow on the face.',
        `Chest-up framing, ${ratioLabel} composition, sharp focus on the eyes, looking at the lens.`,
        'No text, no logos, no watermark, no extra hands.',
        'Avoid the AI look: no waxy plastic skin, no perfect symmetry, no artificial glow halo.',
    ].filter(Boolean).join(' ')
}
