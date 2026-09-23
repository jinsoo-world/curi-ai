'use client'
// 「누가 대화할 수 있나요」 시트 — Just Me / Insiders / Public / Anonymous + 방문자 1인당 주간 한도 + 접근 그룹(초대 명단).
// 델파이 문법 그대로. 순수 판정은 domains/os/audience.ts, 표는 supabase/migrations/20261001_audience.sql.

import { useCallback, useEffect, useState } from 'react'
import { AUDIENCE_DESC, AUDIENCE_LABEL, AUDIENCE_LEVELS, type AudienceLevel } from '@/domains/os/audience'

interface GroupMember { id: string; email: string | null; userId: string | null; invitedAt: string }
interface Group { id: string; name: string; createdAt: string; members: GroupMember[] }

interface Loaded {
    level: AudienceLevel
    messageLimitPerWeek: number | null
    voiceMinutesPerWeek: number | null
    groups: Group[]
    selectedGroupIds: string[]
}

export default function AudienceSheet({ mentorId, botName, onClose }: { mentorId: string; botName: string; onClose: () => void }) {
    const [data, setData] = useState<Loaded | null>(null)
    const [level, setLevel] = useState<AudienceLevel>('just_me')
    const [limit, setLimit] = useState('')
    const [picked, setPicked] = useState<string[]>([])
    const [newGroupName, setNewGroupName] = useState('')
    const [newEmail, setNewEmail] = useState<Record<string, string>>({})
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [msg, setMsg] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/os/audience?mentorId=${encodeURIComponent(mentorId)}`, { cache: 'no-store' })
            const d = await res.json()
            if (!res.ok) { setErr(d.error || '설정을 못 불러왔어요'); return }
            setData(d)
            setLevel(d.level)
            setLimit(d.messageLimitPerWeek == null ? '' : String(d.messageLimitPerWeek))
            setPicked(d.selectedGroupIds ?? [])
        } catch {
            setErr('설정을 못 불러왔어요')
        }
    }, [mentorId])

    useEffect(() => { void load() }, [load])

    const 저장 = async () => {
        setBusy(true); setErr(null); setMsg(null)
        try {
            const res = await fetch('/api/os/audience', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, level, messageLimitPerWeek: limit, groupIds: picked }),
            })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(d.error || '저장하지 못했어요')
            setMsg('저장했어요')
            setTimeout(onClose, 600)
        } catch (e) {
            setErr(e instanceof Error ? e.message : '저장하지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    const 그룹만들기 = async () => {
        const name = newGroupName.trim()
        if (!name) return
        setBusy(true); setErr(null)
        try {
            const res = await fetch('/api/os/audience/groups', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
            })
            const d = await res.json()
            if (!res.ok) throw new Error(d.error || '그룹을 못 만들었어요')
            setNewGroupName('')
            await load()
        } catch (e) {
            setErr(e instanceof Error ? e.message : '그룹을 못 만들었어요')
        } finally {
            setBusy(false)
        }
    }

    const 그룹지우기 = async (groupId: string) => {
        setBusy(true); setErr(null)
        try {
            const res = await fetch(`/api/os/audience/groups?groupId=${encodeURIComponent(groupId)}`, { method: 'DELETE' })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(d.error || '그룹을 못 지웠어요')
            setPicked(prev => prev.filter(id => id !== groupId))
            await load()
        } catch (e) {
            setErr(e instanceof Error ? e.message : '그룹을 못 지웠어요')
        } finally {
            setBusy(false)
        }
    }

    const 초대하기 = async (groupId: string) => {
        const email = (newEmail[groupId] ?? '').trim()
        if (!email) return
        setBusy(true); setErr(null)
        try {
            const res = await fetch('/api/os/audience/groups/members', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId, email }),
            })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(d.error || '초대하지 못했어요')
            setNewEmail(prev => ({ ...prev, [groupId]: '' }))
            await load()
        } catch (e) {
            setErr(e instanceof Error ? e.message : '초대하지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    const 초대빼기 = async (groupId: string, memberId: string) => {
        setBusy(true); setErr(null)
        try {
            const res = await fetch('/api/os/audience/groups/members', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId, memberId }),
            })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(d.error || '빼지 못했어요')
            await load()
        } catch (e) {
            setErr(e instanceof Error ? e.message : '빼지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="os-sheet-back" data-theme="os" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="누가 대화할 수 있나요">
            <div className="os-sheet" onClick={e => e.stopPropagation()}>
                <h3>누가 {botName}와 대화할 수 있나요</h3>
                <div className="os-step">공개 범위를 정하고, 초대한 사람만 볼 수 있게 그룹을 만들 수 있어요.</div>

                {!data && !err && <div className="os-card">불러오는 중…</div>}

                {data && (
                    <>
                        <div role="radiogroup" aria-label="공개 범위" style={{ display: 'grid', gap: 8 }}>
                            {AUDIENCE_LEVELS.map(l => (
                                <button key={l} type="button" role="radio" aria-checked={level === l} className="os-chipbtn"
                                    onClick={() => setLevel(l)} disabled={busy} style={{ width: '100%' }}>
                                    <b>{AUDIENCE_LABEL[l]}</b>
                                    <small>{AUDIENCE_DESC[l]}</small>
                                </button>
                            ))}
                        </div>

                        <div className="os-step" style={{ margin: '16px 0 8px' }}>방문자 1인당 주간 대화 한도</div>
                        <input type="number" min={0} value={limit} onChange={e => setLimit(e.target.value)} disabled={busy}
                            placeholder="정해 두지 않으면 각자 요금제 한도를 따라요" aria-label="방문자 1인당 주간 한도" />
                        <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                            실제 한도는 방문자의 큐리 요금제 한도와 이 값 중 더 작은 쪽이에요. 내가 이 봇과 나누는 대화는 이 한도와 상관없어요(내 요금제 한도만 적용).
                        </div>

                        {level === 'insiders' && (
                            <>
                                <div className="os-step" style={{ margin: '16px 0 8px' }}>접근 그룹 (여기 든 사람만 통과해요)</div>
                                <div style={{ display: 'grid', gap: 10 }}>
                                    {data.groups.length === 0 && <div className="os-card">아직 만든 그룹이 없어요. 아래에서 하나 만들어 주세요.</div>}
                                    {data.groups.map(g => (
                                        <div key={g.id} className="os-card">
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                                                <input type="checkbox" checked={picked.includes(g.id)} disabled={busy}
                                                    onChange={e => setPicked(prev => e.target.checked ? [...prev, g.id] : prev.filter(id => id !== g.id))} />
                                                {g.name}
                                                <button type="button" className="os-source-x" aria-label={`${g.name} 그룹 지우기`} disabled={busy}
                                                    onClick={() => 그룹지우기(g.id)} style={{ marginLeft: 'auto' }}>✕</button>
                                            </label>
                                            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                                                {g.members.map(m => (
                                                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
                                                        <span>{m.email ?? m.userId}{m.userId ? ' (가입함)' : ' (초대중)'}</span>
                                                        <button type="button" className="os-source-x" aria-label="초대 빼기" disabled={busy}
                                                            onClick={() => 초대빼기(g.id, m.id)}>✕</button>
                                                    </div>
                                                ))}
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <input type="text" placeholder="이메일로 초대"
                                                        value={newEmail[g.id] ?? ''} disabled={busy}
                                                        onChange={e => setNewEmail(prev => ({ ...prev, [g.id]: e.target.value }))}
                                                        style={{ flex: 1, minWidth: 0 }} aria-label={`${g.name} 그룹에 이메일로 초대`} />
                                                    <button type="button" className="os-btn" disabled={busy} onClick={() => 초대하기(g.id)}>초대</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <input type="text" placeholder="새 그룹 이름 (예: VIP 팬)" value={newGroupName} disabled={busy}
                                            onChange={e => setNewGroupName(e.target.value)} style={{ flex: 1, minWidth: 0 }} aria-label="새 그룹 이름" />
                                        <button type="button" className="os-btn" disabled={busy || !newGroupName.trim()} onClick={그룹만들기}>그룹 만들기</button>
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}

                {msg && <div className="os-notice" style={{ margin: '14px 0 0', background: 'color-mix(in srgb, var(--os-클로버) 18%, transparent)', color: 'var(--os-클로버)' }}>{msg}</div>}
                {err && <div className="os-notice" style={{ margin: '14px 0 0' }}>{err}</div>}

                <div className="os-sheet-foot">
                    <button className="os-btn" onClick={onClose} disabled={busy}>닫기</button>
                    {data && <button className="os-btn primary" onClick={저장} disabled={busy}>{busy ? '저장하는 중…' : '저장'}</button>}
                </div>
            </div>
        </div>
    )
}
