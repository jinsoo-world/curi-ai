'use client'
// 봇 신고, 차단 (애플 심사 지침 1.2, 1002). 창구 = /api/os/report, /api/os/block.
//   신고 시트 = 이유 칩 + 자세한 내용(선택) → 「신고했어요. 24시간 안에 확인할게요」
//   차단 = 확인 → 목록과 대화에서 사라진다. 해제는 설정의 「차단한 봇」
// 손님도 신고는 된다(대화와 같은 방문자 id). 차단은 로그인해야 한다.

import { useCallback, useEffect, useState } from 'react'
import { getVisitorId } from '@/lib/visitor'
import { useOsTeam } from './OsShell'

/** 서버 REPORT_REASONS 와 같은 순서, 같은 이름. 화면 글에는 중간점을 쓰지 않는다 */
export const REPORT_REASON_CHIPS: { id: string; label: string }[] = [
    { id: 'spam', label: '스팸, 광고' },
    { id: 'sexual', label: '성적인 내용' },
    { id: 'hate', label: '혐오, 차별' },
    { id: 'violence', label: '폭력' },
    { id: 'impersonation', label: '다른 사람인 척' },
    { id: 'personal_info', label: '개인정보 노출' },
    { id: 'misinformation', label: '잘못된 정보' },
    { id: 'other', label: '기타' },
]

export const REPORT_DONE_TEXT = '신고했어요. 24시간 안에 확인할게요'
export const BLOCK_CONFIRM_TEXT = '이 봇을 차단할까요? 목록과 대화에서 보이지 않아요'

/** 차단 → 성공하면 true. 확인 창에서 취소하면 false */
export async function confirmAndBlock(mentorId: string): Promise<{ ok: boolean; error?: string }> {
    if (!window.confirm(BLOCK_CONFIRM_TEXT)) return { ok: false }
    try {
        const res = await fetch('/api/os/block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mentorId }) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) return { ok: false, error: d.error || '차단하지 못했어요' }
        return { ok: true }
    } catch {
        return { ok: false, error: '차단하지 못했어요. 잠시 뒤 다시 해 주세요' }
    }
}

/** 화면 아래 잠깐 뜨는 안내 한 줄 */
export function SafetyToast({ text, onDone }: { text: string | null; onDone: () => void }) {
    useEffect(() => {
        if (!text) return
        const t = window.setTimeout(onDone, 3200)
        return () => window.clearTimeout(t)
    }, [text, onDone])
    if (!text) return null
    return (
        <div role="status" aria-live="polite" data-theme="os"
            style={{
                position: 'fixed', left: '50%', bottom: 'calc(24px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 1000,
                background: 'var(--os-글, var(--color-neutral-900))', color: 'var(--os-바탕, #fff)', padding: '12px 18px', borderRadius: 12, fontSize: 15,
                maxWidth: 'calc(100vw - 32px)', boxShadow: '0 6px 20px rgba(0,0,0,.2)',
            }}>
            {text}
        </div>
    )
}

export function ReportSheet({ mentorId, botName, excerpt, messageId, onClose, onDone }: {
    mentorId: string
    botName: string
    /** 신고한 말풍선 글 (메시지에서 열었을 때) */
    excerpt?: string | null
    /** 서버에 저장된 말 번호. 있으면 서버가 진짜 글을 꺼낸다 (방금 받은 말은 없을 수 있다) */
    messageId?: string | null
    onClose: () => void
    onDone: (message: string) => void
}) {
    const [reason, setReason] = useState<string | null>(null)
    const [detail, setDetail] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const 보내기 = async () => {
        if (!reason) { setErr('신고 이유를 골라 주세요'); return }
        setBusy(true); setErr(null)
        try {
            const res = await fetch('/api/os/report', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, reason, detail: detail.trim() || undefined, messageExcerpt: excerpt ? excerpt.slice(0, 1000) : undefined, messageId: messageId || undefined, visitorId: getVisitorId() || undefined }),
            })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(d.error || '신고를 보내지 못했어요')
            onDone(REPORT_DONE_TEXT)
            onClose()
        } catch (e) {
            setErr(e instanceof Error ? e.message : '신고를 보내지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="os-sheet-back" data-theme="os" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="신고하기">
            <div className="os-sheet" onClick={e => e.stopPropagation()}>
                <h3>{botName} 신고하기</h3>
                <div className="os-step">어떤 문제가 있나요? 신고한 내용은 운영팀만 봐요.</div>
                {excerpt && (
                    <div className="os-card" style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', fontSize: 14 }}>{excerpt.slice(0, 300)}</div>
                )}
                <div className="os-chips" role="group" aria-label="신고 이유" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {REPORT_REASON_CHIPS.map(c => (
                        <button key={c.id} type="button" aria-pressed={reason === c.id}
                            className="os-chipbtn" style={{ minHeight: 44, padding: '10px 14px' }} disabled={busy}
                            onClick={() => setReason(c.id)}>{c.label}</button>
                    ))}
                </div>
                <div className="os-step" style={{ margin: '16px 0 8px' }}>자세한 내용 (선택)</div>
                <textarea value={detail} onChange={e => setDetail(e.target.value.slice(0, 500))} disabled={busy} rows={3}
                    placeholder="무엇이 문제였는지 적어 주시면 더 빨리 확인할 수 있어요" aria-label="자세한 내용" style={{ width: '100%' }} />
                <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--os-글-흐림)' }}>{detail.length}/500</div>
                {err && <div className="os-notice" style={{ margin: '10px 0 0' }}>{err}</div>}
                <div className="os-sheet-foot">
                    <button className="os-btn" onClick={onClose} disabled={busy}>취소</button>
                    <button className="os-btn primary" onClick={() => void 보내기()} disabled={busy || !reason}>{busy ? '보내는 중…' : '신고하기'}</button>
                </div>
            </div>
        </div>
    )
}

