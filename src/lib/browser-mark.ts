/**
 * 브라우저 표식 — 전수조사 26번
 *
 * 비회원 무료 한 장을 IP 로만 막으면 두 가지가 틀어진다.
 *  - 같은 카페·같은 집 와이파이의 다른 사람이 막힌다
 *  - 휴대폰 데이터를 껐다 켜면 얼마든지 다시 쓴다
 * 그래서 이 브라우저에만 남는 표식을 하나 만들어 같이 본다.
 * 사람을 알아보는 값이 아니다. 아무 뜻 없는 임의의 글자다.
 */
const 키 = 'curi_mark'

export function 브라우저표식(): string | null {
    try {
        let v = localStorage.getItem(키)
        if (!v) {
            v = (crypto.randomUUID?.() ?? String(Math.random())).replace(/-/g, '')
            localStorage.setItem(키, v)
        }
        return v
    } catch {
        return null
    }
}
