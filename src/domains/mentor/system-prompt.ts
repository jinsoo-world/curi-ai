// domains/mentor — 봇 지시문(mentors.system_prompt) 글자 한도. 대표 확정 2026-10-07: 12,000자 → 30,000자
//
// 한도는 여기 한 곳에만 둔다(서버 창구, 공개 관문, 봇 이해 묶음, 웹 화면이 전부 이 값을 쓴다).
// 넘으면 자르지 않는다 = 주인이 모르게 뒷부분이 사라지지 않게 막고 문구로 알린다.
// 화면 묶음도 이 파일을 끌어오므로 서버 전용 모듈을 넣지 않는다.

/** 최대 글자 수(글자 단위, 그림 글자도 1자 = Postgres char_length 와 같은 셈) */
export const SYSTEM_PROMPT_MAX = 30_000

/** 넘었을 때 주인에게 보여 주는 문구 */
export const SYSTEM_PROMPT_TOO_LONG = `지시문은 ${SYSTEM_PROMPT_MAX.toLocaleString('ko-KR')}자까지 쓸 수 있어요`

/** 글자 수 (UTF-16 이 아니라 글자 단위) */
export function systemPromptLength(s: string): number {
    return [...s].length
}

/** 한도를 넘었는가. 글이 아니면 false(부르는 쪽이 따로 거른다) */
export function systemPromptTooLong(v: unknown): boolean {
    return typeof v === 'string' && systemPromptLength(v) > SYSTEM_PROMPT_MAX
}

/** 공개 관문(applyBotEdit)이 아무것도 쓰기 전에 던진다. 창구는 400 으로 바꾼다 */
export class SystemPromptTooLong extends Error {
    constructor() { super(SYSTEM_PROMPT_TOO_LONG); this.name = 'SystemPromptTooLong' }
}