/**
 * 「신고하기」「차단하기」 두 단추 + 시트 + 안내. 봇 정보칸, 대화 머리 메뉴가 쓴다.
 * onBlocked = 차단 뒤 화면 정리(대화 화면이면 목록으로 나간다)
 */
export function BotSafetyActions({ mentorId, botName, guest, onBlocked, compact = false, canBlock = true }: {
    mentorId: string
    botName: string
    guest: boolean
    onBlocked?: () => void
    compact?: boolean
    /** 내 봇이면 false (신고만) */
    canBlock?: boolean
}) {
    const [sheet, setSheet] = useState(false)
    const [toast, setToast] = useState<string | null>(null)
    const clear = useCallback(() => setToast(null), [])
    const 차단 = async () => {
        if (guest) { setToast('로그인하면 차단할 수 있어요'); return }
        const r = await confirmAndBlock(mentorId)
        if (r.error) setToast(r.error)
        if (r.ok) { setToast('차단했어요'); onBlocked?.() }
    }
    const style = compact ? undefined : { width: '100%', textAlign: 'left' as const, marginBottom: 4 }
    return (
        <>
            <button type="button" className="os-btn" style={style} onClick={() => setSheet(true)}>신고하기</button>
            {canBlock && <button type="button" className="os-btn" style={style} onClick={() => void 차단()}>차단하기</button>}
            {sheet && <ReportSheet mentorId={mentorId} botName={botName} onClose={() => setSheet(false)} onDone={setToast} />}
            <SafetyToast text={toast} onDone={clear} />
        </>
    )
}

