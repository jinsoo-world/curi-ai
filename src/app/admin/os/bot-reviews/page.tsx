'use client'

// /admin/os/bot-reviews — AI 확인에서 「사람이 봐야 함」이 나온 봇. 승인하면 마켓에 공개, 거절하면 비공개 그대로.
// 관리자 확인은 admin/layout.tsx 의 requireAdmin, 창구는 requireAdminAPI 가 한다. 봇 글 원문은 여기 안 싣는다(이유, 분류만).

import { useCallback, useEffect, useState } from 'react'

interface Pending { mentorId: string; name: string; title: string; reasons: string[]; categories: string[]; requestedAt: string }

export default function BotReviewsPage() {
    const [list, setList] = useState<Pending[] | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)

    const load = useCallback(async () => {
        setErr(null)
        const res = await fetch('/api/admin/os/bot-reviews', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setErr(data.error || '목록을 못 읽었어요'); return }
        setList(data.pending as Pending[])
    }, [])

    useEffect(() => { void load() }, [load])

    const decide = async (mentorId: string, decision: 'approve' | 'reject') => {
        setBusy(mentorId); setErr(null)
        try {
            const res = await fetch('/api/admin/os/bot-reviews', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mentorId, decision }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '처리하지 못했어요')
            await load()
        } catch (e) {
            setErr(e instanceof Error ? e.message : '처리하지 못했어요')
        } finally {
            setBusy(null)
        }
    }

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>🔎 봇 공개 확인</h1>
            <p style={{ color: '#64748b', margin: '0 0 20px', fontSize: 14 }}>AI 가 사람 확인이 필요하다고 본 봇이에요. 승인하면 봇 마켓에 공개돼요.</p>
            {err && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{err}</div>}
            {list === null ? <div>읽는 중</div> : list.length === 0 ? <div style={{ color: '#64748b' }}>확인할 봇이 없어요</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', fontSize: 13, color: '#64748b' }}>
                            <th style={{ padding: 10 }}>봇</th><th style={{ padding: 10 }}>이유</th><th style={{ padding: 10 }}>분류</th><th style={{ padding: 10 }}>요청</th><th style={{ padding: 10 }} />
                        </tr>
                    </thead>
                    <tbody>
                        {list.map(p => (
                            <tr key={p.mentorId} style={{ borderTop: '1px solid #e5e7eb', fontSize: 14 }}>
                                <td style={{ padding: 10 }}>
                                    <a href={`/admin/mentors/${p.mentorId}`} style={{ fontWeight: 600, color: '#1a1a2e' }}>{p.name}</a>
                                    <div style={{ color: '#64748b', fontSize: 12 }}>{p.title}</div>
                                </td>
                                <td style={{ padding: 10 }}>{p.reasons.join(' / ') || '없음'}</td>
                                <td style={{ padding: 10 }}>{p.categories.join(', ') || '없음'}</td>
                                <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{new Date(p.requestedAt).toLocaleString('ko-KR')}</td>
                                <td style={{ padding: 10, whiteSpace: 'nowrap' }}>
                                    <button type="button" disabled={busy === p.mentorId} onClick={() => void decide(p.mentorId, 'approve')}
                                        style={{ marginRight: 6, padding: '6px 12px', borderRadius: 6, border: 0, background: '#03C124', color: '#fff', cursor: 'pointer' }}>승인</button>
                                    <button type="button" disabled={busy === p.mentorId} onClick={() => void decide(p.mentorId, 'reject')}
                                        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>거절</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    )
}
