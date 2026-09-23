'use client'
// 오른쪽 세부칸의 「루틴」 = 이 봇이 정해진 때에 반복하는 일.
// 창구는 이미 다 있다(4일차). 여기는 화면만 붙인다: 목록 · 만들기 폼(6확인) · 시험 실행.
//
// 규칙(그록봇에서 배운 것) = 루틴은 **꺼진 채로 태어난다**. 사람이 「시험 실행」을 눈으로 보고 켠다.
// 결과는 대화방에 봇 답으로 들어가므로, 시험이 끝나면 「대화방을 확인하세요」라고만 알린다.

import { useCallback, useEffect, useState } from 'react'
import { describeSchedule, type ScheduleKind } from '@/domains/os/schedule'
import { osTrack } from '@/domains/os/events'

interface RoutineView {
    id: string
    title: string
    scheduleKind: ScheduleKind
    runAtLocal: string
    weekday: number | null
    enabled: boolean
    lastResult: string | null
}

const KIND_LABEL: { id: ScheduleKind; label: string }[] = [
    { id: 'daily', label: '매일' },
    { id: 'weekdays', label: '평일' },
    { id: 'weekly', label: '매주' },
]
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const label: React.CSSProperties = { fontSize: 12.5, color: 'var(--os-글-흐림)', display: 'block', margin: '10px 0 4px' }
const field: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--os-선)',
    background: 'var(--os-말풍선)', color: 'var(--os-글)', fontSize: 14.5, fontFamily: 'inherit',
}

