'use client'
// 승인 카드 — 말풍선 자리에 뜬다. 봇은 이 카드에 답할 때까지 「승인 기다림」으로 멈춘다.
//
// 카드 = ①무슨 행동인지 한 줄 ②실제로 나갈 내용 미리보기 ③[허용] [거절] [고쳐서 허용]
// 허용을 눌러도 이 화면에서 보내지 않는다. 「보내도 좋다」는 기록만 남는다.

import { useState } from 'react'

export interface CardView {
    id: string
    actionType: string
    summary: string
    payload: Record<string, unknown>
    status: 'pending' | 'allowed' | 'denied' | 'edited_allowed' | 'expired'
}

const ACTION_LABEL: Record<string, string> = {
    send_message: '보내기', publish: '게시하기', purchase: '구매하기', transfer: '이체하기',
    delete: '삭제하기', change_permission: '권한 바꾸기', accept_terms: '약관 동의하기', other: '되돌릴 수 없는 일',
}

const DONE_LABEL: Record<string, string> = {
    allowed: '허용했어요. 보내는 일은 따로 처리돼요.',
    denied: '거절했어요. 아무 데도 안 나갔어요.',
    edited_allowed: '고쳐서 허용했어요. 고친 내용으로 나가요.',
    expired: '시간이 지나 사라진 카드예요.',
}

export default function PermissionCard({ card, onDecided }: { card: CardView; onDecided: (c: CardView) => void }) {
    const 처음내용 = String(card.payload?.보낼내용 ?? '')
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(처음내용)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const 받는사람 = String(card.payload?.받는사람 ?? '')
    const 못만듦 = String(card.payload?.초안못만듦 ?? '')
    const 끝났나 = card.status !== 'pending'

    const 답하기 = async (status: 'allowed' | 'denied' | 'edited_allowed') => {
        setBusy(true); setErr(null)
        try {
            const res = await fetch(`/api/os/permissions/${card.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status,
                    decidedPayload: status === 'edited_allowed' ? { ...card.payload, 보낼내용: draft } : undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '답을 저장하지 못했어요')
            onDecided(data.card as CardView)
        } catch (e) {
            setErr(e instanceof Error ? e.message : '답을 저장하지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="os-permit" data-status={card.status}>
            <div className="os-permit-head">
                <span className="os-permit-badge" aria-hidden>!</span>
                <b>{card.summary}</b>
                <span className="os-permit-kind">{ACTION_LABEL[card.actionType] ?? '되돌릴 수 없는 일'}</span>
            </div>

            {받는사람 && <div className="os-permit-to">받는 사람: {받는사람}</div>}

            <div className="os-permit-label">이대로 나갈 내용</div>
            {editing
                ? <textarea className="os-textarea" rows={7} value={draft} onChange={e => setDraft(e.target.value)} aria-label="보낼 내용 고치기" />
                : <div className="os-permit-body">{처음내용 || 못만듦 || '(내용 없음)'}</div>}

            {못만듦 && !처음내용 && <div className="os-permit-warn">{못만듦}</div>}
            {err && <div className="os-permit-warn">{err}</div>}

            {끝났나 ? (
                <div className="os-permit-done">{DONE_LABEL[card.status] ?? '답한 카드예요.'}</div>
            ) : (
                <div className="os-permit-foot">
                    <button className="os-btn" disabled={busy} onClick={() => void 답하기('denied')}>거절</button>
                    {editing
                        ? <button className="os-btn" disabled={busy || !draft.trim()} onClick={() => void 답하기('edited_allowed')}>고친 대로 허용</button>
                        : <button className="os-btn" disabled={busy} onClick={() => setEditing(true)}>고쳐서 허용</button>}
                    <button className="os-btn primary" disabled={busy || editing} onClick={() => void 답하기('allowed')}>허용</button>
                </div>
            )}

            <div className="os-permit-note">허용해도 이 화면에서 바로 나가지 않아요. 기록이 남고, 보내는 일은 따로 처리돼요.</div>
        </div>
    )
}
