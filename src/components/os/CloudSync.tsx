'use client'
// 「드라이브, 노션」 탭 — 사용자 본인 계정(연결 화면 /os/connect 에서 붙인 것)으로 구글 드라이브 폴더나
// 노션 문서를 골라 등록하면, 서버가 하루에 한 번(또는 「지금 가져오기」로 바로) 새로 바뀐 것만 봇 자료로 넣는다.
//
// 「내 폴더」(FolderSync)와 다른 점 = 저 쪽은 브라우저가 훑고 사용자가 파일을 직접 올린다.
// 여기는 서버가 대신 훑는다 — 그래서 한 번 등록해 두면 이 화면을 안 열어도 계속 새 자료가 들어온다.

import { useCallback, useEffect, useState } from 'react'
import { osTrack } from '@/domains/os/events'

type Provider = 'google_drive' | 'notion'

interface PickItem { id: string; name: string }
interface SyncRow {
    id: string; provider: Provider; folderOrPageId: string; name: string
    status: 'pending' | 'ok' | 'error'; lastError: string | null; itemCount: number
    lastSyncedAt: string | null; createdAt: string
}

interface Props {
    mentorId: string
    onAdded: () => void | Promise<void>
    onBusy: (busy: boolean) => void
    onDone: () => void
}

const 이름표: Record<Provider, string> = { google_drive: '구글 드라이브', notion: '노션' }

const 날짜 = (iso: string | null) => iso
    ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '아직 없음'

