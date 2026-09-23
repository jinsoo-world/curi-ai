// domains/agent — 「A봇에게 말하면 B봇에게 옮겨 주기」(전달) 알아채기
//
// 왜 필요한가 = 사람은 방을 옮겨 다니며 같은 말을 두 번 하기 싫다.
// 「홍보팀장에게 이거 전달해 줘: …」 라고 하면 지금 방의 봇이 옆 봇에게 대신 말을 옮기고,
// 옆 봇의 답을 **지금 방으로 갖고 온다**.
//
// 그록봇 원칙 두 가지를 코드로 못 박는다:
//   ① 사용자 눈에 「보낸 사람 ○○ → ○○」 표식이 **반드시** 보인다(누가 한 말인지 속지 않게).
//   ② 봇끼리 서로 답하며 돌지 않는다. 전달은 **한 번 건너가고 한 번 돌아온다**(2턴).
//
// 이 파일은 **순수 함수만** 둔다(모델·DB 호출 없음). 규칙만으로 가르므로 클로버를 쓰지 않는다.

/** 내 팀의 봇 한 명 (이름으로 찾는다) */
export interface RelayBot {
    mentorId: string
    name: string
}

/** 「누구에게 무엇을」 */
export interface RelayIntent {
    mentorId: string
    name: string
    /** 옆 봇에게 옮길 말 (원문에서 「○○에게 전달해 줘」 같은 껍데기를 뺀 알맹이) */
    message: string
}

/** 이름 뒤에 붙어야 하는 조사. 「홍보팀장에게」 「홍보팀장님께」 「개발팀장한테」 */
const 조사 = /^\s*(님)?\s*(에게|한테|께)/

/** 옮겨 달라는 말버릇. 하나도 없으면 그냥 그 이름을 말한 것뿐이다 */
const 전달말 = /(전달|전해|보내|알려|물어|여쭤|여쭈|여쭙)/

/** 앞에 붙는 껍데기. 「이거 전달해 줘:」 「물어봐 줘」 */
const 앞껍데기 = /^[\s,，]*(?:이거|이걸|이것|그거|그걸|내용)?\s*(?:좀\s*)?(?:전달|전해|보내|알려|물어봐|물어|여쭤|여쭈어|여쭙)(?:해|해서)?\s*(?:주세요|줘요|줘|주라|봐)?[\s:：,，]*/

/** 뒤에 붙는 껍데기. 「… 라고 전달해 줘」 (앞 글자를 잘라먹지 않게 반드시 띄어쓰기부터 문다) */
const 뒤껍데기 = /(?:\s+|^)(?:좀\s*)?(?:전달|전해|보내|알려|물어봐|물어|여쭤|여쭈어|여쭙)(?:해|해서)?\s*(?:주세요|줘요|줘|주라|봐)?\s*[.!?~]*$/

/** 옮기는 말 최대 길이 */
const MAX_MESSAGE = 2000

/**
 * 사람 말에서 **대상 봇과 옮길 내용**을 뽑는다.
 *
 * 규칙:
 * - 이름은 **내 팀 목록에 있는 것만** 본다. 팀에 없는 이름이면 null = 평소대로 지금 봇이 답한다.
 * - 이름 뒤에 「에게/한테/께」가 붙어야 한다(그냥 이름을 말한 것과 가른다).
 * - 「전달/보내/물어봐/알려」 같은 말버릇이 있어야 한다.
 * - 지금 말하고 있는 봇 자신에게는 전달하지 않는다(excludeMentorId).
 * - 옮길 내용이 비면 null(빈 말을 옆 봇에게 던지지 않는다).
 */
export function readRelayIntent(
    text: string,
    bots: readonly RelayBot[],
    excludeMentorId?: string | null,
): RelayIntent | null {
    const t = (text ?? '').trim()
    if (!t || !bots || bots.length === 0) return null

    // ① 제일 앞에 나온 「이름 + 조사」 하나를 고른다
    let hit: { at: number; end: number; bot: RelayBot } | null = null
    for (const b of bots) {
        if (!b?.name) continue
        if (excludeMentorId && b.mentorId === excludeMentorId) continue
        let from = 0
        for (;;) {
            const at = t.indexOf(b.name, from)
            if (at < 0) break
            const m = t.slice(at + b.name.length).match(조사)
            if (m) {
                if (!hit || at < hit.at) hit = { at, end: at + b.name.length + m[0].length, bot: b }
                break
            }
            from = at + 1
        }
    }
    if (!hit) return null

    // ② 옮겨 달라는 말인가
    const 뒤쪽 = t.slice(hit.end)
    if (!전달말.test(뒤쪽)) return null

    // ③ 옮길 알맹이 꺼내기
    let body = 뒤쪽
    const 콜론 = body.search(/[:：]/)
    if (콜론 >= 0 && 전달말.test(body.slice(0, 콜론))) {
        // 「… 전달해 줘: 알맹이」 = 콜론 뒤가 통째로 알맹이
        body = body.slice(콜론 + 1)
    } else {
        body = body.replace(앞껍데기, '').replace(뒤껍데기, '')
    }
    body = body.trim()

    // ④ 뒤에 아무것도 없으면 이름 **앞**을 본다 (「… 개발팀장한테 물어봐 줘」)
    if (!body) body = t.slice(0, hit.at).replace(뒤껍데기, '').trim()
    if (!body) return null

    return { mentorId: hit.bot.mentorId, name: hit.bot.name, message: body.slice(0, MAX_MESSAGE) }
}

/** 한글 낱말 끝에 받침이 있나 (「기획팀장」 O, 「비서」 X) */
export function hasFinalConsonant(word: string): boolean {
    const w = (word ?? '').trim()
    if (!w) return false
    const code = w.charCodeAt(w.length - 1)
    if (code < 0xac00 || code > 0xd7a3) return false   // 한글 음절이 아니면 받침을 따지지 않는다
    return (code - 0xac00) % 28 !== 0
}

/**
 * 옮긴 말 앞에 붙이는 표식. 예) `[기획팀장이 전달]`
 * 받는 봇의 대화창에 그대로 남는다 = 사람이 나중에 봐도 누가 옮긴 말인지 안다.
 */
export function relayPrefix(fromName: string): string {
    const 이름 = (fromName ?? '').trim() || '옆 봇'
    return `[${이름}${hasFinalConsonant(이름) ? '이' : '가'} 전달]`
}

/** 옮긴 말 전체 (표식 + 원문) */
export function withRelayPrefix(fromName: string, message: string): string {
    return `${relayPrefix(fromName)} ${(message ?? '').trim()}`
}

/**
 * 돌아온 답의 첫 줄. 예) `【홍보팀장의 답】`
 * 원래 방(기획팀장 방)에 남는 말이라 **누구의 답인지 본문 첫 줄에 박아 둔다**
 * (지금 표에는 「보낸 사람」 칸이 없다).
 */
export function relayAnswerHeader(toName: string): string {
    return `【${(toName ?? '').trim() || '옆 봇'}의 답】`
}

/** 돌아온 답 전체 (표식 첫 줄 + 답) */
export function withRelayAnswerHeader(toName: string, answer: string): string {
    return `${relayAnswerHeader(toName)}\n${(answer ?? '').trim()}`
}

/** 화면 회색 줄. 예) 「기획팀장 → 홍보팀장에게 전달했어요」 */
export function relaySentLine(fromName: string, toName: string): string {
    return `${fromName} → ${toName}에게 전달했어요`
}
