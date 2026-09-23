'use client'
// 오늘 체크인 띠 — 대화 목록 바로 위. 오늘 아직 안 했을 때만 뜬다.
//
// 왜 = 봇(디지털 나)이 「요즘 어떻게 지내는지」를 알아야 다음 한 걸음을 제안할 수 있다.
// 글로 쓰라면 아무도 안 쓴다 → 전부 칩으로 고르고, 막힌 일 한 줄만 선택. 30초 안에 끝난다.
// 손님, 시연(?demo=1)에서는 아예 안 보인다(저장할 곳이 없다).

import { useEffect, useState } from 'react'
import { DID_CHIPS, ENERGY_LABELS, MOOD_LABELS } from '@/domains/os/checkin'
import { toggleChip } from '@/domains/os/settings'
import { osTrack } from '@/domains/os/events'

const 작은칩: React.CSSProperties = { minHeight: 40, padding: '8px 12px', fontSize: 14 }

export default function CheckinStrip({ hidden = false }: { hidden?: boolean }) {
    const [show, setShow] = useState(false)
    const [folded, setFolded] = useState(false)
    const [mood, setMood] = useState<number | null>(null)
    const [energy, setEnergy] = useState<number | null>(null)
    const [did, setDid] = useState<string[]>([])
    const [blocked, setBlocked] = useState('')
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (hidden) return
        let alive = true
        fetch('/api/os/checkin', { cache: 'no-store' })
            .then(r => r.json())
            .then(d => {
                // 오늘 이미 했거나 / 손님이거나 / 표가 아직 없으면 띠를 안 그린다
                if (alive && !d.checkin && !d.guest && !d.tableMissing) setShow(true)
            })
            .catch(() => { })
        return () => { alive = false }
    }, [hidden])

    if (hidden || !show) return null

    const 저장 = async () => {
        setBusy(true)
        try {
            const res = await fetch('/api/os/checkin', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mood, energy, did, blocked }),
            })
            if (res.ok) {
                osTrack('os_checkin_done', { mood: mood ?? 0, energy: energy ?? 0, did_count: did.length, has_blocked: !!blocked.trim() })
                setShow(false)
            }
        } catch { /* 저장 못 해도 대화는 그대로 */ } finally {
            setBusy(false)
        }
    }

    return (
        <section className="os-checkin" aria-label="오늘 체크인">
            <div className="os-checkin-head">
                <b>오늘 어떠세요?</b>
                <button className="os-linkbtn" style={{ width: 'auto', textAlign: 'right' }} onClick={() => setFolded(v => !v)}>
                    {folded ? '펴기' : '접기'}
                </button>
                <button className="os-linkbtn" style={{ width: 'auto', textAlign: 'right' }} onClick={() => setShow(false)}>오늘은 건너뛰기</button>
            </div>

            {!folded && (
                <>
                    <div className="os-checkin-label">기분</div>
                    <div className="os-chips">
                        {MOOD_LABELS.map((t, i) => (
                            <button key={t} type="button" className="os-chipbtn" style={작은칩} aria-pressed={mood === i + 1}
                                onClick={() => setMood(mood === i + 1 ? null : i + 1)}>{t}</button>
                        ))}
                    </div>

                    <div className="os-checkin-label">에너지</div>
                    <div className="os-chips">
                        {ENERGY_LABELS.map((t, i) => (
                            <button key={t} type="button" className="os-chipbtn" style={작은칩} aria-pressed={energy === i + 1}
                                onClick={() => setEnergy(energy === i + 1 ? null : i + 1)}>{t}</button>
                        ))}
                    </div>

                    <div className="os-checkin-label">오늘 한 일 (여러 개)</div>
                    <div className="os-chips">
                        {DID_CHIPS.map(t => (
                            <button key={t} type="button" className="os-chipbtn" style={작은칩} aria-pressed={did.includes(t)}
                                onClick={() => setDid(prev => toggleChip(prev, t, DID_CHIPS.length))}>{t}</button>
                        ))}
                    </div>

                    <input
                        className="os-checkin-input" value={blocked} maxLength={200}
                        onChange={e => setBlocked(e.target.value)}
                        placeholder="막힌 일이 있으면 한 줄 (안 써도 돼요)" aria-label="막힌 일"
                    />

                    <button className="os-btn primary" style={{ width: '100%', marginTop: 10, minHeight: 44 }} disabled={busy} onClick={() => void 저장()}>
                        {busy ? '저장하는 중…' : '오늘 체크인 저장'}
                    </button>
                </>
            )}
        </section>
    )
}
