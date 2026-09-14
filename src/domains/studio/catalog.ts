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
    /** 눌렀을 때 갈 곳 */
    href: string
    /** 클로버가 드는가 */
    cost: 'free' | number
    /** 묶음 */
    group: '만들기' | '배우기'
}

/** 클로버 없이 되는 것을 앞에 둔다 (pfpmaker 도 무료를 먼저 깐다) */
export const STUDIO_ITEMS: StudioItem[] = [
    // ── 만들기 (도구) ──
    {
        id: 'profile-photo',
        title: '전문가 프로필 사진 만들기',
        desc: '내 사진 한 장으로 증명사진처럼 반듯한 사진을 만들어요',
        emoji: '📸',
        href: '/tools/profile-photo',
        cost: 20,
        group: '만들기',
    },

    {
        id: 'insta-profile',
        title: '인스타 프로필 사진 만들기',
        desc: '동그랗게 잘려도 얼굴이 잘 나오게 만들어요',
        emoji: '🟢',
        href: '/tools/insta-profile',
        cost: 20,
        group: '만들기',
    },

    // ── 배우기 (코치) ── slug 는 멘토 등록 후 실제 id 로 바꾼다
    { id: 'youtube', title: '유튜브 시작하기', desc: '얼굴 안 나와도 영상은 됩니다', emoji: '🎬', href: '/mentors?c=유튜브', cost: 'free', group: '배우기' },
    { id: 'insta', title: '인스타 올리기', desc: '사진 한 장이면 충분해요', emoji: '📷', href: '/mentors?c=인스타그램', cost: 'free', group: '배우기' },
    { id: 'blog', title: '블로그 글쓰기', desc: '검색으로 손님이 찾아오게', emoji: '✒️', href: '/mentors?c=블로그', cost: 'free', group: '배우기' },
    { id: 'threads', title: '스레드 세 줄 쓰기', desc: '하루 세 줄로 시작해요', emoji: '✨', href: '/mentors?c=스레드', cost: 'free', group: '배우기' },
    { id: 'ebook', title: '전자책 만들기', desc: '내 경험을 한 권으로 묶어요', emoji: '📖', href: '/mentors?c=전자책', cost: 'free', group: '배우기' },
    { id: 'openchat', title: '오픈채팅방 열기', desc: '단톡방 하나가 내 무대', emoji: '🙌', href: '/mentors?c=오픈채팅', cost: 'free', group: '배우기' },
]

/** 무엇부터 할지 모를 때 가는 곳 */
export const GUIDE_ITEM: StudioItem = {
    id: 'manager',
    title: '뭘 해야 할지 모르겠어요',
    desc: '큐리 매니저가 맞는 곳으로 안내해드려요',
    emoji: '🙂',
    href: '/mentors?c=안내',
    cost: 'free',
    group: '배우기',
}
