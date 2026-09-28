'use client'
// 설정 > 일반 「내 SNS, 블로그」 (대표 승인 0928 23:29). 링크를 넣으면 공개 글을 읽어 내 봇 자료에 넣는다.
// 유튜브 채널, 네이버 블로그, RSS, 일반 웹은 읽고, 인스타그램, 스레드, X, 틱톡은 링크만 저장한다(준비 중).
import { useCallback, useEffect, useState } from 'react'
import { SNS_HINT } from '@/domains/os/onboarding'
import { 클로버알림 } from '@/lib/clover-bus'

type Link = { id: string; url: string; platform: string; status: 'read' | 'pending' | 'failed'; added_count: number; note: string | null }
const STATUS: Record<Link['status'], string> = { read: '읽음', pending: '준비 중', failed: '못 읽음' }

export default function SnsLinkCard() {
    const [links, setLinks] = useState<Link[]>([])
    const [url, setUrl] = useState('')
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState('')

    const load = useCallback(async () => {
        try {
            const r = await fetch('/api/os/sns-link', { cache: 'no-store' })
            const d = await r.json().catch(() => ({}))
            setLinks(Array.isArray(d.links) ? d.links : [])
        } catch { /* 목록이 없어도 넣기는 된다 */ }
    }, [])
    useEffect(() => { void Promise.resolve().then(load) }, [load])

    const add = async () => {
        if (!url.trim() || busy) return
        setBusy(true)
        setMsg('읽는 중이에요. 30초쯤 걸릴 수 있어요')
        try {
            const r = await fetch('/api/os/sns-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, source: 'settings' }) })
            const d = await r.json().catch(() => ({}))
            setMsg(d.error || d.message || '')
            if (typeof d.balance === 'number') 클로버알림(d.balance)
            if (r.ok) { setUrl(''); void load() }
        } catch {
            setMsg('인터넷 연결을 확인하고 다시 해 주세요')
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            <h2>내 SNS, 블로그</h2>
            <div className="os-card">
                <div className="os-set-sub">{SNS_HINT}</div>
                <div className="os-set-line" style={{ gap: 8 }}>
                    <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://blog.naver.com/아이디" inputMode="url" maxLength={300}
                        style={{ flex: 1, minWidth: 0, minHeight: 44, fontSize: 16, padding: '0 12px', borderRadius: 12, border: '1px solid var(--os-선)', background: 'var(--os-말풍선)', color: 'var(--os-글)' }} onKeyDown={e => { if (e.key === 'Enter') void add() }} />
                    <button type="button" className="os-btn primary" disabled={busy || !url.trim()} onClick={() => void add()}>{busy ? '읽는 중' : '넣기'}</button>
                </div>
                {msg && <div className="os-set-sub" role="status">{msg}</div>}
                {links.map(l => (
                    <div key={l.id} className="os-set-line">
                        <div className="os-set-text" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</div>
                        <span className="os-set-value">{STATUS[l.status]}{l.status === 'read' && l.added_count > 0 ? ` ${l.added_count}건` : ''}</span>
                    </div>
                ))}
            </div>
        </>
    )
}
