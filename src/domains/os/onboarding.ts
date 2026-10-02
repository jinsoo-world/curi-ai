// 가입 온보딩 6화면 (대표 승인 0928 23:15 「온보딩 고쳐, 데이터 저장되도록」). 대상 = 새로 가입한 1인 사업가.
// 화면(/os/start), 서버(/api/os/onboarding, 로그인 콜백), 첫 대화(칩과 예시), 관리자 표가 같이 쓰는 한 곳.
// 화면에서도 불러 쓰므로 서버 전용 코드는 넣지 않는다.

import { cloverChats } from './usage-config'

export const ONBOARDING_TITLE = '나만의 AI 팀을 만들어보세요'
export const TERMS_VERSION = 'v1-2026-09'
/** 이 시각 뒤에 가입한 사람만 온보딩을 띄운다 (기존 회원은 강제하지 않는다). 2026-09-28 23:00 KST */
export const ONBOARDING_SINCE = '2026-09-28T14:00:00Z'
export const MAX_USE_CASES = 3

/**
 * 화면 5 에서 「운영해요」를 고르면 보이는 카드. 숫자(비율, 배수)는 넣지 않는다.
 * 약관 초안(리더 약관 제9조, 서비스 약관 제17조)의 수익 기준은 「연결(등록 및 실제 사용) 건수」이고,
 * 조회수와 인용 기준이나 멤버십 배수는 코드와 문서 어디에도 없어 2배 줄은 뺐다.
 */
export const LEADER_CARD = {
    title: '나를 닮은 AI로 수익화해보세요',
    line: '내 봇이 많이 쓰일수록 수익이 쌓여요',
    note: '활동에 따라 달라질 수 있어요',
} as const

export type Choice = { id: string; label: string }

export const ACQUISITION: Choice[] = [
    { id: 'ai_chatbot', label: 'AI 챗봇 추천 (챗GPT, 제미나이 등)' },
    { id: 'leader', label: '리더(강사) 소개' },
    { id: 'friend', label: '지인이나 가족 소개' },
    { id: 'youtube', label: '유튜브' },
    { id: 'search', label: '네이버나 구글 검색' },
    { id: 'sns', label: '인스타그램, 스레드' },
    { id: 'kakao', label: '카카오톡' },
    { id: 'curious', label: '큐리어스 강의나 커뮤니티' },
    { id: 'other', label: '기타' },
]
/** 이 답이면 초대 코드 칸을 연다 */
export const REFERRAL_SOURCES = new Set(['leader', 'friend'])

export const USE_CASES: Choice[] = [
    { id: 'customer', label: '고객 응대' },
    { id: 'promo', label: '홍보 글' },
    { id: 'schedule', label: '일정과 예약' },
    { id: 'quote', label: '견적과 정리' },
    { id: 'docs', label: '자료 정리' },
    { id: 'research', label: '자료 조사' },
    { id: 'class', label: '강의나 모임 준비' },
]
export type UseCase = 'customer' | 'promo' | 'schedule' | 'quote' | 'docs' | 'research' | 'class'

/** 맡길 일 → 기본 팀(presets DEFAULT_TEAM)의 어느 봇에게 먼저 말을 걸지 */
export const USE_CASE_JOB: Record<UseCase, string> = {
    customer: 'marketing_lead',
    promo: 'marketing_lead',
    schedule: 'planning_lead',
    quote: 'planning_lead',
    docs: 'dev_lead',
    research: 'research_lead',
    class: 'planning_lead',
}