export default function CloudSync({ mentorId, onAdded, onBusy, onDone }: Props) {
    const [provider, setProvider] = useState<Provider>('google_drive')
    const [connected, setConnected] = useState<Record<Provider, boolean>>({ google_drive: false, notion: false })
    const [checkingConnect, setCheckingConnect] = useState(true)

    const [items, setItems] = useState<PickItem[]>([])
    const [checked, setChecked] = useState<Set<string>>(new Set())
    const [loadingItems, setLoadingItems] = useState(false)

    const [syncs, setSyncs] = useState<SyncRow[]>([])

    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState<string | null>(null)
    const [err, setErr] = useState<string | null>(null)

    const 잠금 = useCallback((b: boolean) => { setBusy(b); onBusy(b) }, [onBusy])

    /** 연결 화면(/api/connect)이 이미 알고 있는 「이 서비스 연결됐나」를 가져다 쓴다(새 창구를 안 만든다) */
    const 연결확인 = useCallback(async () => {
        setCheckingConnect(true)
        try {
            const res = await fetch('/api/connect')
            const data = await res.json().catch(() => ({}))
            const services = (data?.services ?? []) as { id: string; connected: unknown }[]
            setConnected({
                google_drive: !!services.find(s => s.id === 'google_drive')?.connected,
                notion: !!services.find(s => s.id === 'notion')?.connected,
            })
        } catch { /* 못 봤으면 「안 붙음」으로 둔다 */ } finally {
            setCheckingConnect(false)
        }
    }, [])

    const 등록목록불러오기 = useCallback(async () => {
        try {
            const res = await fetch(`/api/os/knowledge/cloud?mentorId=${encodeURIComponent(mentorId)}`)
            const data = await res.json().catch(() => ({}))
            if (res.ok) setSyncs(data.syncs ?? [])
        } catch { /* 목록은 없어도 화면은 산다 */ }
    }, [mentorId])

    useEffect(() => { void 연결확인() }, [연결확인])
    useEffect(() => { void 등록목록불러오기() }, [등록목록불러오기])

    const 고르기목록불러오기 = useCallback(async (p: Provider) => {
        setLoadingItems(true); setErr(null); setItems([]); setChecked(new Set())
        try {
            const res = await fetch(`/api/os/knowledge/cloud/list?mentorId=${encodeURIComponent(mentorId)}&provider=${p}`)
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '목록을 못 가져왔어요')
            setItems(data.items ?? [])
        } catch (e) {
            setErr(e instanceof Error ? e.message : '목록을 못 가져왔어요')
        } finally {
            setLoadingItems(false)
        }
    }, [mentorId])

    useEffect(() => {
        if (!checkingConnect && connected[provider]) void 고르기목록불러오기(provider)
    }, [checkingConnect, connected, provider, 고르기목록불러오기])

    const 체크바꾸기 = (id: string) => setChecked(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id); else next.add(id)
        return next
    })

    const 이미등록된id = new Set(syncs.filter(s => s.provider === provider).map(s => s.folderOrPageId))

    const 가져오기 = async () => {
        const 고른것 = items.filter(it => checked.has(it.id))
        if (고른것.length === 0) return
        잠금(true); setErr(null); setMsg(`${고른것.length}개를 등록하고 가져오는 중이에요…`)
        try {
            const res = await fetch('/api/os/knowledge/cloud', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, provider, items: 고른것 }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '등록하지 못했어요')
            osTrack('os_knowledge_added', { mentor_id: mentorId, kind: `cloud_${provider}` })
            setChecked(new Set())
            await onAdded()
            await 등록목록불러오기()
            setMsg(`${data.registered ?? 고른것.length}개 등록했어요. 그중 ${data.성공 ?? 0}개를 지금 가져왔어요`)
            setTimeout(onDone, 900)
        } catch (e) {
            setMsg(null)
            setErr(e instanceof Error ? e.message : '등록하지 못했어요')
        } finally {
            잠금(false)
        }
    }

    const 지금가져오기 = async (syncId: string) => {
        잠금(true); setErr(null); setMsg('다시 가져오는 중이에요…')
        try {
            const res = await fetch('/api/os/knowledge/cloud', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, syncId, action: 'run' }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '가져오지 못했어요')
            await onAdded()
            await 등록목록불러오기()
            setMsg(data.ok ? `${data.itemCount ?? 0}개 새로 넣었어요` : null)
            if (!data.ok) setErr('가져오지 못했어요. 아래 목록의 오류 문구를 봐 주세요')
        } catch (e) {
            setMsg(null)
            setErr(e instanceof Error ? e.message : '가져오지 못했어요')
        } finally {
            잠금(false)
        }
    }

    const 등록빼기 = async (syncId: string) => {
        잠금(true); setErr(null)
        try {
            const res = await fetch('/api/os/knowledge/cloud', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, syncId }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '빼지 못했어요')
            await 등록목록불러오기()
        } catch (e) {
            setErr(e instanceof Error ? e.message : '빼지 못했어요')
        } finally {
            잠금(false)
        }
    }

    const 고른수 = items.filter(it => checked.has(it.id)).length

    return (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, lineHeight: 1.5 }}>
                한 번 등록하면 하루에 한 번, 새로 생겼거나 바뀐 것만 봇에게 넣어요. 이 창을 안 열어도 계속 돼요.
            </div>

            <div className="os-tabs" role="tablist">
                {(['google_drive', 'notion'] as Provider[]).map(p => (
                    <button key={p} type="button" className="os-tab" role="tab" aria-selected={provider === p} disabled={busy}
                        onClick={() => setProvider(p)}>{이름표[p]}</button>
                ))}
            </div>

            {checkingConnect ? (
                <div style={{ color: 'var(--os-글-흐림)', fontSize: 13 }}>연결 상태를 보는 중이에요…</div>
            ) : !connected[provider] ? (
                <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, lineHeight: 1.5 }}>
                        {이름표[provider]}가 아직 연결돼 있지 않아요. 먼저 내 계정으로 연결해 주세요.
                    </div>
                    <a className="os-btn primary" style={{ width: '100%', textAlign: 'center' }} href="/os/connect">연결하러 가기</a>
                </div>
            ) : (
                <>
                    {loadingItems ? (
                        <div style={{ color: 'var(--os-글-흐림)', fontSize: 13 }}>목록을 보는 중이에요…</div>
                    ) : items.length === 0 ? (
                        <div style={{ color: 'var(--os-글-흐림)', fontSize: 13 }}>
                            {provider === 'google_drive' ? '가져올 폴더가 없어요.' : '통합에 공유된 노션 문서가 없어요.'}
                        </div>
                    ) : (
                        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                            {items.map(it => (
                                <label key={it.id} className="os-source" style={{ cursor: busy ? 'default' : 'pointer' }}>
                                    <input type="checkbox" checked={checked.has(it.id)} disabled={busy} onChange={() => 체크바꾸기(it.id)}
                                        aria-label={`${it.name} 넣기`} style={{ width: 18, height: 18, flex: '0 0 auto' }} />
                                    <span className="os-source-title" title={it.name}>{it.name}</span>
                                    {이미등록된id.has(it.id) && <span className="os-source-state">이미 등록됨</span>}
                                </label>
                            ))}
                        </div>
                    )}

                    {items.length > 0 && (
                        <button type="button" className="os-btn primary" style={{ width: '100%' }} disabled={busy || 고른수 === 0} onClick={() => void 가져오기()}>
                            {busy ? '가져오는 중…' : `고른 ${provider === 'google_drive' ? '폴더' : '문서'} 넣기 (${고른수}개)`}
                        </button>
                    )}
                </>
            )}

            {syncs.length > 0 && (
                <div>
                    <div style={{ fontSize: 13, marginBottom: 6, color: 'var(--os-글-흐림)' }}>등록해 둔 것</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                        {syncs.map(s => (
                            <div key={s.id} className="os-source" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="os-source-title" title={s.name}>{이름표[s.provider]}: {s.name || '(이름 없음)'}</span>
                                <span className="os-source-state">
                                    {s.status === 'error' ? (s.lastError || '오류') : `${날짜(s.lastSyncedAt)} 새 자료 ${s.itemCount}개`}
                                </span>
                                <button type="button" className="os-linkbtn" style={{ width: 'auto', padding: '0 6px', fontSize: 13 }} disabled={busy}
                                    onClick={() => void 지금가져오기(s.id)}>지금 가져오기</button>
                                <button type="button" className="os-source-x" aria-label={`${s.name} 그만 지켜보기`} disabled={busy}
                                    onClick={() => void 등록빼기(s.id)}>✕</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {msg && <div className="os-notice" style={{ margin: 0, background: 'color-mix(in srgb, var(--os-클로버) 18%, transparent)', color: 'var(--os-클로버)' }}>{msg}</div>}
            {err && <div className="os-notice" style={{ margin: 0 }}>{err}</div>}
        </div>
    )
}
