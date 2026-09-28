'use client'
// 설정 > 일반 「내 SNS, 블로그」 (대표 승인 0928 23:29). 링크를 넣으면 공개 글을 읽어 내 봇 자료에 넣는다.
// 유튜브 채널, 네이버 블로그, 브런치, 티스토리, RSS, 일반 웹은 읽는다(대표 결정 0929). 못 읽으면 대표 글 붙여넣기를 연다.
// 인스타그램, 페이스북, 스레드, X, 틱톡은 링크만 저장한다(준비 중).
import { useCallback, useEffect, useState } from 'react'
import { SNS_HINT, SNS_PASTE_MAX_POSTS as PASTE_MAX_POSTS, SNS_PASTE_MIN_CHARS as PASTE_MIN_CHARS } from '@/domains/os/onboarding'
import { 클로버알림 } from '@/lib/clover-bus'
import { shrinkImage } from '@/lib/image-shrink'

type Link = { id: string; url: string; platform: string; status: 'read' | 'pending' | 'failed'; added_count: number; note: string | null }
const STATUS: Record<Link['status'], string> = { read: '읽음', pending: '준비 중', failed: '못 읽음' }
/** 대표 글 붙여넣기를 받는 곳 (서버 classifySnsLink 의 paste 와 같다) */
const PASTE_PLATFORMS = ['naver_blog', 'brunch', 'instagram', 'facebook', 'threads']

export default function SnsLinkCard() {
    const [links, setLinks] = useState<Link[]>([])
    const [url, setUrl] = useState('')
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState('')
    const [retryId, setRetryId] = useState<string | null>(null)
    // 네이버 블로그, 브런치 = 대표 글 붙여넣기 칸
    const [pasteUrl, setPasteUrl] = useState<string | null>(null)
    const [posts, setPosts] = useState<string[]>(() => Array(PASTE_MAX_POSTS).fill(''))
    // 인스타그램, 페이스북, 스레드는 화면 캡처도 받는다 (5장까지, 줄여서 보낸다)
    const [shots, setShots] = useState<string[]>([])
    const pickShots = async (files: FileList | null) => {
        if (!files) return
        try {
            const small = await Promise.all(Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 5 - shots.length).map(f => shrinkImage(f)))
            setShots(prev => [...prev, ...small].slice(0, 5))
        } catch { setMsg('사진을 못 열었어요') }
    }

    const load = useCallback(async () => {
        try {
            const r = await fetch('/api/os/sns-link', { cache: 'no-store' })
            const d = await r.json().catch(() => ({}))
            setLinks(Array.isArray(d.links) ? d.links : [])
        } catch { /* 목록이 없어도 넣기는 된다 */ }
    }, [])
    useEffect(() => { void Promise.resolve().then(load) }, [load])

    /** 링크 넣기. 못 읽은 링크의 「다시 시도」도 같은 길로 다시 읽는다 */
    const add = async (target?: string) => {
        const u = (target ?? url).trim()
        if (!u || busy) return
        setBusy(true)
        setRetryId(target ? (links.find(l => l.url === target)?.id ?? null) : null)
        setMsg('읽는 중이에요. 30초쯤 걸릴 수 있어요')
        try {
            const r = await fetch('/api/os/sns-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: u, source: 'settings' }) })
            const d = await r.json().catch(() => ({}))
            setMsg(d.error || d.message || '')
            if (typeof d.balance === 'number') 클로버알림(d.balance)
            if (r.ok && d.status === 'paste') setPasteUrl(u)
            if (r.ok) { if (!target) setUrl(''); void load() }
        } catch {
            setMsg('인터넷 연결을 확인하고 다시 해 주세요')
        } finally {
            setBusy(false)
            setRetryId(null)
        }
    }

    const savePaste = async () => {
        if (!pasteUrl || busy) return
        setBusy(true)
        setMsg('저장하는 중이에요')
        try {
            const r = await fetch('/api/os/sns-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'paste', url: pasteUrl, posts, images: shots }) })
            const d = await r.json().catch(() => ({}))
            setMsg(d.error || d.message || '')
            if (typeof d.balance === 'number') 클로버알림(d.balance)
            if (r.ok) { setPasteUrl(null); setPosts(Array(PASTE_MAX_POSTS).fill('')); setShots([]); void load() }
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
                    <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://내블로그.tistory.com" inputMode="url" maxLength={300}
                        style={{ flex: 1, minWidth: 0, minHeight: 44, fontSize: 16, padding: '0 12px', borderRadius: 12, border: '1px solid var(--os-선)', background: 'var(--os-말풍선)', color: 'var(--os-글)' }} onKeyDown={e => { if (e.key === 'Enter') void add() }} />
                    <button type="button" className="os-btn primary" disabled={busy || !url.trim()} onClick={() => void add()}>{busy ? '읽는 중' : '넣기'}</button>
                </div>
                {msg && <div className="os-set-sub" role="status">{msg}</div>}
                {pasteUrl && (
                    <div className="os-set-paste" style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                        <div className="os-set-sub">대표 글을 붙여넣거나 화면 캡처를 올려 주세요. 한 편에 {PASTE_MIN_CHARS}자 이상</div>
                        <label className="os-btn" style={{ justifySelf: 'start', cursor: 'pointer' }}>
                            화면 캡처 올리기{shots.length > 0 ? ' (더 올리기)' : ''}
                            <input type="file" accept="image/png,image/jpeg,image/webp" multiple style={{ display: 'none' }} onChange={e => { void pickShots(e.target.files); e.target.value = '' }} />
                        </label>
                        {shots.length > 0 && <div className="os-set-sub">캡처를 올렸어요. 저장하면 글만 옮겨 적어요</div>}
                        {posts.map((p, i) => (
                            <textarea key={i} value={p} rows={4} maxLength={20000} placeholder={`글 ${i + 1}`} onChange={e => setPosts(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                                style={{ width: '100%', fontSize: 16, padding: 10, borderRadius: 12, border: '1px solid var(--os-선)', background: 'var(--os-말풍선)', color: 'var(--os-글)', resize: 'vertical' }} />
                        ))}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button type="button" className="os-btn" onClick={() => setPasteUrl(null)}>닫기</button>
                            <button type="button" className="os-btn primary" disabled={busy || (posts.every(p => !p.trim()) && shots.length === 0)} onClick={() => void savePaste()}>{busy ? '저장 중' : '글 저장하기'}</button>
                        </div>
                    </div>
                )}
                {links.map(l => (
                    <div key={l.id}>
                        <div className="os-set-line">
                            <div className="os-set-text" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</div>
                            {l.status === 'failed'
                                ? <button type="button" className="os-btn" disabled={busy} onClick={() => void add(l.url)}>{retryId === l.id ? '읽는 중' : '다시 시도'}</button>
                                : l.status === 'pending' && PASTE_PLATFORMS.includes(l.platform)
                                ? <button type="button" className="os-btn" onClick={() => setPasteUrl(l.url)}>글 붙여넣기</button>
                                : <span className="os-set-value">{STATUS[l.status]}</span>}
                        </div>
                        {l.status === 'failed' && (
                            <div className="os-set-sub" role="status" style={{ color: 'var(--os-경고)', display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ flex: 1, minWidth: 0 }}>{l.note ? `못 읽었어요. ${l.note}` : '못 읽었어요'}</span>
                                {PASTE_PLATFORMS.includes(l.platform) && <button type="button" className="os-btn" onClick={() => setPasteUrl(l.url)}>글 붙여넣기</button>}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </>
    )
}