export const AGE_BANDS: Choice[] = [
    { id: 'u30', label: '30대 이하' },
    { id: '40s', label: '40대' },
    { id: '50s', label: '50대' },
    { id: '60s', label: '60대' },
    { id: '70p', label: '70대 이상' },
]
export const GENDERS: Choice[] = [
    { id: 'female', label: '여성' },
    { id: 'male', label: '남성' },
    { id: 'none', label: '답하지 않음' },
]
export const OCCUPATIONS: Choice[] = [
    { id: 'lecture_coaching', label: '강의나 코칭' },
    { id: 'shop', label: '온라인 쇼핑몰' },
    { id: 'store', label: '매장 운영' },
    { id: 'freelancer', label: '프리랜서' },
    { id: 'content', label: '콘텐츠 제작' },
    { id: 'office', label: '직장 다님' },
    { id: 'retired', label: '은퇴 준비나 은퇴' },
    { id: 'other', label: '기타' },
]
/** 화면 5 (대표 승인 0928 23:29 문구 변경) */
export const AUDIENCE_QUESTION = 'SNS나 강의로 만나는 분들이 있나요?'
export const RUNS: Choice[] = [
    { id: 'sns', label: 'SNS 운영' },
    { id: 'class', label: '강의나 모임' },
    { id: 'both', label: '둘 다' },
    { id: 'none', label: '아직 없어요' },
]
/** 이 답이면 리더 카드와 추가 칸을 연다 */
export const RUNS_NONE = 'none'

export const AUDIENCE: Choice[] = [
    { id: 'lt10', label: '10명 미만' },
    { id: '10_30', label: '10명에서 30명' },
    { id: '30_100', label: '30명에서 100명' },
    { id: '100p', label: '100명 이상' },
]

export const labelOf = (list: Choice[], id: string | null | undefined): string =>
    list.find(c => c.id === id)?.label ?? (id || '')

/** 대화 봇이 [사용자 정보]에 넣을 하는 일·소속·맡길 일 (모든 봇이 같이 본다. 「기타」와 빈 칸은 뺀다) */
export function onboardingForChat(row: { occupation?: string | null; org_name?: string | null; use_cases?: string[] | null } | null): {
    occupation: string | null; orgName: string | null; useCases: string[]
} {
    const occ = row?.occupation && row.occupation !== 'other' ? labelOf(OCCUPATIONS, row.occupation) : ''
    const org = (row?.org_name ?? '').trim()
    const uses = (row?.use_cases ?? []).map(id => USE_CASES.find(c => c.id === id)?.label).filter((l): l is string => !!l)
    return { occupation: occ || null, orgName: org || null, useCases: uses }
}

/** 화면 3 답에 맞춘 첫 대화 칩 3개 */
export const FIRST_HELP_CHIPS: Record<UseCase, [string, string, string]> = {
    customer: [
        '「배송 언제 와요?」 문의에 보낼 친절한 답장 써 줘',
        '자주 받는 질문 5개와 답을 정리해 줘',
        '불만 문의에 보낼 사과 답장 초안 써 줘',
    ],
    promo: [
        '이번 주 홍보 글 3개 써 줘',
        '인스타에 올릴 짧은 문구 한 줄 만들어 줘',
        '새 고객에게 보낼 안내 문자 써 줘',
    ],
    schedule: [
        '예약 확인 문자 초안 써 줘',
        '이번 주 할 일을 요일별로 정리해 줘',
        '예약 변경 요청에 보낼 답장 써 줘',
    ],
    quote: [
        '견적서에 들어갈 항목을 정리해 줘',
        '견적 문의에 보낼 답장 초안 써 줘',
        '이번 달 매출과 지출 정리 표 만들어 줘',
    ],
    docs: [
        '내 자료를 10줄로 요약해 줘',
        '흩어진 메모를 주제별로 묶어 줘',
        '고객 안내문을 한 장으로 정리해 줘',
    ],
    research: [
        '요즘 우리 업종에서 사람들이 많이 찾는 것 알려 줘',
        '경쟁 가게 3곳을 비교하는 표 만들어 줘',
        '이거 사실인지 자료 찾아서 출처랑 같이 알려 줘',
    ],
    class: [
        '다음 강의 순서를 5단계로 짜 줘',
        '모임 공지 글 하나 써 줘',
        '수강생이 물을 만한 질문 3개 뽑아 줘',
    ],
}