/** 말풍선 메뉴에서 쓰는 신고, 차단 (한 화면에 시트 하나) */
export function useMessageSafety(opts: { guest: boolean; onBlocked?: (mentorId: string) => void }) {
    const [target, setTarget] = useState<{ mentorId: string; botName: string; excerpt: string; messageId?: string | null } | null>(null)
    const [toast, setToast] = useState<string | null>(null)
    const clear = useCallback(() => setToast(null), [])
    const { guest, onBlocked } = opts
    const report = useCallback((mentorId: string, botName: string, excerpt: string, messageId?: string | null) => setTarget({ mentorId, botName, excerpt, messageId }), [])
    const block = useCallback(async (mentorId: string) => {
        if (guest) { setToast('로그인하면 차단할 수 있어요'); return }
        const r = await confirmAndBlock(mentorId)
        if (r.error) setToast(r.error)
        if (r.ok) { setToast('차단했어요'); onBlocked?.(mentorId) }
    }, [guest, onBlocked])
    const ui = (
        <>
            {target && <ReportSheet mentorId={target.mentorId} botName={target.botName} excerpt={target.excerpt} messageId={target.messageId} onClose={() => setTarget(null)} onDone={setToast} />}
            <SafetyToast text={toast} onDone={clear} />
        </>
    )
    return { report, block, ui }
}

interface BlockedBot { mentorId: string; name: string; avatarUrl: string | null }

/** 설정 「차단한 봇」 목록 + 해제 */
export function BlockedBotsCard() {
    const [list, setList] = useState<BlockedBot[] | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [guest, setGuest] = useState(false)

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/os/block', { cache: 'no-store' })
            if (res.status === 401) { setGuest(true); setList([]); return }
            const d = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(d.error || '목록을 못 읽었어요')
            setList(Array.isArray(d.bots) ? d.bots as BlockedBot[] : [])
        } catch (e) {
            setErr(e instanceof Error ? e.message : '목록을 못 읽었어요')
            setList([])
        }
    }, [])
    useEffect(() => { void Promise.resolve().then(load) }, [load])

    const 해제 = async (mentorId: string) => {
        setBusy(mentorId); setErr(null)
        try {
            const res = await fetch('/api/os/block', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mentorId }) })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(d.error || '해제하지 못했어요')
            setList(prev => (prev ?? []).filter(b => b.mentorId !== mentorId))
        } catch (e) {
            setErr(e instanceof Error ? e.message : '해제하지 못했어요')
        } finally {
            setBusy(null)
        }
    }

    return (
        <div className="os-card">
            {list === null && <div className="os-set-hint">불러오는 중…</div>}
            {list !== null && guest && <div className="os-set-hint">로그인하면 차단한 봇을 볼 수 있어요</div>}
            {list !== null && !guest && list.length === 0 && !err && <div className="os-set-hint">차단한 봇이 없어요</div>}
            {(list ?? []).map(b => (
                <div key={b.mentorId} className="os-set-line">
                    <div className="os-set-text"><b>{b.name}</b></div>
                    <button type="button" className="os-btn" disabled={busy === b.mentorId} onClick={() => void 해제(b.mentorId)}>해제</button>
                </div>
            ))}
            {err && <div className="os-set-hint warn" style={{ marginTop: 8 }}>{err}</div>}
        </div>
    )
}

/**
 * 정적(30초 캐시) 마켓 화면용: 내가 차단한 봇 카드([data-mentor-id])를 숨긴다.
 * 화면을 사람마다 따로 그리지 않아도 되게 브라우저에서 한 번 읽어 가린다. 손님이면 아무것도 안 한다.
 */
export function HideBlockedBots() {
    const { guest, loading } = useOsTeam()
    const [ids, setIds] = useState<string[]>([])
    useEffect(() => {
        if (loading || guest) return   // 손님은 차단이 없다 = 부르지 않는다
        let alive = true
        fetch('/api/os/block', { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (alive && d && Array.isArray(d.mentorIds)) setIds((d.mentorIds as unknown[]).filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x))) })
            .catch(() => { })
        return () => { alive = false }
    }, [guest, loading])
    if (guest || ids.length === 0) return null
    return <style>{ids.map(id => `[data-mentor-id="${id}"]`).join(',')}{'{display:none!important}'}</style>
}
