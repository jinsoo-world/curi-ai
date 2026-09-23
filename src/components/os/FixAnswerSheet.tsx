'use client'
// 「답 고치기」 시트 — 봇이 틀리게 답했을 때, 그 자리에서 고친 답을 Q&A 자료로 저장한다.
// 델파이 「Improve this response」와 같은 자리: 고친 답을 저장한 뒤 「다시 물어보기」로
// 같은 질문을 재전송해 바뀌었는지 바로 확인한다.

import { useState } from 'react'
import { osTrack } from '@/domains/os/events'

interface Props {
    mentorId: string
    /** 봇이 틀리게 답한 그 질문(바로 앞 내 말) */
    question: string
    /** 봇이 실제로 한 답 (고칠 답의 초안으로 채워 둔다) */
    currentAnswer: string
    onClose: () => void
    /** 저장 뒤 같은 질문을 다시 보낸다 (대화창이 실제 재전송을 한다) */
    onRetry: (question: string) => void
}

export default function FixAnswerSheet({ mentorId, question, currentAnswer, onClose, onRetry }: Props) {
    const [answer, setAnswer] = useState(currentAnswer)
    const [busy, setBusy] = useState(false)
    const [saved, setSaved] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const 저장 = async () => {
        const body = answer.trim()
        if (body.length < 1) { setErr('고친 답을 적어 주세요'); return }
        setBusy(true); setErr(null)
        try {
            const res = await fetch('/api/os/knowledge', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, kind: 'qa', question, answer: body, sourceKind: 'fix' }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '못 고쳤어요')
            osTrack('os_knowledge_added', { mentor_id: mentorId, kind: 'fix' })
            setSaved(true)
        } catch (e) {
            setErr(e instanceof Error ? e.message : '못 고쳤어요')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="os-sheet-back" data-theme="os" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="답 고치기">
            <div className="os-sheet" onClick={e => e.stopPropagation()}>
                <h3>답 고치기</h3>
                <div className="os-step">이 질문에는 앞으로 아래 답을 먼저 써요.</div>

                <div className="os-fix-question">{question || '(방금 물음을 못 찾았어요)'}</div>

                <textarea className="os-textarea" value={answer} onChange={e => setAnswer(e.target.value)} disabled={busy}
                    rows={6} placeholder="고친 답" aria-label="고친 답" />

                {saved && (
                    <div className="os-notice" style={{ margin: '14px 0 0', background: 'color-mix(in srgb, var(--os-클로버) 18%, transparent)', color: 'var(--os-클로버)' }}>
                        저장했어요. 같은 질문으로 다시 물어봐서 바뀌었는지 볼까요?
                    </div>
                )}
                {err && <div className="os-notice" style={{ margin: '14px 0 0' }}>{err}</div>}

                <div className="os-sheet-foot">
                    <button className="os-btn" onClick={onClose} disabled={busy}>닫기</button>
                    {saved ? (
                        <button className="os-btn primary" onClick={() => { onRetry(question); onClose() }}>다시 물어보기</button>
                    ) : (
                        <button className="os-btn primary" onClick={() => void 저장()} disabled={busy || answer.trim().length < 1}>
                            {busy ? '저장하는 중…' : '저장'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
