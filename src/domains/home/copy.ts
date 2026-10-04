// domains/home: /home 화면 글 (한 곳에 모아 둔다. 가운데점, 긴 줄표, 횟수 없음을 테스트가 지킨다)

export const HOME_COPY = {
    nav: {
        pricing: '가격 안내',
        team: '내 봇 팀',
        more: '더보기',
        market: '봇 마켓',
        photo: '사진 도구',
        invite: '친구 초대',
        help: '도움말',
        login: '로그인',
        me: '내 정보',
    },
    title: '내 SNS 주소만 넣으면, 나처럼 말하는 AI가 생겨요',
    sub: '블로그, 유튜브, 인스타, 스레드, 파는 상품 주소를 넣어 보세요. 파일은 가입한 뒤 자료 넣기에서 올려요.',
    chips: [
        { id: 'blog', label: '블로그', example: '내이름.tistory.com' },
        { id: 'youtube', label: '유튜브', example: 'youtube.com/@내채널' },
        { id: 'instagram', label: '인스타그램', example: 'instagram.com/내아이디' },
        { id: 'threads', label: '스레드', example: 'threads.net/@내아이디' },
        { id: 'shop', label: '상품', example: '내 쇼핑몰 상품 주소' },
        { id: 'file', label: '파일', example: '' },
    ],
    placeholder: '주소나 아이디를 붙여 넣어 주세요',
    multi: '여러 자료 입력 가능',
    make: '내 AI 만들기',
    safe: '내 계정만 넣어 주세요. 공개된 글만 읽고, 비밀번호는 묻지 않아요.',
    direct: '주소가 없어도 괜찮아요. 직접 설명해서 만들기',
    fileNote: '파일은 가입한 뒤 자료 넣기에서 올리면 돼요. 무료로도 매달 정해진 만큼 올릴 수 있어요',
    snsGuideTitle: '인스타그램, 스레드는 이렇게 넣어요',
    snsGuide: [
        '위 칸에 내 계정 주소를 넣어 주세요',
        '공개된 최근 글을 읽어서 초안을 만들어요',
        '비공개 계정이면 가입한 뒤 글을 붙여 넣거나 캡처를 올려 주세요',
    ],
    added: '넣은 주소',
    remove: '빼기',
    addMore: '주소를 더 넣으려면 위 칸에 붙여 넣어 주세요',
    pasteLabel: '내 글 몇 개를 복사해 붙여 넣어 주세요',
    pastePlaceholder: '내가 쓴 글을 그대로 붙여 넣어 주세요',
    directLabel: '어떤 일을 맡기고 싶나요, 무엇을 팔고 싶나요?',
    directPlaceholder: '예: 동네 꽃집을 해요. 손님 문의에 제 말투로 답해 주면 좋겠어요',
    directUrl: '상품이나 콘텐츠 주소 (없어도 돼요)',
    directShort: '조금만 더 자세히 써 주세요',
    draft: '초안 만들기',
    draftNote: '가입하면 바로 이어서 초안을 만들어요',
    feedTitle: '지금 만들어지는 AI',
    feedNote: '실제 활동이에요. 이름은 가려서 보여 드려요',
    stepsTitle: '이렇게 만들어져요',
    steps: [
        { t: '주소를 넣어요', d: '내 SNS나 블로그 주소면 돼요' },
        { t: '초안을 확인하고 고쳐요', d: '소개, 말투, 자료를 보고 고쳐요' },
        { t: '내 봇 팀에서 바로 일을 맡겨요', d: '만든 AI가 내 팀에 들어와요' },
    ],
    jobsTitle: '무엇을 맡길 수 있나요',
    marketTitle: '봇 마켓에 올리면 수익이 쌓여요',
    marketBody: '유료 회원이 내 봇과 대화한 만큼 매달 수익을 나눠 드려요.',
    marketBtn: '봇 마켓 보기',
    faqTitle: '안심하세요',
    faq: [
        { q: '내 계정만 넣어 주세요', a: '내가 운영하는 곳만 읽어요. 다른 분 계정은 넣지 말아 주세요.' },
        { q: '공개 글만 읽어요', a: '비밀번호는 묻지 않아요. 누구나 볼 수 있는 글만 읽어요.' },
        { q: '만든 AI는 언제든 지울 수 있어요', a: '내 봇 팀에서 봇을 빼거나 자료를 지우면 돼요.' },
        { q: '비공개 계정은 어떻게 하나요?', a: '비공개 글은 읽지 않아요. 보여 주고 싶은 글만 복사해 넣어 주세요.' },
        { q: '돈이 드나요?', a: '무료로 시작해요. 더 쓰고 싶을 때 요금제를 올리면 돼요.' },
    ],
    priceTitle: '가격',
    priceBody: '무료로 시작하세요. 더 쓰고 싶을 때 요금제를 올리면 돼요.',
    priceBtn: '가격 안내 보기',
    sticky: 'AI 만들기',
} as const

/** 누적 숫자 조각 (기준 넘은 것만). 숫자는 데이터베이스 그대로, 올림 없음. /home 은 큰 숫자 카드로 보여 준다 */
export function homeStatsParts(s: { bots: number | null; chats: number | null }): { lead: string; parts: { label: string; value: string }[] } {
    const parts: { label: string; value: string }[] = []
    if (s.bots != null) parts.push({ label: '만든 봇', value: `${s.bots.toLocaleString('ko-KR')}개` })
    if (s.chats != null) parts.push({ label: '나눈 대화', value: `${s.chats.toLocaleString('ko-KR')}번` })
    return { lead: '지금까지 큐리AI에서', parts }
}

/** 누적 숫자 한 줄 (기준 넘은 것만) */
export function homeStatsLine(s: { bots: number | null; chats: number | null }): string {
    const { lead, parts } = homeStatsParts(s)
    return parts.length ? `${lead} ${parts.map(p => `${p.label} ${p.value}`).join(', ')}` : ''
}
