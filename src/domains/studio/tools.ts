/**
 * 큐리 AI 가 해주는 여섯 가지 — 대표 확정 2026-09-15
 *
 * 「증명사진 만들기 / 강사 프로필 만들기 / 배우 프로필 만들기 /
 *   사진 화질 개선하기 / 나를 닮은 AI 만들기 / 콘텐츠 썸네일 만들기. 6개로 해」
 *
 * 여기가 목록의 유일한 진실이다. 첫 화면·사이트맵·공유 그림이 모두 이 표를 본다.
 * 늘리기 전에 한 번 더 생각한다 — 일곱 칸이 되는 순간 중장년은 고르기를 멈춘다.
 */
export interface ToolItem {
    id: string
    title: string
    /** 한 줄 설명 */
    desc: string
    href: string
    /** 카드에 걸 그림 — 도구마다 결과가 확실히 달라 보여야 한다 */
    img: string
    /** 값 (클로버). 'free' 면 무료 */
    cost: number | 'free'
}

export const TOOLS: ToolItem[] = [
    {
        id: 'id-photo',
        title: '증명사진 만들기',
        desc: '여권·이력서에 내는 규격 사진',
        href: '/tools/id-photo',
        img: '/samples/id-m1.webp',
        cost: 20,
    },
    {
        id: 'teacher-photo',
        title: '강사 프로필 만들기',
        desc: '강의 소개에 거는 밝고 믿음직한 사진',
        href: '/tools/teacher-photo',
        img: '/samples/teach-w1.webp',
        cost: 20,
    },
    {
        id: 'actor-photo',
        title: '배우 프로필 만들기',
        desc: '캐스팅에 내는 사진, 사진관에서 찍은 것처럼',
        href: '/tools/actor-photo',
        img: '/samples/act-m1.webp',
        cost: 20,
    },
    {
        id: 'enhance',
        title: '사진 화질 개선하기',
        desc: '흐릿하거나 오래된 사진을 살려요',
        href: '/tools/enhance',
        img: '/samples/act-m3.webp',
        cost: 12,
    },
    {
        id: 'my-ai',
        title: '나를 닮은 AI 만들기',
        desc: '내 경험으로 말하는 AI 를 만들고 팔아요',
        href: '/creator/create',
        img: '/samples/act-w1.webp',
        cost: 'free',
    },
    {
        id: 'thumbnail',
        title: '콘텐츠 썸네일 만들기',
        desc: '유튜브·강의·전자책 표지',
        href: '/tools/thumbnail',
        img: '/samples/act-w7.webp',
        cost: 15,
    },
]
