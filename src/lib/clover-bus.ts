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

/** 잔액이 바뀌었다고 알린다 */
export function 클로버알림(새잔액: number) {
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
