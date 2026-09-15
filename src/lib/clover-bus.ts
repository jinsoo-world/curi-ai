/**
 * 클로버가 바뀌면 화면 곳곳에 알린다 — 대표 지적 2026-09-15
 * 「눌러서 클로버 받기 하면 클로버가 바로바로 올라가야지」
 *
 * 무슨 일이었나 = 클로버를 받으면 그 자리의 숫자만 바뀌고 위 띠는 몰랐다.
 * 새로고침해야 올라갔다. 사진을 만들어 클로버가 줄 때도 마찬가지였다.
 *
 * 서로 남남인 화면끼리 알리는 가장 가벼운 길로 브라우저 이벤트를 쓴다.
 */
const 이름 = 'curi:clover'

/**
 * 지금 잔액을 여기 한 곳에 들고 있는다 — 2026-09-15
 * 손님 상태로 처음부터 끝까지 돌려보다 찾았다. 잔액이 0인데 만들기가 눌려서
 * 서버까지 갔다가 거절당했고, 그 바람에 애써 만든 사진이 화면에서 지워졌다.
 * 이제 누르기 전에 여기서 먼저 보고 막는다.
 */
let 지금값: number | null = null

/** 지금 잔액. 아직 모르면 null */
export function 지금클로버(): number | null {
    return 지금값
}

/** 잔액이 바뀌었다고 알린다 */
export function 클로버알림(새잔액: number) {
    지금값 = 새잔액
    if (typeof window === 'undefined') return
    try {
        window.dispatchEvent(new CustomEvent(이름, { detail: 새잔액 }))
    } catch {
        // 알림에 실패해도 서비스는 멀쩡해야 한다
    }
}

/** 잔액이 바뀌면 불러 달라고 걸어둔다. 치우는 함수를 돌려준다 */
export function 클로버듣기(할일: (새잔액: number) => void): () => void {
    if (typeof window === 'undefined') return () => {}
    const 손 = (e: Event) => {
        const v = (e as CustomEvent<number>).detail
        if (typeof v === 'number' && Number.isFinite(v)) 할일(v)
    }
    window.addEventListener(이름, 손)
    return () => window.removeEventListener(이름, 손)
}

/**
 * 「방금 이만큼 썼다」를 알린다 — 대표 지적 2026-09-15
 * 「만들기 누르면 애니메이션 효과로 클로버가 차감되어야지」
 *
 * 만들기를 누르면 서버는 그 자리에서 클로버를 뺀다. 그런데 사진이 나오기까지 20초가 걸려서
 * 그동안 위 띠의 숫자는 그대로였다. 낸 게 눈에 안 보이면 「낸 건가 안 낸 건가」로 불안하다.
 * 그래서 누른 순간 화면에서 먼저 빼고, 숫자가 굴러 내려가는 것을 보여준다.
 * 만들다 실패하면 서버가 되돌려주고, 화면도 같이 되돌린다.
 */
const 씀이름 = 'curi:clover-spend'

/** 방금 쓴 만큼 화면에서 뺀다 (음수를 주면 되돌림) */
export function 클로버썼다(얼마: number) {
    if (지금값 !== null) 지금값 = Math.max(0, 지금값 - 얼마)
    if (typeof window === 'undefined') return
    try {
        window.dispatchEvent(new CustomEvent(씀이름, { detail: 얼마 }))
    } catch {
        // 알림에 실패해도 서비스는 멀쩡해야 한다
    }
}

/** 되돌림 — 만들다 실패했을 때 */
export function 클로버되돌림(얼마: number) {
    클로버썼다(-얼마)
}

/** 쓴 만큼 알려주면 불러 달라고 걸어둔다. 치우는 함수를 돌려준다 */
export function 클로버씀듣기(할일: (얼마: number) => void): () => void {
    if (typeof window === 'undefined') return () => {}
    const 손 = (e: Event) => {
        const v = (e as CustomEvent<number>).detail
        if (typeof v === 'number' && Number.isFinite(v)) 할일(v)
    }
    window.addEventListener(씀이름, 손)
    return () => window.removeEventListener(씀이름, 손)
}
