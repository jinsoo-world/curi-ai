// domains/agent — 「밖으로 내보내려는 말」 알아채기 (승인 카드의 1단계)
//
// 왜 필요한가 = 봇이 「보내 줘」 라는 말을 듣고 그냥 답만 하면, 사람은 보냈다고 믿는다.
// 우리는 반대로 한다. 밖으로 나가는 말이 나오면 답 대신 **초안 + 승인 카드**를 만든다.
// 실제 발신은 사람이 「허용」을 누른 뒤, 발신 담당(메시징 에이전트)이 한다.
//
// 이 파일은 **순수 함수만** 둔다(모델 호출 없음). 모델(솔라 미니)을 부르는 쪽은 API 다.
//  - classifyByRules : 규칙(한국어 말버릇)으로 먼저 본다. 확실하면 모델을 안 부른다 = 빠르고 싸다.
//  - buildIntentPrompt / parseIntentJson : 규칙이 애매할 때 솔라 미니에게 물어보는 말과 답 읽기.

import type { IrreversibleAction } from './tool-gate'

/** 되돌릴 수 없는 행동 8종 + 「그런 뜻 아님」 */
export type IntentAction = IrreversibleAction | 'none'

export const INTENT_ACTIONS: readonly IntentAction[] = [
    'send_message', 'publish', 'purchase', 'transfer',
    'delete', 'change_permission', 'accept_terms', 'other', 'none',
] as const

export interface IntentGuess {
    action: IntentAction
    /** true = 규칙만으로 확실하다. false = 모델에게 한 번 더 물어볼 만하다 */
    confident: boolean
    /** 왜 그렇게 봤는지 (로그, 화면 설명용) */
    reason: string
}

/**
 * 「초안만 달라」는 말. 이게 있으면 보내 달라는 뜻이 아니다.
 * 예) 「답장 초안 써 줘」 「보낼 내용만 정리해 줘」 → 카드 만들지 않는다.
 */
const DRAFT_ONLY = /(초안|시안|샘플|예시|문구만|내용만|글만|뭐라고|어떻게 쓰|써 ?줘|써줘|작성해|정리해|다듬어|고쳐)/

/** 「보내지 마」 같은 부정. 있으면 카드 안 만든다 */
const NEGATION = /(보내지 ?마|하지 ?마|안 ?보내|취소|그만|말고)/

/** 행동별 말버릇. 앞에 올수록 센 신호 */
const PATTERNS: { action: IrreversibleAction; re: RegExp }[] = [
    { action: 'transfer', re: /(이체|송금|입금해|계좌로 (보내|쏴)|돈을? (보내|부쳐))/ },
    { action: 'purchase', re: /(결제해|구매해|주문해|사 ?줘|사줘|장바구니.*결제|카드로 (긁|결제))/ },
    { action: 'publish', re: /(게시해|게시하|올려 ?줘|올려줘|업로드해|공개로 ?바꿔|공개해|발행해|포스팅해|배포해)/ },
    { action: 'delete', re: /(삭제해|지워 ?줘|지워줘|없애 ?줘|없애줘|덮어써|초기화해)/ },
    { action: 'change_permission', re: /(권한을? ?(줘|바꿔|변경)|관리자로 ?(만들|바꿔)|공유 ?설정.*(바꿔|변경))/ },
    { action: 'accept_terms', re: /(약관.*(동의|수락)|이용약관.*체크|개인정보.*동의해)/ },
    { action: 'send_message', re: /(보내 ?줘|보내줘|보내 ?주세요|발송해|전송해|메일 ?보내|문자 ?보내|답장 ?보내|회신해|전달해 ?줘|전달해줘|보낼래|보내자)/ },
]

/** 「누구에게」가 붙으면 발신 의도가 더 확실하다 */
const RECIPIENT = /(에게|한테|께|님에게|님한테|수신자|받는 ?사람)/

/**
 * 규칙으로 먼저 본다.
 * - 부정, 초안 요청이면 none (확실)
 * - 말버릇이 걸리면 그 행동 (받는 사람까지 있으면 확실)
 * - 아무것도 안 걸리면 none (확실하지 않음 → 모델에게 물어볼 수 있다)
 */
export function classifyByRules(text: string): IntentGuess {
    const t = (text ?? '').trim()
    if (!t) return { action: 'none', confident: true, reason: '빈 말' }

    if (NEGATION.test(t)) {
        return { action: 'none', confident: true, reason: '보내지 말라는 말이 들어 있다' }
    }

    const hit = PATTERNS.find(p => p.re.test(t))
    if (!hit) {
        // 「초안 써 줘」처럼 글만 달라는 말은 더 물어볼 것도 없다.
        if (DRAFT_ONLY.test(t)) return { action: 'none', confident: true, reason: '초안만 달라는 말이다' }
        return { action: 'none', confident: false, reason: '밖으로 내보내는 말버릇이 안 보인다' }
    }

    // 「답장 초안 써 줘」처럼 초안만 달라는 말이면 카드를 만들지 않는다.
    if (DRAFT_ONLY.test(t)) {
        return { action: 'none', confident: true, reason: '초안만 달라는 말이다' }
    }

    const confident = hit.action !== 'send_message' || RECIPIENT.test(t)
    return {
        action: hit.action,
        confident,
        reason: confident ? '말버릇이 확실하다' : '보낸다는 말은 있는데 받는 사람이 안 보인다',
    }
}