/** 화면 3 답에 맞춘 예시 대화 한 번 (첫 대화에만, 「예시」라고 표시. 저장하지 않는다) */
export const SAMPLE_EXCHANGE: Record<UseCase, { user: string; bot: string }> = {
    customer: {
        user: '손님이 「주문한 거 언제 와요?」라고 물었어. 답장 써 줘',
        bot: '이렇게 보내 보세요.\n\n"안녕하세요, 주문해 주셔서 감사합니다. 오늘 보내 드리고 보통 1~2일 안에 도착해요. 송장 번호가 나오면 바로 알려 드릴게요."\n\n내 말투를 알려 주시면 그대로 맞춰 드려요.',
    },
    promo: {
        user: '이번 주 할인 행사 알리는 인스타 글 써 줘',
        bot: '"이번 주만 준비한 작은 선물 🎁\n단골 고객님께 고마운 마음으로 준비했어요.\n일요일까지, 프로필 링크에서 확인하세요."\n\n상품 이름과 혜택을 알려 주시면 더 딱 맞게 써 드려요.',
    },
    schedule: {
        user: '내일 오후 3시 예약 손님에게 확인 문자 보내 줘',
        bot: '"안녕하세요, 내일 오후 3시 예약 확인차 연락드려요. 바꾸셔야 하면 편하게 답장 주세요. 내일 뵙겠습니다!"\n\n예약 목록을 알려 주시면 여러 분께 보낼 글도 한 번에 만들어 드려요.',
    },
    quote: {
        user: '로고 디자인 견적 문의에 보낼 답장 써 줘',
        bot: '"문의 주셔서 감사합니다. 로고 디자인은 시안 2개와 수정 2번을 기본으로 해요. 쓰실 곳과 원하시는 느낌을 알려 주시면 정확한 견적을 바로 보내 드릴게요."\n\n내 가격표를 올려 두면 금액까지 넣어 드려요.',
    },
    docs: {
        user: '지난달 고객 상담 메모를 정리해 줘',
        bot: '이렇게 묶어 드릴게요.\n\n1. 자주 묻는 것: 배송, 교환, 사용법\n2. 불만: 포장이 찢어져 온 일 2건\n3. 다음에 할 일: 교환 안내문 만들기\n\n메모를 올려 주시면 실제 내용으로 정리해 드려요.',
    },
    research: {
        user: '우리 동네 꽃집 요즘 인기 상품 조사해 줘',
        bot: '이렇게 찾아 드릴게요.\n\n1. 요즘 많이 찾는 것: 작은 꽃다발, 드라이플라워\n2. 가격대: 2만 원에서 4만 원\n3. 출처: 검색한 글 주소를 같이 붙여 드려요\n\n가게 이름과 동네를 알려 주시면 실제 자료로 찾아 드려요.',
    },
    class: {
        user: '이번 주 토요일 모임 공지 글 써 줘',
        bot: '"이번 주 토요일 오후 2시에 만나요 🙂\n주제는 「봄맞이 사진 찍기」예요.\n편한 옷차림으로 오시고, 참석 여부는 댓글로 알려 주세요."\n\n장소와 준비물을 알려 주시면 더 꼼꼼하게 써 드려요.',
    },
}

export function isUseCase(v: unknown): v is UseCase {
    return typeof v === 'string' && USE_CASES.some(c => c.id === v)
}

const pick = (list: Choice[], v: unknown): string | null =>
    typeof v === 'string' && list.some(c => c.id === v) ? v : null
const text = (v: unknown, max: number): string | null => {
    if (typeof v !== 'string') return null
    const s = v.replace(/\s+/g, ' ').trim()
    return s ? s.slice(0, max) : null
}

/** 초대 코드 = 영문, 숫자만 대문자로 (가입 트리거가 만든 users.referral_code 모양) */
export function cleanRefCode(v: unknown): string | null {
    if (typeof v !== 'string') return null
    const s = v.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 20)
    return s.length >= 4 ? s : null
}

export type OnboardingStep = 'terms' | 'source' | 'uses' | 'profile' | 'leader' | 'done'
// 약관 화면은 뺐다 (대표 0929 「동의는 받지마」): 로그인 단추 아래 안내문으로 동의를 남긴다. 'terms' 는 예전 화면 호환으로만 받는다
export const STEP_ORDER: OnboardingStep[] = ['source', 'uses', 'profile', 'leader', 'done']

