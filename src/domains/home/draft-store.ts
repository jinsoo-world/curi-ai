// domains/home: /home 에서 넣은 것을 브라우저에 잠시 보관했다가, 가입(로그인) 직후 /os 에서 이어 초안을 만든다.
// 서버에는 아무것도 저장하지 않는다. 하루가 지나면 버린다.

export const HOME_DRAFT_KEY = 'curi-home-draft'
export const HOME_DRAFT_TTL_MS = 24 * 60 * 60 * 1000
/** 가입 뒤 돌아갈 곳: 봇 만들기 창이 「내 링크로 만들기」로 열린다 */
export const HOME_DRAFT_NEXT = '/os?new=1'

export interface HomeDraft {
    links: string[]
    pastes: string[]
    consents: boolean[]
    savedAt: number
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function saveHomeDraft(store: Store | null | undefined, d: Omit<HomeDraft, 'savedAt'>, now = Date.now()): boolean {
    if (!store) return false
    try {
        store.setItem(HOME_DRAFT_KEY, JSON.stringify({
            links: d.links.map(s => String(s).trim()).filter(Boolean).slice(0, 3),
            pastes: d.pastes.map(s => String(s)).filter(s => s.trim()).slice(0, 3).map(s => s.slice(0, 8000)),
            consents: d.consents.map(Boolean),
            savedAt: now,
        }))
        return true
    } catch { return false }
}

export function readHomeDraft(store: Pick<Storage, 'getItem'> | null | undefined, now = Date.now()): HomeDraft | null {
    if (!store) return null
    try {
        const raw = store.getItem(HOME_DRAFT_KEY)
        if (!raw) return null
        const d = JSON.parse(raw) as Partial<HomeDraft>
        if (typeof d.savedAt !== 'number' || now - d.savedAt > HOME_DRAFT_TTL_MS || now < d.savedAt - 60_000) return null
        const links = Array.isArray(d.links) ? d.links.map(String).filter(Boolean).slice(0, 3) : []
        const pastes = Array.isArray(d.pastes) ? d.pastes.map(String).filter(s => s.trim()).slice(0, 3) : []
        if (links.length === 0 && pastes.length === 0) return null
        return { links, pastes, consents: Array.isArray(d.consents) ? d.consents.map(Boolean) : [], savedAt: d.savedAt }
    } catch { return null }
}

export function clearHomeDraft(store: Pick<Storage, 'removeItem'> | null | undefined): void {
    try { store?.removeItem(HOME_DRAFT_KEY) } catch { /* 저장 막힘 */ }
}