/** 솔라 미니에게 물어볼 때 쓰는 말. 구조화 출력(JSON)만 받는다 */
export function buildIntentPrompt(text: string): string {
    return `너는 분류기다. 사용자의 말이 「밖으로 나가는 되돌릴 수 없는 행동」을 시키는 말인지 가른다.

가르는 값(action) 9개 중 하나만 고른다:
- send_message : 메시지, 메일, 문자, 답장을 실제로 보내 달라
- publish      : 글, 영상을 실제로 게시, 공개, 발행해 달라
- purchase     : 실제로 구매, 결제해 달라
- transfer     : 실제로 돈을 이체, 송금해 달라
- delete       : 실제로 지우거나 덮어써 달라
- change_permission : 권한, 공유 설정을 바꿔 달라
- accept_terms : 약관에 동의해 달라
- other        : 위에 없지만 되돌릴 수 없는 행동을 시킨다
- none         : 조사, 요약, 분류, 초안 쓰기, 정리 등 되돌릴 수 있는 일이다

중요:
- 「초안 써 줘」「뭐라고 보낼까」처럼 글만 달라는 말은 none 이다.
- 「보내지 마」처럼 부정하면 none 이다.

JSON 한 개만 출력한다. 설명하지 않는다.
{"action":"<9개 중 하나>","to":"<받는 사람 또는 대상, 없으면 빈 문자열>","what":"<무엇을 하려는지 한국어 한 줄>"}

사용자의 말:
${(text ?? '').slice(0, 1000)}`
}

export interface IntentJson {
    action: IntentAction
    to: string
    what: string
}

/**
 * 모델 답(JSON)을 읽는다. 코드 울타리(```json)나 앞뒤 군말이 붙어도 읽어낸다.
 * 못 읽으면 null → 부르는 쪽이 「없는 것」으로 보고 그냥 대화로 넘어간다(기본 거절 아님, 기본 무행동).
 */
export function parseIntentJson(raw: string): IntentJson | null {
    if (!raw) return null
    const stripped = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    let obj: unknown
    try {
        obj = JSON.parse(stripped.slice(start, end + 1))
    } catch {
        return null
    }
    if (!obj || typeof obj !== 'object') return null
    const o = obj as Record<string, unknown>
    const action = typeof o.action === 'string' ? o.action : ''
    if (!INTENT_ACTIONS.includes(action as IntentAction)) return null
    return {
        action: action as IntentAction,
        to: typeof o.to === 'string' ? o.to.slice(0, 80) : '',
        what: typeof o.what === 'string' ? o.what.slice(0, 200) : '',
    }
}

const ACTION_WORD: Record<IrreversibleAction, string> = {
    send_message: '보내기',
    publish: '게시하기',
    purchase: '구매하기',
    transfer: '이체하기',
    delete: '삭제하기',
    change_permission: '권한 바꾸기',
    accept_terms: '약관에 동의하기',
    other: '되돌릴 수 없는 일 하기',
}

/** 카드 첫 줄. 예) 「김민수님에게 보내기」 */
export function summarizeAction(action: IrreversibleAction, to?: string | null): string {
    const word = ACTION_WORD[action] ?? ACTION_WORD.other
    const who = (to ?? '').trim()
    return who ? `${who}에게 ${word}` : word
}

/** 봇에게 「초안만 쓰라」고 시키는 말 (승인 카드에 넣을 내용 만들기) */
export function buildDraftPrompt(userText: string, action: IrreversibleAction): string {
    const 무엇 = action === 'publish' ? '게시할 글'
        : action === 'send_message' ? '보낼 메시지'
            : '실행할 내용'
    return `아래는 주인이 시킨 말이다. 지금은 **실제로 하지 않는다**. ${무엇}의 초안만 쓴다.

규칙:
- 바로 쓸 수 있는 완성된 글 하나만 쓴다. 설명, 머리말, 「초안입니다」 같은 말은 넣지 않는다.
- 주인의 말투를 따른다. 어려운 말은 쉬운 말로 쓴다.
- 모르는 사실은 지어내지 않는다. 비어 있어야 할 자리는 [ ] 로 표시한다.

주인의 말:
${(userText ?? '').slice(0, 2000)}`
}
