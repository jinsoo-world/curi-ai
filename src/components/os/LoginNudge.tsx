'use client'
// 로그인(회원가입) 유도 모달. 대표 지시 0923: 「로그인하면 대화 한도 2배로 드려요!」
//
// 언제 뜨나 (손님만, 하루 1번):
//   1) 손님이 대화를 3번 보냈을 때 (OsChat 이 window 이벤트 'curi:guest-sent' 를 쏜다)
//   2) 손님 한도에 닿았을 때 (서버가 guestLimit 을 돌려주면 'curi:login-nudge' { reason: 'limit' })
// 한도에 닿았을 때는 하루 1번 제한 없이 항상 뜬다.
import { useCallback, useEffect, useState } from 'react'

const SEEN_KEY = 'os-login-nudge-day'
const COUNT_KEY = 'os-guest-sent-count'
const NUDGE_AFTER = 3

function today(): string {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}
function read(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, v: string) {
    try { localStorage.setItem(key, v) } catch { /* 저장 막힌 브라우저면 그냥 넘어간다 */ }
}

/** 손님이 한 번 보낼 때마다 부른다. 오늘 3번째면 true */
export function countGuestSend(): boolean {
    const raw = read(COUNT_KEY)
    const [day, n] = raw ? raw.split('|') : ['', '0']
    const next = day === today() ? Number(n) + 1 : 1
    write(COUNT_KEY, `${today()}|${next}`)
    return next === NUDGE_AFTER
}

export default function LoginNudge({ guest, next = '/os' }: { guest: boolean; next?: string }) {
    const [open, setOpen] = useState<null | 'soft' | 'limit'>(null)

    const show = useCallback((reason: 'soft' | 'limit') => {
        if (reason === 'soft' && read(SEEN_KEY) === today()) return
        write(SEEN_KEY, today())
        setOpen(reason)
    }, [])

    useEffect(() => {
        if (!guest) return
        const onSent = () => { if (countGuestSend()) show('soft') }
        const onNudge = (e: Event) => show((e as CustomEvent).detail?.reason === 'limit' ? 'limit' : 'soft')
        window.addEventListener('curi:guest-sent', onSent)
        window.addEventListener('curi:login-nudge', onNudge)
        return () => {
            window.removeEventListener('curi:guest-sent', onSent)
            window.removeEventListener('curi:login-nudge', onNudge)
        }
    }, [guest, show])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open])

    if (!guest || !open) return null
    const href = `/login?next=${encodeURIComponent(next)}`
    return (
        <div className="os-sheet-back" role="presentation" onClick={() => setOpen(null)}>
            <div className="os-sheet" role="dialog" aria-modal="true" aria-labelledby="login-nudge-title"
                onClick={e => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: 420 }}>
                <div aria-hidden style={{ fontSize: 44, lineHeight: 1 }}>🍀</div>
                <h3 id="login-nudge-title" style={{ marginTop: 12 }}>
                    {open === 'limit' ? '오늘 체험 대화를 다 썼어요' : '로그인하면 대화 한도 2배로 드려요!'}
                </h3>
                <p style={{ color: 'var(--os-글-흐림)', fontSize: 16, lineHeight: 1.6, margin: '10px 0 18px' }}>
                    {open === 'limit'
                        ? '로그인하면 대화 한도가 2배로 늘고, 내 봇 팀과 나눈 대화가 그대로 남아요.'
                        : '카카오나 구글로 3초면 끝나요. 내 봇 팀과 나눈 대화도 그대로 남아요.'}
                </p>
                <a href={href} className="os-cta" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', background: '#03C124', color: '#fff' }}>
                    로그인하고 2배로 받기
                </a>
                <button type="button" onClick={() => setOpen(null)}
                    style={{ marginTop: 12, background: 'none', border: 0, color: 'var(--os-글-흐림)', fontSize: 15, cursor: 'pointer', minHeight: 44 }}>
                    {open === 'limit' ? '닫기' : '나중에 할게요'}
                </button>
            </div>
        </div>
    )
}
