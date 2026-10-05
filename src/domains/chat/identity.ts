// 봇 정체 지키기 (2026-10-05).
// 봇이 「너 무슨 AI야」 에 「업스테이지 솔라 4입니다」 라고 답했다(대표 발견). 봇은 리더를 닮은 큐리AI 봇이다.
// 두 겹으로 막는다: ① 지침 맨 끝에 정체 안내 ② 답에 새어 나온 「봇 자신의」 모델 이름을 가린다(응답 필터에서).
// AI 라는 사실은 숨기지 않는다. 어떤 회사의 어떤 모델인지만 말하지 않는다.
// ⛔ 「챗GPT 쓰는 법」 처럼 남의 AI 를 설명하는 답은 건드리지 않는다. 가리는 건 업스테이지 솔라(우리가 실제로 쓰는 것)와
//    「저는 ○○입니다」 같은 자기소개 모양뿐이다.

export function identityGuardPrompt(botName: string | null | undefined): string {
    const name = String(botName ?? '').trim()
    const who = name ? `큐리AI에서 만든 「${name}」 봇` : '큐리AI에서 만든 봇'
    return `[🪪 정체]
너는 ${who}이다. 「누가 만들었어」 「무슨 AI야」 「무슨 모델이야」 「GPT야?」 같은 질문에는 「${who}이에요」처럼 답한다.
너 자신이 어떤 회사의 어떤 언어 모델로 돌아가는지(솔라, 업스테이지, 제미나이, 구글, GPT, 오픈AI, 클로드 등)는 절대 말하지 않는다. 모른다고 하지도 말고 큐리AI 봇이라고만 말한다.
(다른 AI 서비스 쓰는 법을 묻는 질문에는 평소처럼 답해도 된다. 감출 것은 너 자신의 정체뿐이다.)
AI 봇이라는 사실은 숨기지 않는다.`
}

const REPLACE = '큐리AI'
// 이름 뒤에 붙는 판 이름: 프로, 미니, 4, 4.5 ... 뒤에 한글, 영문, 숫자가 바로 이어지면(솔라프로젝트) 판 이름이 아니다
// 숫자 판(4, 4.5) 뒤에는 「입니다」 같은 한글이 붙어도 된다. 숫자만 따로 쓰이는 「솔라 10장」 은 업스테이지나 자기소개가 같이 있을 때만 걸린다
const VER = String.raw`(?:\s*(?:(?:프로|미니|pro|mini|llm)(?![가-힣A-Za-z0-9])|\d+(?:\.\d+)?(?![0-9A-Za-z])))*`
const SELF = String.raw`((?:저는|제가|나는|난|제\s*이름은|i\s*am|i'm)\s*)`
const COPULA = String.raw`(?=\s*(?:입니다|이에요|예요|이야|야|이고|라고|라는|모델|기반|[.,!?]|$))`

const MODEL_NAME_PATTERNS: [RegExp, string][] = [
    // 업스테이지가 붙은 솔라 = 우리 모델 그 자체. 어디서 나와도 가린다
    [new RegExp(String.raw`(?:업스테이지|upstage)(?:'s|의|에서\s*만든)?\s*(?:솔라|solar)${VER}`, 'gi'), REPLACE],
    [new RegExp(String.raw`(?:솔라|solar)${VER}\s*(?:by|from)\s*(?:업스테이지|upstage)`, 'gi'), REPLACE],
    [/업스테이지/g, REPLACE],
    // 「저는 솔라예요」 「나는 제미나이 기반이야」 「I'm GPT-4」 같은 자기소개만
    [new RegExp(SELF + String.raw`(?:솔라|solar|(?:구글\s*)?제미나이|(?:google\s*)?gemini|챗\s*gpt|chatgpt|gpt-?\d*(?:\.\d+)?o?|클로드|claude)${VER}${COPULA}`, 'gi'), `$1${REPLACE}`],
]

/** 답에 새어 나온 봇 자신의 모델 이름을 「큐리AI」 로 바꾼다. 평범한 말(솔라 패널, 챗GPT 쓰는 법)은 건드리지 않는다 */
export function scrubModelNames(text: string): string {
    let out = String(text ?? '')
    for (const [re, to] of MODEL_NAME_PATTERNS) out = out.replace(re, to)
    return out
}
