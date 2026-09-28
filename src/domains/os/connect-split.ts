// 연결 화면(/os/connect) 목록 나누기 (대표 승인 0928 사용성 7번).
// 누를 수 없는 회색 「연결하기」를 줄줄이 두지 않는다: 지금 붙일 수 있는 것만 줄로 보이고,
// 아직 안 열린 것은 「곧 열려요」 한 칸에 이름만 모은다. 로그인 전이면 맨 위에 로그인 안내.
// 브라우저에서 도는 화면이 쓰므로 여기엔 아무것도 가져오지 않는다(타입만 받는다).

export interface ConnectServiceLike {
    id: string
    ready: boolean
    comingSoon?: boolean
    connected: unknown | null
}

export interface ConnectSplit<T> {
    /** 줄로 보일 것 (연결됨, 지금 붙일 수 있음, 열쇠 붙이기 옛길) */
    active: T[]
    /** 「곧 열려요」에 이름만 모을 것 */
    soon: T[]
    /** 로그인하면 연결할 수 있어요 안내를 보일지 */
    needLogin: boolean
}

export function splitConnectServices<T extends ConnectServiceLike>(
    services: T[],
    opts: { enabled: boolean; loggedIn: boolean; pasteIds?: readonly string[] },
): ConnectSplit<T> {
    const paste = new Set(opts.pasteIds ?? [])
    const active: T[] = []
    const soon: T[] = []
    for (const s of services) {
        const usable = !!s.connected
            || (opts.enabled && s.ready && !s.comingSoon)
            || (opts.enabled && !s.ready && !s.comingSoon && paste.has(s.id))
        ;(usable ? active : soon).push(s)
    }
    // 로그인 전이고 지금 붙일 수 있는 게 있으면 로그인부터. 다 준비 중이면 로그인 안내 대신 「곧 열려요」만
    return { active, soon, needLogin: !opts.loggedIn && active.length > 0 }
}
