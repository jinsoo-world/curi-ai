'use client'
// 「봇이 이렇게 이해했어요」 카드 (대표 결정 0929 00:54). 자료를 넣은 뒤 봇이 배운 주제, 말투, 핵심을 보여 주고
// 주인이 고쳐서 저장하면 봇 설명에 들어간다. 저장하지 않고 닫아도 자료는 이미 들어가 있다.
import { useEffect, useState } from 'react'
import { UNDERSTAND_COPY as C, tidyUnderstanding, type Understanding } from '@/domains/os/understand-shared'

export default function UnderstandCard({ mentorId, sourceId, onDone }: { mentorId: string; sourceId: string; onDone: () => void }) {
    const [state, setState] = useState<'loading' | 'ready' | 'fail' | 'saving' | 'saved'>('loading')
    const [topics, setTopics] = useState('')
    const [tone, setTone] = useState('')
    const [facts, setFacts] = useState('')
    const [err, setErr] = useState<string | null>(null)

    useEffect(() => {
        let alive = true
        void (async () => {
            try {
                const r = await fetch('/api/os/knowledge', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mentorId, kind: 'understand', sourceId }),
                })
                const d = await r.json().catch(() => ({}))
                const u = d.understanding as Understanding | null
                if (!alive) return
                if (!r.ok || !u) { setState('fail'); return }
                setTopics(u.topics.join(', ')); setTone(u.tone); setFacts(u.facts.join('\n'))
                setState('ready')
            } catch { if (alive) setState('fail') }
        })()
        return () => { alive = false }
    }, [mentorId, sourceId])

    const save = async () => {
        setState('saving'); setErr(null)
        try {
            const understanding = tidyUnderstanding({ topics, tone, facts: facts.split('\n') })
            const r = await fetch('/api/os/knowledge', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, kind: 'understand-save', sourceId, understanding }),
            })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d.error || '저장하지 못했어요')
            setState('saved')
            setTimeout(onDone, 900)
        } catch (e) {
            setErr(e instanceof Error ? e.message : '저장하지 못했어요'); setState('ready')
        }
    }

    const box = { display: 'grid', gap: 6, marginTop: 14, padding: 12, borderRadius: 12, border: '1px solid var(--os-선)', background: 'var(--os-말풍선)' } as const
    const label = { fontSize: 13, color: 'var(--os-글-흐림)' } as const

    if (state === 'loading') return <div style={box} role="status"><strong>{C.title}</strong><span style={label}>{C.loading}</span></div>
    if (state === 'fail') return (
        <div style={box} role="status"><strong>{C.title}</strong><span style={label}>{C.fail}</span>
            <button type="button" className="os-btn" style={{ justifySelf: 'end' }} onClick={onDone}>{C.skip}</button>
        </div>
    )
    return (
        <div style={box} aria-label={C.title}>
            <strong>{C.title}</strong>
            <label style={label}>{C.topics}
                <input type="text" value={topics} onChange={e => setTopics(e.target.value)} maxLength={120} disabled={state !== 'ready'} aria-label={C.topics} />
            </label>
            <label style={label}>{C.tone}
                <input type="text" value={tone} onChange={e => setTone(e.target.value)} maxLength={80} disabled={state !== 'ready'} aria-label={C.tone} />
            </label>
            <label style={label}>{C.facts}
                <textarea className="os-textarea" value={facts} onChange={e => setFacts(e.target.value)} rows={4} disabled={state !== 'ready'} aria-label={C.facts} />
            </label>
            {err && <div className="os-notice">{err}</div>}
            {state === 'saved'
                ? <div role="status" style={{ color: 'var(--os-클로버)' }}>{C.saved}</div>
                : <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" className="os-btn" onClick={onDone} disabled={state === 'saving'}>{C.skip}</button>
                    <button type="button" className="os-btn primary" onClick={() => void save()} disabled={state === 'saving'}>{state === 'saving' ? '저장 중' : C.save}</button>
                </div>}
        </div>
    )
}