export default function RoutinePanel({ mentorId, botName }: { mentorId: string; botName: string }) {
    const [routines, setRoutines] = useState<RoutineView[]>([])
    const [tableMissing, setTableMissing] = useState(false)
    const [guest, setGuest] = useState(false)
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [note, setNote] = useState<string | null>(null)

    // 만들기 폼 = 그록봇 6확인 (담당 봇은 이 봇으로 고정이라 칸이 없다)
    const [title, setTitle] = useState('')
    const [instruction, setInstruction] = useState('')
    const [scheduleKind, setScheduleKind] = useState<ScheduleKind>('daily')
    const [runAtLocal, setRunAtLocal] = useState('08:30')
    const [weekday, setWeekday] = useState(1)
    const [inputSource, setInputSource] = useState('')
    const [expectedOutput, setExpectedOutput] = useState('')
    const [approvalBoundary, setApprovalBoundary] = useState('밖으로 보내는 일은 항상 승인받는다')

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/os/routines?mentorId=${encodeURIComponent(mentorId)}`, { cache: 'no-store' })
            const d = await res.json()
            setRoutines(Array.isArray(d.routines) ? d.routines : [])
            setTableMissing(!!d.tableMissing)
            setGuest(!!d.guest)
        } catch {
            setRoutines([])
        } finally {
            setLoading(false)
        }
    }, [mentorId])

    useEffect(() => { void load() }, [load])

    const 만들기 = async () => {
        setBusy(true); setErr(null); setNote(null)
        try {
            const res = await fetch('/api/os/routines', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mentorId, title, instruction, scheduleKind, runAtLocal,
                    weekday: scheduleKind === 'weekly' ? weekday : null,
                    inputSource, expectedOutput,
                    onMissingData: 'report_failure',   // 자료 없으면 지어내지 말고 실패 보고 (기본값)
                    approvalBoundary,
                }),
            })
            const d = await res.json()
            if (!res.ok) throw new Error(d.error || '루틴을 만들지 못했어요')
            osTrack('os_routine_created', { mentor_id: mentorId, schedule_kind: scheduleKind })
            setOpen(false)
            setTitle(''); setInstruction(''); setInputSource(''); setExpectedOutput('')
            setNote('루틴을 만들었어요. 꺼진 채로 있으니 「시험 실행」을 보고 켜 주세요.')
            await load()
        } catch (e) {
            setErr(e instanceof Error ? e.message : '루틴을 만들지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    const 켜기끄기 = async (r: RoutineView) => {
        setRoutines(prev => prev.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x))
        try {
            await fetch(`/api/os/routines/${r.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !r.enabled }),
            })
        } catch {
            await load()   // 실패하면 진짜 상태로 되돌린다
        }
    }

    const 시험실행 = async (r: RoutineView) => {
        setBusy(true); setErr(null); setNote(`${r.title} 을(를) 지금 한 번 돌리는 중…`)
        try {
            const res = await fetch(`/api/os/routines/${r.id}/run`, { method: 'POST' })
            const d = await res.json()
            if (!res.ok) throw new Error(d.error || '돌려 보지 못했어요')
            setNote(d.ok
                ? '한 번 돌렸어요. 결과는 봇 답으로 들어갔으니 대화방을 확인하세요.'
                : `이번에는 못 했어요. ${String(d.result ?? '').slice(0, 80)}`)
            await load()
        } catch (e) {
            setNote(null)
            setErr(e instanceof Error ? e.message : '돌려 보지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    if (tableMissing) {
        return (
            <>
                <h4>루틴</h4>
                <div className="os-card">루틴은 준비 중이에요. 표가 적용되면 바로 쓸 수 있어요.</div>
            </>
        )
    }

    return (
        <>
            <h4>루틴</h4>

            {loading && <div className="os-card">불러오는 중…</div>}

            {!loading && guest && <div className="os-card">로그인하면 반복할 일을 맡길 수 있어요.</div>}

            {!loading && !guest && routines.length === 0 && !open && (
                <div className="os-card">아직 반복하는 일이 없어요. {botName}에게 정해진 때에 할 일을 맡겨 보세요.</div>
            )}

            {routines.map(r => (
                <div key={r.id} className="os-routine">
                    <div className="os-routine-top">
                        <span className="os-routine-title">{r.title}</span>
                        <button
                            type="button" role="switch" aria-checked={r.enabled}
                            aria-label={`${r.title} ${r.enabled ? '끄기' : '켜기'}`}
                            className="os-routine-switch" data-on={r.enabled}
                            onClick={() => void 켜기끄기(r)}
                        ><span /></button>
                    </div>
                    <div className="os-routine-when">{describeSchedule({ schedule_kind: r.scheduleKind, run_at_local: r.runAtLocal, weekday: r.weekday })}</div>
                    {r.lastResult && <div className="os-routine-last">지난번: {r.lastResult}</div>}
                    <button className="os-linkbtn" disabled={busy} onClick={() => void 시험실행(r)}>▶ 시험 실행</button>
                </div>
            ))}

            {!guest && !open && (
                <button className="os-linkbtn" onClick={() => { setOpen(true); setNote(null); setErr(null) }}>＋ 반복할 일 만들기</button>
            )}

            {open && (
                <div className="os-card" style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 13, color: 'var(--os-글-흐림)' }}>맡을 봇 · <b style={{ color: 'var(--os-글)' }}>{botName}</b></div>

                    <label style={label} htmlFor="rt-title">이름 (무슨 일인지 한 줄)</label>
                    <input id="rt-title" style={field} value={title} maxLength={40} onChange={e => setTitle(e.target.value)} placeholder="아침 글감 5개" />

                    <label style={label} htmlFor="rt-do">시킬 일</label>
                    <textarea id="rt-do" style={{ ...field, resize: 'vertical' }} rows={3} value={instruction} maxLength={1000}
                        onChange={e => setInstruction(e.target.value)} placeholder="내 자료에서 오늘 쓰기 좋은 글감 5개를 골라 한 줄씩 적어 줘" />

                    <label style={label}>언제</label>
                    <div style={{ display: 'flex', gap: 6 }} role="tablist">
                        {KIND_LABEL.map(k => (
                            <button key={k.id} type="button" role="tab" className="os-tab" aria-selected={scheduleKind === k.id}
                                onClick={() => setScheduleKind(k.id)}>{k.label}</button>
                        ))}
                    </div>
                    {scheduleKind === 'weekly' && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                            {WEEKDAYS.map((w, i) => (
                                <button key={w} type="button" className="os-chipbtn" aria-pressed={weekday === i}
                                    style={{ minHeight: 40, padding: '8px 12px' }} onClick={() => setWeekday(i)}>{w}</button>
                            ))}
                        </div>
                    )}
                    <input type="time" style={{ ...field, marginTop: 6 }} value={runAtLocal} onChange={e => setRunAtLocal(e.target.value)} aria-label="몇 시에" />
                    <div style={{ fontSize: 12, color: 'var(--os-글-흐림)', marginTop: 4 }}>한국 시간(서울) 기준이에요.</div>

                    <label style={label} htmlFor="rt-src">어디를 보고 만드나 (선택)</label>
                    <input id="rt-src" style={field} value={inputSource} maxLength={300} onChange={e => setInputSource(e.target.value)} placeholder="내가 넣어 둔 자료" />

                    <label style={label} htmlFor="rt-out">무엇이 나와야 성공인가 (선택)</label>
                    <input id="rt-out" style={field} value={expectedOutput} maxLength={300} onChange={e => setExpectedOutput(e.target.value)} placeholder="30초에 읽히는 다섯 줄" />

                    <label style={label} htmlFor="rt-line">승인 경계</label>
                    <input id="rt-line" style={field} value={approvalBoundary} maxLength={200} onChange={e => setApprovalBoundary(e.target.value)} />

                    <div className="os-card" style={{ marginTop: 10, background: 'var(--os-바탕)', fontSize: 13 }}>
                        볼 자료가 없으면 <b>지어내지 않고 실패를 보고해요.</b> 만든 루틴은 꺼진 채로 있고, 시험 실행을 본 뒤에 켜면 돼요.
                    </div>

                    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                        <button className="os-btn" style={{ flex: 1, minHeight: 44 }} onClick={() => setOpen(false)}>그만두기</button>
                        <button className="os-btn primary" style={{ flex: 1, minHeight: 44 }}
                            disabled={busy || !title.trim() || !instruction.trim()} onClick={() => void 만들기()}>만들기</button>
                    </div>
                </div>
            )}

            {note && <div className="os-routine-note">{note}</div>}
            {err && <div className="os-routine-note bad">{err}</div>}
        </>
    )
}
