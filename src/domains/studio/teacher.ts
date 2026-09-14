// 강사 프로필 만들기 — 대표 확정 2026-09-15
//
// 이력서용과 다른 점 = 「믿음직한가」가 아니라 「이 사람 강의를 듣고 싶은가」로 본다.
// 큐리어스 리더가 강의를 열 때 바로 쓰는 사진이다.

import type { Choice } from './photo'
import { 나이문장 } from './photo'

/** 성별 — 대표 지시 0915 「남성 / 여성 클릭하게 해」
 *  견본이 남녀 섞여 있으면 「나랑 다른 사람」 사진을 보고 고르게 된다. */
export type 성별 = 'male' | 'female'

export const GENDERS: { id: 성별; label: string }[] = [
    { id: 'female', label: '여성' },
    { id: 'male', label: '남성' },
]

export const TEACHER_COST = 20

/** 어떤 선생으로 보이고 싶은가 */
export const TEACHER_MOODS: Choice[] = [
    {
        id: 'warm',
        label: '따뜻하게',
        prompt: 'a warm inviting expression with a genuine open smile and relaxed shoulders, wearing a soft knit or cardigan in a light tone',
        swatch: '#e7c9a9',
        sample: '/samples/teach-w2.webp',
        sampleMale: '/samples/teach-m1.webp',
    },
    {
        id: 'trust',
        label: '믿음직하게',
        prompt: 'a calm credible expression with a light closed-lip smile, wearing a clean blazer over a plain top',
        swatch: '#475569',
        sample: '/samples/teach-w1.webp',
        sampleMale: '/samples/teach-m2.webp',
    },
    {
        id: 'easy',
        label: '편안하게',
        prompt: 'a relaxed everyday expression with an easy laugh, wearing a plain shirt with sleeves rolled up',
        swatch: '#93c5fd',
        sample: '/samples/teach-w3.webp',
        sampleMale: '/samples/teach-m1.webp',
    },
    {
        id: 'expert',
        label: '전문가답게',
        prompt: 'a composed expert expression with steady eye contact, wearing a tidy jacket or cardigan, glasses kept if present in the photo',
        swatch: '#1e293b',
        sample: '/samples/teach-w1.webp',
        sampleMale: '/samples/teach-m2.webp',
    },
]

/** 어디서 찍은 것처럼 */
export const TEACHER_PLACES: Choice[] = [
    { id: 'bright', label: '밝은 스튜디오', prompt: 'a clean bright studio background with soft even light', swatch: '#f4f4f5', bg: 'linear-gradient(140deg,#ffffff,#d4d4d8)', sample: '/samples/teach-w1.webp' },
    { id: 'room', label: '환한 방', prompt: 'a bright airy room softly blurred behind, natural window light', swatch: '#e7eee9', bg: 'linear-gradient(140deg,#f0f7f3,#a8c4b5)', sample: '/samples/teach-m1.webp' },
    { id: 'study', label: '서재', prompt: 'a warm study with blurred bookshelves behind and a desk lamp', swatch: '#b45309', bg: 'linear-gradient(140deg,#fef3c7,#92400e)', sample: '/samples/teach-m2.webp' },
    { id: 'pastel', label: '파스텔 단색', prompt: 'a smooth solid pastel studio backdrop in a soft warm tone, the clean look used on Korean instructor profiles', swatch: '#f7d9c9', bg: 'linear-gradient(140deg,#fdeee6,#e8b39a)', sample: '/samples/teach-w2.webp' },
]

export function getTeacherMood(id: string) { return TEACHER_MOODS.find(m => m.id === id) }
export function getTeacherPlace(id: string) { return TEACHER_PLACES.find(p => p.id === id) }
export function isValidTeacherMood(v: unknown): v is string { return typeof v === 'string' && TEACHER_MOODS.some(m => m.id === v) }
export function isValidTeacherPlace(v: unknown): v is string { return typeof v === 'string' && TEACHER_PLACES.some(p => p.id === v) }

export function buildTeacherPrompt(mood: Choice, place: Choice, ratioLabel = '4:5', ageMinus = 0, gender?: 성별): string {
    const 나이줄 = 나이문장(ageMinus)

    return [
        'Create a friendly instructor profile photograph for a Korean online course page.',
        gender === 'male' ? 'The subject is a man.' : gender === 'female' ? 'The subject is a woman.' : '',
        'Keep the same face and the same identity as the uploaded photo — students must recognise this person in the classroom.',
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
