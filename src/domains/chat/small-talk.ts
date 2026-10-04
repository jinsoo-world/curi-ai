// 인사와 자기소개 질문 가려내기 (2026-10-05).
// 「안녕하세요」 「넌 누구야?」 는 자료에서 찾을 말이 아니다. 자료만 쓰는(Strict) 봇이 이런 말에
// 「자료에 없어서 답하기 어려워요」 로 거절하던 문제를 막는다.
// 짧고 뻔한 말만 잡는다. 인사 뒤에 진짜 질문이 붙으면(예: 「안녕하세요 환불 규정 알려주세요」) 잡지 않는다.

export type SmallTalkKind = 'greeting' | 'identity' | 'thanks' | 'bye'

/** 글자와 숫자만 남기고 소문자로 */
function squash(text: string): string {
    return String(text ?? '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** 말끝에 붙는 것 (요, 야, 용, ㅋㅋ, ㅎㅎ ...) */
const TAIL = '(?:요|용|염|여|야|임|죠|어|니|냐|이야|이에요|이예요|이니|이냐|이세요|이신가요|인가요|입니까|입니다|에요|예요|세요|어요|나요|습니까|ㅋ+|ㅎ+|ㅠ+|ㅜ+)*'

const GREETING = [
    '안녕', '안녕하세', '안녕하십니까', '안녕하셔', '안뇽', '하이', '헬로', '헬로우', 'hello', 'hi', 'hey', 'hihi', 'ㅎㅇ', 'ㅎㅇㅎㅇ',
    '반가워', '반갑', '반갑습니다', '반가워요', '처음뵙겠습니다', '처음뵈요', '처음뵙겠어요',
    '좋은아침', '좋은아침이에요', '굿모닝', '좋은저녁', '굿이브닝', '굿애프터눈', '여보세요', '계세요', '거기계세요',
    '안녕하세요반갑습니다', '안녕반가워',
]
const IDENTITY = [
    '누구', '누구세', '누구십니까', '누구니', '누구냐', '누구신가', '누구시', '누구야', '누군',
    '너누구', '넌누구', '너는누구', '당신누구', '당신은누구', '당신은누구세', '넌누군', '너는누군', '너누군',
    '넌뭐', '너뭐', '너는뭐', '넌뭐니', '넌뭐야', '너뭐야', '너뭐니', '너는뭐야', '너정체가뭐', '정체가뭐', '정체뭐',
    '이름이뭐', '이름뭐', '이름이뭔', '이름이머', '이름이어떻게', '이름알려', '이름이뭐니', '이름이뭐예', '이름이뭐에', '이름뭐예', '이름뭐에',
    '뭐라고불러', '뭐라고부르', '널뭐라고', '자기소개', '자기소개해', '자기소개해줘', '자기소개해주세', '자기소개좀', '소개해줘', '소개해주세', '소개좀', '너소개', '넌소개', '스스로소개',
    '뭐하는', '뭐하는애', '뭐하는봇', '뭐하는친구', '뭐하는곳', '무슨봇', '어떤봇', '무슨일', '어떤일', '뭘할수있', '뭐할수있', '뭘해줄수', '뭘도와', '뭐도와', '뭐해줄수', '무엇을할수', '무엇을도와', '무슨도움',
    '너ai', '너는ai', '넌ai', 'ai야', 'ai니', 'ai맞', '너봇', '봇이야', '봇이니', '사람이야', '사람이니', '사람이에요', '사람이세', '너사람', '너는사람', '진짜사람', '로봇이야', '로봇이니',
    '누가만들', '누가만든', '누가만드', '누구가만들', '어떻게만들', '만든사람',
]
const THANKS = ['고마워', '고맙', '고맙습니다', '감사', '감사합니다', '감사해', '감사드려', '땡큐', 'thanks', 'thankyou', 'thx', 'ㄱㅅ', 'ㄳ', '고마워요', '고마웡']
const BYE = ['잘가', '잘있어', '바이', '바이바이', '안녕히계세', '안녕히가세', '안녕히계십시오', '다음에봐', '또봐', '또만나', '내일봐', '이만', '수고하세', '수고', 'bye', 'byebye', '굿나잇', '잘자']

function matcher(words: string[]): RegExp {
    const alt = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|')
    return new RegExp(`^(?:${alt})${TAIL}$`, 'u')
}
const RE: [SmallTalkKind, RegExp][] = [
    ['identity', matcher(IDENTITY)],
    ['greeting', matcher(GREETING)],
    ['thanks', matcher(THANKS)],
    ['bye', matcher(BYE)],
]

/** 인사·자기소개·감사·작별이면 종류를, 아니면 null */
export function detectSmallTalk(text: string): SmallTalkKind | null {
    const s = squash(text)
    if (!s || s.length > 24) return null
    // 「안녕하세요 넌 누구야」 처럼 인사 + 자기소개 질문이 붙은 것도 허용한다 (둘 다 뻔한 말일 때만)
    for (const [kind, re] of RE) if (re.test(s)) return kind
    for (const g of [...GREETING].sort((a, b) => b.length - a.length)) {
        if (s.startsWith(g) && s.length > g.length) {
            const rest = s.slice(g.length).replace(/^(?:요|용|염|여|ㅋ+|ㅎ+)+/, '')
            if (RE[0][1].test(rest)) return 'identity'
        }
    }
    return null
}

/**
 * 인사, 자기소개 질문일 때 시스템 프롬프트 끝에 붙일 안내.
 * 자료만 쓰는 봇이어도 이 말에는 거절하지 않고 봇 자신의 이름과 말투로 답하게 한다. 사실을 지어내지는 못하게 한다.
 */
export function smallTalkPrompt(kind: SmallTalkKind, bot: { name?: string | null; title?: string | null; description?: string | null }): string {
    const who = [bot.name, bot.title].filter(Boolean).join(' / ')
    const about = bot.description ? `\n- 이 봇을 소개하는 글(이 안의 내용만 말해도 됨): ${String(bot.description).slice(0, 400)}` : ''
    const common =
        '이 질문은 자료에서 찾을 질문이 아니라 대화의 기본 예의다. 「자료에 없어서 답하기 어려워요」 같은 거절 문구를 쓰지 말고, 위 지침의 말투와 성격 그대로 자연스럽게 짧게(1~3문장) 답하라.\n' +
        '- 지침과 위 소개에 적힌 이름, 하는 일, 말투만 말하라. 적혀 있지 않은 경력, 학력, 수치, 가격, 일정, 사건은 절대 만들어 내지 마라.\n' +
        '- AI 봇이라는 사실을 숨기지 마라. 사람인 척하지 마라.\n' +
        '- 답 끝에 무엇을 도와줄 수 있는지 한 줄로 물어보면 좋다.'
    const lead =
        kind === 'identity' ? '[자기소개 질문] 사용자가 너에 대해 묻고 있다. 너는 지금 이 봇이다. 이름과 역할을 말해 줘라.'
            : kind === 'greeting' ? '[인사] 사용자가 인사를 했다. 같이 인사하고 반갑게 맞이하라.'
                : kind === 'thanks' ? '[감사] 사용자가 고맙다고 했다. 따뜻하게 받아 주라.'
                    : '[작별] 사용자가 작별 인사를 했다. 짧게 인사하고 다음에 또 오라고 하라.'
    return `\n\n${lead}\n- 이 봇: ${who || '(이름은 위 지침 참고)'}${about}\n- ${common}`
}
