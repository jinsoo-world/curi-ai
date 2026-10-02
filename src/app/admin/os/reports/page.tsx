'use client'

// /admin/os/reports — 이용자가 넣은 봇 신고. 봇마다 묶어 보여 준다(애플 심사 지침 1.2 = 운영자가 신고를 보고 조치한다).
// 관리자 확인은 admin/layout.tsx 의 requireAdmin, 창구는 requireAdminAPI. 남이 쓴 글(발췌, 설명)은 글자 그대로만 보여 준다.
//   닫기 = 신고가 맞지 않다 · 내리기 = 봇 비공개(공개 관문) · 유지 = 그대로 두고, 신고로 자동으로 내려갔으면 다시 공개

import { useCallback, useEffect, useState } from 'react'

interface Item { id: string; reason: string; label: string; detail: string | null; excerpt: string | null; createdAt: string }
interface Group {
    mentorId: string; name: string; title: string; isActive: boolean; count: number; reporterCount: number
    reasons: { reason: string; label: string; count: number }[]; latestAt: string; items: Item[]
}
type Action = 'dismiss' | 'unpublish' | 'keep'

const btn = { padding: '6px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', marginRight: 6 } as const

export default function BotReportsPage() {
    const [groups, setGroups] = useState<Group[] | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const [note, setNote] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [missing, setMissing] = useState(false)

    const load = useCallback(async () => {
        setErr(null)
        const res = await fetch('/api/admin/os/reports', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setErr(data.error || '목록을 못 읽었어요'); return }
        setMissing(!!data.tableMissing)
        setGroups(data.groups as Group[])
    }, [])

    useEffect(() => { void load() }, [load])

    const act = async (mentorId: string, action: Action) => {
        if (action === 'unpublish' && !window.confirm('이 봇을 마켓에서 내릴까요?')) return
        setBusy(mentorId); setErr(null); setNote(null)
        try {
            const res = await fetch('/api/admin/os/reports', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mentorId, action }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '처리하지 못했어요')
            setNote(String(data.message ?? '처리했어요'))
            await load()
        } catch (e) {
            setErr(e instanceof Error ? e.message : '처리하지 못했어요')
        } finally {
            setBusy(null)
        }
    }

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>🚩 봇 신고</h1>
            <p style={{ color: '#64748b', margin: '0 0 20px', fontSize: 14 }}>
                이용자가 넣은 신고예요. 24시간 안에 확인해 주세요. 7일 안에 서로 다른 3명이 신고하면 봇은 자동으로 내려가고 「봇 공개 확인」에도 올라가요.
            </p>
            {missing && <div style={{ background: '#fef9c3', color: '#854d0e', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>신고 표가 아직 없어요(마이그레이션 20261002_bot_reports_blocks.sql 적용 전)</div>}
            {note && <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{note}</div>}
            {err && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{err}</div>}
            {groups === null ? <div>읽는 중</div> : groups.length === 0 ? <div style={{ color: '#64748b' }}>열린 신고가 없어요</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {groups.map(g => (
                        <section key={g.mentorId} style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontWeight: 700 }}>{g.name} <span style={{ fontSize: 12, color: g.isActive ? '#166534' : '#991b1b' }}>{g.isActive ? '공개 중' : '비공개'}</span></div>
                                    <div style={{ color: '#64748b', fontSize: 12 }}>{g.title}</div>
                                    <div style={{ fontSize: 13, marginTop: 6 }}>
                                        신고 {g.count}건, 신고한 사람 {g.reporterCount}명, 마지막 {new Date(g.latestAt).toLocaleString('ko-KR')}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#334155' }}>{g.reasons.map(r => `${r.label} ${r.count}`).join(' / ')}</div>
                                    <a href={`/admin/mentors/${encodeURIComponent(g.mentorId)}`} style={{ fontSize: 12, color: '#2563eb' }}>봇 자세히</a>
                                </div>
                                <div style={{ whiteSpace: 'nowrap' }}>
                                    <button type="button" disabled={busy === g.mentorId} onClick={() => void act(g.mentorId, 'unpublish')}
                                        style={{ ...btn, border: 0, background: '#dc2626', color: '#fff' }}>내리기</button>
                                    <button type="button" disabled={busy === g.mentorId} onClick={() => void act(g.mentorId, 'keep')} style={btn}>유지</button>
                                    <button type="button" disabled={busy === g.mentorId} onClick={() => void act(g.mentorId, 'dismiss')} style={btn}>닫기</button>
                                </div>
                            </div>
                            <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13 }}>
                                {g.items.map(it => (
                                    <li key={it.id} style={{ marginBottom: 8 }}>
                                        <b>{it.label}</b> <span style={{ color: '#94a3b8' }}>{new Date(it.createdAt).toLocaleString('ko-KR')}</span>
                                        {it.detail && <div style={{ whiteSpace: 'pre-wrap' }}>설명: {it.detail}</div>}
                                        {it.excerpt && <div style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: '6px 8px', borderRadius: 6, marginTop: 4, color: '#334155' }}>{it.excerpt}</div>}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </div>
    )
}