/** 화면별로 받은 답을 정해진 값으로만 거른다. 필수 답이 없으면 error */
export function sanitizeStep(step: unknown, body: unknown): { step: OnboardingStep; fields: Record<string, unknown>; error?: string } | { error: string } {
    const b = (body ?? {}) as Record<string, unknown>
    switch (step) {
        case 'terms': {
            if (b.age !== true || b.terms !== true || b.privacy !== true) return { error: '필수 약관 3개에 동의해 주세요.' }
            return { step, fields: { marketing: b.marketing === true } }
        }
        case 'source': {
            const src = pick(ACQUISITION, b.acquisition_source)
            if (!src) return { error: '하나만 골라 주세요.' }
            return {
                step,
                fields: {
                    acquisition_source: src,
                    acquisition_detail: src === 'ai_chatbot' || src === 'other' ? text(b.acquisition_detail, 80) : null,
                    leader_code_entered: REFERRAL_SOURCES.has(src) ? cleanRefCode(b.leader_code_entered) : null,
                },
            }
        }
        case 'uses': {
            const list = Array.isArray(b.use_cases) ? b.use_cases.filter(isUseCase) : []
            const uniq = [...new Set(list)].slice(0, MAX_USE_CASES)
            if (uniq.length === 0) return { error: '하나 이상 골라 주세요.' }
            return { step, fields: { use_cases: uniq } }
        }
        case 'profile': {
            // 나이대도 선택 (건너뛸 수 있다). 소식 받기(마케팅)는 여기서 선택으로만 받는다
            return { step, fields: { age_band: pick(AGE_BANDS, b.age_band), gender: pick(GENDERS, b.gender), occupation: pick(OCCUPATIONS, b.occupation), marketing: b.marketing === true } }
        }
        case 'leader': {
            const runs = pick(RUNS, b.runs_class_or_group)
            if (!runs) return { error: '하나만 골라 주세요.' }
            const yes = runs !== RUNS_NONE
            return {
                step,
                fields: {
                    runs_class_or_group: runs,
                    audience_size_band: yes ? pick(AUDIENCE, b.audience_size_band) : null,
                    org_name: yes ? text(b.org_name, 80) : null,
                    leader_contact_ok: yes && b.leader_contact_ok === true,
                },
            }
        }
        case 'done':
            return { step, fields: {} }
        default:
            return { error: '알 수 없는 단계예요.' }
    }
}

/** 첫 봇 = 맡길 일 첫 번째에 맞는 기본 팀 봇의 일(job) */
export function firstJobFor(useCases: readonly string[] | null | undefined): string {
    const first = (useCases ?? []).find(isUseCase)
    return first ? USE_CASE_JOB[first] : 'planning_lead'
}

/**
 * 온보딩을 띄울까. users 행은 가입 트리거가 먼저 만들어서 「행이 없다」로는 새 회원을 가릴 수 없다.
 * 온보딩 행이 있으면 그 상태로, 없으면 로그인 계정(auth) 가입 시각이 ONBOARDING_SINCE 뒤인지로 가린다.
 */
export function needsOnboarding(s: { status: string | null | undefined; authCreatedAt: string | null | undefined; since?: string }): boolean {
    if (s.status) return s.status === 'started'
    const created = Date.parse(String(s.authCreatedAt || ''))
    const since = Date.parse(s.since || ONBOARDING_SINCE)
    return Number.isFinite(created) && Number.isFinite(since) && created >= since
}

export interface ClientContext { device: 'mobile' | 'pc'; os: string; app_shell: 'ios_app' | 'android_app' | 'web' }

/**
 * 기기, 운영체제, 앱 여부. 앱 껍데기(Capacitor, 서버 주소 방식)는 window.Capacitor 에 플랫폼을 알려 준다.
 * 그게 없으면 웹으로 본다.
 */
