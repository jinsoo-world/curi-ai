// 큐리AI 첫 화면에 보일 「할 일」 목록
//
// 대표 확정 2026-09-14 = 「오늘 뭘 만들래가 맞겠다」
//
// 왜 이렇게 바꾸나 = 지금 첫 화면은 「누구와 대화할래」(AI 목록)를 묻는다.
// 그러면 사람은 AI 를 고른 뒤에 「뭘 물어야 하지」를 또 생각해야 한다.
// 실측 = 로그인 회원이 채팅 화면을 연 473번 중 308번(65.1%)이 한 마디도 없이 끝났다.
// 「무엇을 하고 싶은지」부터 고르게 하면 그 단계가 사라진다.

export interface StudioItem {
    id: string
    /** 화면에 보일 이름 */
    title: string
    /** 한 줄 설명 */
    desc: string
    emoji: string
    /** 카드에 걸 사진. 이모지보다 이게 먼저 보인다 (대표 지시 0914) */
    img?: string
    /** 눌렀을 때 갈 곳 */
    href: string
    /** 클로버가 드는가 */
    cost: 'free' | number
    /** 묶음 */
    group: '만들기' | '배우기'
}

/** 클로버 없이 되는 것을 앞에 둔다 (pfpmaker 도 무료를 먼저 깐다) */
/**
 * 만들 수 있는 것 — 대표 확정 2026-09-15
 * 재취업 사진 · 배우 사진 · 나를 닮은 AI · 썸네일 · 전자책 · 인생 2막
 */
export const STUDIO_ITEMS: StudioItem[] = [
    {
        id: 'profile-photo',
        title: '재취업 프로필 사진 만들기',
        desc: '이력서·링크드인에 넣을 반듯한 사진을 만들어요',
        emoji: '📸',
        img: '/samples/act-m5.webp',
        href: '/tools/profile-photo',
        cost: 20,
        group: '만들기',
    },
    {
        id: 'actor-photo',
        title: '배우 프로필 사진 만들기',
        desc: '캐스팅에 내는 사진을 사진관에서 찍은 것처럼',
        emoji: '🎬',
        img: '/samples/act-m1.webp',
        href: '/tools/actor-photo',
        cost: 20,
        group: '만들기',
    },
    {
        id: 'my-ai',
        title: '나를 닮은 AI 만들기',
        desc: '내 경험으로 말하는 AI 를 만들고 팔 수 있어요',
        emoji: '✨',
        img: '/samples/act-w1.webp',
        href: '/creator/create',
        cost: 'free',
        group: '만들기',
    },
    {
        // 대표 확정 0915 목록에 있었는데 빠져 있었다 (내 누락)
        id: 'thumbnail',
        title: '썸네일 만들기',
        desc: '유튜브·어울림·멤버십·디지털 콘텐츠 표지',
        emoji: '🖼',
        img: '/samples/act-w7.webp',
        href: '/tools/thumbnail',
        cost: 15,
        group: '만들기',
    },

    {
        id: 'insta-profile',
        title: '인스타 프로필 사진 만들기',
        desc: '동그랗게 잘려도 얼굴이 잘 나오게 만들어요',
        emoji: '🟢',
        img: '/samples/act-w5.webp',
        href: '/tools/insta-profile',
        cost: 20,
        group: '만들기',
    },
    {
        id: 'ebook',
        title: '전자책 만들기',
        desc: '내 경험을 한 권으로 묶어요',
        emoji: '📖',
        img: '/mentors/ebook-coach.webp',
        href: '/mentors?c=전자책',
        cost: 'free',
        group: '만들기',
    },
    {
        // 대표 지시 0915 = 「화질 개선도 하나 넣자. 인생 2막 준비하기 대신 이거 넣어」
        id: 'enhance',
        title: '사진 화질 개선하기',
        desc: '흐릿하거나 오래된 사진을 살려요',
        emoji: '✨',
        img: '/samples/act-m3.webp',
        href: '/tools/enhance',
        cost: 12,
        group: '만들기',
    },
]

/** 무엇부터 할지 모를 때 가는 곳 */
export const GUIDE_ITEM: StudioItem = {
    id: 'manager',
    img: '/mentors/curi-manager.webp',
    title: '뭘 해야 할지 모르겠어요',
    desc: '큐리 매니저가 맞는 곳으로 안내해드려요',
    emoji: '🙂',
    href: '/mentors?c=안내',
    cost: 'free',
    group: '배우기',
}
