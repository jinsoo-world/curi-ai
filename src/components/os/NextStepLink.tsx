'use client'
// 봇 말풍선 아래 작은 링크 「＋ 다음 한 걸음으로」.
// 누르면 답의 마지막 문장을 기본값으로 넣어 주고, 사람이 한 번 고쳐서 저장한다.
// 손님·시연에서는 안 보인다(저장할 곳이 없다).

import { useState } from 'react'
import { guessNextStep } from '@/domains/os/nextSteps'

export default function NextStepLink({ answer, mentorId }: { answer: string; mentorId: string }) {
    const [open, setOpen] = useState(false)
    const [text, setText] = useState('')
    const [saved, setSaved] = useState(false)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    if (!answer.trim()) return null

    if (saved) return <div className="os-nextstep-done">다음 한 걸음에 담았어요.</div>

    if (!open) {
        return (
            <button className="os-nextstep-link" onClick={() => { setText(guessNextStep(answer)); setOpen(true) }}>
                ＋ 다음 한 걸음으로
            </button>
        )
    }

    const 저장 = async () => {
        setBusy(true); setErr(null)
        try {
            const res = await fetch('/api/os/next-steps', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.trim().slice(0, 200), mentorId }),
            })
            const d = await res.json()
            if (!res.ok) throw new Error(d.error || '저장하지 못했어요')
            setSaved(true)
        } catch (e) {
            setErr(e instanceof Error ? e.message : '저장하지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="os-nextstep">
            <label className="os-checkin-label" htmlFor="ns-text">다음 한 걸음 (고쳐도 돼요)</label>
            <input id="ns-text" className="os-checkin-input" style={{ marginTop: 0 }} value={text} maxLength={200} onChange={e => setText(e.target.value)} />
            {err && <div className="os-routine-note bad">{err}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="os-btn" style={{ flex: 1, minHeight: 44 }} onClick={() => setOpen(false)}>그만두기</button>
                <button className="os-btn primary" style={{ flex: 1, minHeight: 44 }} disabled={busy || !text.trim()} onClick={() => void 저장()}>담기</button>
            </div>
        </div>
    )
}
