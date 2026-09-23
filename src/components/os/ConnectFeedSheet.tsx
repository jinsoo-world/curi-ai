'use client'
// 「계정 연결」 탭 — 유튜브 채널, 웹사이트, 팟캐스트, Substack 을 한 번 붙이면 새 공개 글을 매일 자료로 가져온다.
// X, Instagram, TikTok 은 연결만 되고 「준비 중」으로 보인다(공식 열쇠 등록 전).
// 붙이는 순간 한 번 바로 가져온다. 결과는 아래 한 줄로 보여 준다(다른 탭과 같은 모양).

import { useState } from 'react'
import { osTrack } from '@/domains/os/events'
import type { FeedKind } from '@/domains/os/feeds/types'
import { FEEDS_CHANGED_EVENT } from '@/domains/os/feeds/events'

interface Props {
    mentorId: string
    /** 자료가 들어갔을 때 (목록 새로고침용) */
    onAdded: () => void | Promise<void>
    /** 연결하는 중인지 부모에게 알린다 (탭, 닫기 잠금용) */
    onBusy: (busy: boolean) => void
    /** 다 끝났을 때 (시트 닫기용) */
    onDone: () => void
}

export const FEED_KIND_LABEL: Record<FeedKind, string> = {
    youtube: '유튜브 채널', website: '웹사이트', podcast: '팟캐스트', substack: 'Substack',
    x: 'X', instagram: 'Instagram', tiktok: 'TikTok',
}

const PLACEHOLDER: Record<FeedKind, string> = {
    youtube: '@채널핸들 또는 https://www.youtube.com/@채널핸들',
    website: 'https://내사이트.com',
    podcast: '팟캐스트 RSS 주소 (https://…)',
    substack: 'https://이름.substack.com',
    x: '@핸들',
    instagram: '@핸들',
    tiktok: '@핸들',
}

const HELP: Record<FeedKind, string> = {
    youtube: '새 영상이 올라오면 자막을 읽어 자료로 넣어요. 처음엔 최근 영상 5개까지 가져와요.',
    website: '사이트의 글 목록(sitemap.xml 이나 RSS)을 보고 새 글을 가져와요. 사이트가 자동 읽기를 막아 두었으면 못 가져와요.',
    podcast: '회차 설명(쇼노트) 글을 가져와요. 녹음된 말은 아직 못 읽어요.',
    substack: '공개된 글을 가져와요. 유료 글은 공개된 앞부분만 읽어요.',
    x: '아직 준비 중이에요. 관리자가 공식 열쇠를 등록하면 가져오기 시작해요.',
    instagram: '아직 준비 중이에요. 관리자가 공식 열쇠를 등록하면 가져오기 시작해요.',
    tiktok: '아직 준비 중이에요. 관리자가 공식 열쇠를 등록하면 가져오기 시작해요.',
}

const ORDER: FeedKind[] = ['youtube', 'website', 'podcast', 'substack', 'x', 'instagram', 'tiktok']

interface SyncView { added: number; note?: string; ok: boolean; status: string }

export default function ConnectFeedSheet({ mentorId, onAdded, onBusy, onDone }: Props) {
    const [kind, setKind] = useState<FeedKind>('youtube')
    const [handle, setHandle] = useState('')
    const [busy, setBusyState] = useState(false)
    const [msg, setMsg] = useState<string | null>(null)
    const [err, setErr] = useState<string | null>(null)

    const setBusy = (b: boolean) => { setBusyState(b); onBusy(b) }

    const 연결하기 = async () => {
        const value = handle.trim()
        if (!value) return
        setBusy(true); setErr(null); setMsg('연결하고 새 글을 찾는 중이에요…')
        try {
            const res = await fetch('/api/os/feeds', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, kind, handleOrUrl: value }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '연결하지 못했어요')
            osTrack('os_knowledge_added', { mentor_id: mentorId, kind: `feed_${kind}` })
            window.dispatchEvent(new Event(FEEDS_CHANGED_EVENT))
            const sync = data.sync as SyncView | null
            if (!sync) {
                setMsg('연결했어요. 지금은 준비 중이라 아직 가져오지 않아요.')
                setHandle('')
                return
            }
            if (sync.added > 0) await onAdded()
            if (!sync.ok) {
                setMsg(null)
                setErr(`연결은 했는데 글을 못 가져왔어요. ${sync.note ?? ''}`.trim())
                return
            }
            if (sync.added > 0) {
                setMsg(`연결했어요. 새 글 ${sync.added}개를 자료로 넣었어요.${sync.note ? ` ${sync.note}` : ''}`)
                setTimeout(onDone, 1200)
            } else {
                setMsg(`연결했어요. ${sync.note ?? '지금은 새 글이 없어요. 매일 한 번 새 글을 찾아볼게요.'}`)
            }
            setHandle('')
        } catch (e) {
            setMsg(null)
            setErr(e instanceof Error ? e.message : '연결하지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            <div role="tablist" aria-label="연결할 곳" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 6 }}>
                {ORDER.map(k => (
                    <button key={k} type="button" className="os-tab" role="tab" aria-selected={kind === k}
                        disabled={busy} onClick={() => { setKind(k); setErr(null); setMsg(null) }}>
                        {FEED_KIND_LABEL[k]}
                    </button>
                ))}
            </div>
            <input type="text" value={handle} onChange={e => setHandle(e.target.value)} disabled={busy}
                placeholder={PLACEHOLDER[kind]} aria-label={`${FEED_KIND_LABEL[kind]} 핸들이나 주소`}
                onKeyDown={e => { if (e.key === 'Enter' && !busy) void 연결하기() }} />
            <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, lineHeight: 1.5 }}>
                {HELP[kind]} 공개된 글만 가져와요.
            </div>
            <button type="button" className="os-btn primary" disabled={busy || !handle.trim()} onClick={() => void 연결하기()}>
                {busy ? '연결하는 중…' : '연결하기'}
            </button>

            {msg && <div className="os-notice" style={{ margin: 0, background: 'color-mix(in srgb, var(--os-클로버) 18%, transparent)', color: 'var(--os-클로버)' }}>{msg}</div>}
            {err && <div className="os-notice" style={{ margin: 0 }}>{err}</div>}
        </div>
    )
}
