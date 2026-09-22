'use client'
// 새 봇 만들기 = 3걸음, 전부 칩만 누른다 (기획 §13).
//  ① 이 봇이 맡을 일 한 가지  ② 어디까지 알아서?  ③ 모양·색 + 이름
// 그림 생성 없이 도형+색이라 즉시·비용 0.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { JOBS, AUTONOMY, SHAPES, COLORS, suggestName, findJob } from '@/domains/os/presets'
import type { ApprovalMode, BotColor, BotShape, TeamBot } from '@/domains/os/types'
import BotAvatar from './BotAvatar'

interface Props {
    guest: boolean
    onClose: () => void
    onCreated: (bot: TeamBot) => void | Promise<void>
}

export default function NewBotSheet({ guest, onClose, onCreated }: Props) {
    const [step, setStep] = useState<1 | 2 | 3>(1)
    const [job, setJob] = useState<string>('')
    const [customJob, setCustomJob] = useState('')
    const [autonomy, setAutonomy] = useState<ApprovalMode>('always_ask')
    const [shape, setShape] = useState<BotShape>('circle')
    const [color, setColor] = useState<BotColor>('orange')
    const [name, setName] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const preset = useMemo(() => job ? findJob(job) : null, [job])

    const pickJob = (id: string) => {
        setJob(id)
        const p = findJob(id)
        setShape(p.shape); setColor(p.color)
        setName(suggestName(id))
    }

    const canNext1 = !!job && (job !== 'custom' || customJob.trim().length > 0)
    const canCreate = name.trim().length > 0 && name.trim().length <= 20

    const create = async () => {
        setBusy(true); setErr(null)
        try {
            const res = await fetch('/api/os/team', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job, customJob, autonomy, shape, color, name: name.trim() }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '만들지 못했어요')
            await onCreated(data.bot as TeamBot)
        } catch (e) {
            setErr(e instanceof Error ? e.message : '만들지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="os-sheet-back" data-theme="os" onClick={onClose} role="dialog" aria-modal="true" aria-label="새 봇 만들기">
            <div className="os-sheet" onClick={e => e.stopPropagation()}>
                {guest ? (
                    <>
                        <h3>내 봇 팀을 만들려면 로그인이 필요해요</h3>
                        <p style={{ color: 'var(--os-글-연)', lineHeight: 1.6, marginTop: 8 }}>구글이나 카카오로 10초면 돼요. 만든 봇은 나만 볼 수 있어요.</p>
                        <div className="os-sheet-foot">
                            <button className="os-btn" onClick={onClose}>닫기</button>
                            <Link href="/login?next=/os" className="os-btn primary" style={{ textDecoration: 'none', display: 'inline-grid', placeItems: 'center' }}>로그인하기</Link>
                        </div>
                    </>
                ) : step === 1 ? (
                    <>
                        <h3>이 봇이 맡을 일 한 가지</h3>
                        <div className="os-step">1 / 3 · 봇 하나는 일 하나만 맡아요. 그래야 잘해요.</div>
                        <div className="os-chips">
                            {JOBS.map(j => (
                                <button key={j.id} className="os-chipbtn" aria-pressed={job === j.id} onClick={() => pickJob(j.id)}>
                                    {j.label}
                                    {j.oneLiner && <small>{j.oneLiner}</small>}
                                </button>
                            ))}
                        </div>
                        {job === 'custom' && (
                            <div style={{ marginTop: 12 }}>
                                <input type="text" value={customJob} onChange={e => setCustomJob(e.target.value)} maxLength={120}
                                    placeholder="예) 매주 뉴스레터 초안 쓰기" autoFocus />
                            </div>
                        )}
                        <div className="os-sheet-foot">
                            <button className="os-btn" onClick={onClose}>닫기</button>
                            <button className="os-btn primary" disabled={!canNext1} onClick={() => setStep(2)}>다음</button>
                        </div>
                    </>
                ) : step === 2 ? (
                    <>
                        <h3>어디까지 알아서 할까요?</h3>
                        <div className="os-step">2 / 3 · 밖으로 나가는 일(보내기·게시·결제·삭제)은 늘 내가 허용한 뒤에만.</div>
                        <div className="os-chips" style={{ flexDirection: 'column' }}>
                            {AUTONOMY.map(a => (
                                <button key={a.id} className="os-chipbtn" aria-pressed={autonomy === a.id} onClick={() => setAutonomy(a.id)}>
                                    {a.label}<small>{a.desc}</small>
                                </button>
                            ))}
                        </div>
                        <div className="os-sheet-foot">
                            <button className="os-btn" onClick={() => setStep(1)}>이전</button>
                            <button className="os-btn primary" onClick={() => setStep(3)}>다음</button>
                        </div>
                    </>
                ) : (
                    <>
                        <h3>모양과 색, 그리고 이름</h3>
                        <div className="os-step">3 / 3 · 명단에 이렇게 보여요.</div>
                        <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 16 }}>
                            <BotAvatar shape={shape} color={color} state="idle" size={96} />
                            <div style={{ flex: 1 }}>
                                <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={20} placeholder="봇 이름" aria-label="봇 이름" />
                                <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, marginTop: 6 }}>{preset?.oneLiner || (customJob.trim().slice(0, 40))}</div>
                            </div>
                        </div>
                        <div className="os-step" style={{ marginBottom: 8 }}>모양</div>
                        <div className="os-chips">
                            {SHAPES.map(s => (
                                <button key={s} className="os-shape-pick" aria-pressed={shape === s} onClick={() => setShape(s)} aria-label={s}>
                                    <BotAvatar shape={s} color={color} state="sleeping" size={44} />
                                </button>
                            ))}
                        </div>
                        <div className="os-step" style={{ margin: '14px 0 8px' }}>색</div>
                        <div className="os-swatches">
                            {COLORS.map(c => (
                                <button key={c} className="os-swatch" aria-pressed={color === c} onClick={() => setColor(c)} aria-label={c}
                                    style={{ background: `var(--봇-${c})` }} />
                            ))}
                        </div>
                        {err && <div className="os-notice" style={{ margin: '14px 0 0' }}>{err}</div>}
                        <div className="os-sheet-foot">
                            <button className="os-btn" onClick={() => setStep(2)} disabled={busy}>이전</button>
                            <button className="os-btn primary" onClick={create} disabled={!canCreate || busy}>{busy ? '만드는 중…' : '팀에 넣기'}</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