export function detectClientContext(ua: string, nativePlatform?: string | null): ClientContext {
    const u = String(ua || '')
    const isIOS = /iPhone|iPad|iPod/i.test(u) || (/Macintosh/i.test(u) && /Mobile/i.test(u))
    const isAndroid = /Android/i.test(u)
    const os = isIOS ? 'ios' : isAndroid ? 'android' : /Windows/i.test(u) ? 'windows' : /Mac OS X|Macintosh/i.test(u) ? 'mac' : /Linux/i.test(u) ? 'linux' : 'other'
    const device: 'mobile' | 'pc' = isIOS || isAndroid || /Mobile/i.test(u) ? 'mobile' : 'pc'
    let app_shell: ClientContext['app_shell'] = 'web'
    if (nativePlatform === 'ios') app_shell = 'ios_app'
    else if (nativePlatform === 'android') app_shell = 'android_app'
    return { device, os, app_shell }
}

/** 로그인 화면이 필수 약관 동의 시각을 콜백까지 들고 가는 쿠키. 값 = 판번호:밀리초 */
export const TERMS_COOKIE = 'curi_terms'
export function parseTermsCookie(v: string | null | undefined, now = Date.now()): string | null {
    const m = /^([\w.-]{1,20}):(\d{12,14})$/.exec(String(v || ''))
    if (!m) return null
    const t = Number(m[2])
    // 너무 오래됐거나 미래 시각이면 믿지 않는다 (로그인 한 번 사이만)
    if (t > now + 60_000 || now - t > 24 * 3600_000) return null
    return new Date(t).toISOString()
}

/** SNS, 블로그 링크 연동 보너스 (대표 승인 0928 23:29). 클로버로 준다 (월 한도와 별개). 계정당 한 번
 *  클로버 판매 끝(대표 결정 1002): 화면에는 클로버 대신 「모아 둔 대화 N번」으로 적는다. 주는 양(클로버 50개)은 그대로 */
export const SNS_BONUS_CLOVERS = 50
export const SNS_SUCCESS_LINE = `내 글로 봇이 배웠어요. 모아 둔 대화 ${cloverChats(SNS_BONUS_CLOVERS)}번을 드렸어요`
export const SNS_READ_LINE = '내 글로 봇이 배웠어요'
export const SNS_PENDING_LINE = '이 곳은 아직 읽을 수 없어 링크만 저장했어요 (준비 중)'
/** 붙여넣기 한 편 최소 글자 (너무 짧은 글로 보너스를 받는 남용 방지)와 최대 편수 */
export const SNS_PASTE_MIN_CHARS = 300
export const SNS_PASTE_MAX_POSTS = 3
export const SNS_PASTE_LINE = '자동으로 못 읽었어요. 대표 글을 붙여넣어 주세요'
/** 자동으로 못 읽은 인스타그램, 스레드(비공개 계정)와 페이스북 = 캡처 올리기나 글 붙여넣기 */
export const SNS_CAPTURE_LINE = '자동으로 못 읽었어요(비공개 계정일 수 있어요). 화면 캡처를 올리거나 글을 붙여넣어 주세요'
/** 온보딩에서 자동으로 못 읽었을 때 (붙여넣기는 설정에서) */
export const SNS_PASTE_LATER_LINE = '자동으로 못 읽었어요. 설정에서 글을 붙여넣을 수 있어요'
export const SNS_KEY_TAKEN_LINE = '내 글로 봇이 배웠어요. 이 주소는 다른 계정이 이미 보너스를 받았어요'
export const SNS_HINT = `유튜브, 블로그, 인스타그램, 스레드(공개 계정) 주소를 넣으면 봇이 내 글을 배우고 처음 한 번 대화 ${cloverChats(SNS_BONUS_CLOVERS)}번을 더 드려요`

// 화면 쪽 저장 (첫 대화 칩과 예시 대화가 읽는다)
export const SURVEY_LOCAL_KEY = 'curi:survey-help'
export const SURVEY_BOT_LOCAL_KEY = 'curi:survey-bot'
export const FIRST_SENT_LOCAL_KEY = 'curi:first-sent'
export const SURVEY_EVENT = 'curi:survey'
