'use client'

// /admin/os/inquiries 고객센터 문의 (2026-10-02). 최신순, 상태로 거르기, 답함/닫음 표시.
// 관리자 확인은 admin/layout.tsx 의 requireAdmin, 창구는 requireAdminAPI 가 한다.
// 문의 글은 남이 쓴 글 = 글자 그대로만 보여 준다(HTML 로 풀지 않는다).

import { useCallback, useEffect, useState } from 'react'
import { categoryLabel } from '@/domains/support/inquiry'

interface Inquiry {
    id: string; created_at: string; user_id: string | null; email: string; category: string; body: string
    platform: string | null; app_version: string | null; status: 'open' | 'answered' | 'closed'; answered_at: string | null
}

const STATUS_LABEL: Record<Inquiry['status'], string> = { open: '새 문의', answered: '답함', closed: '닫음' }
const FILTERS: { value: '' | Inquiry['status']; label: string }[] = [
    { value: 'open', label: '새 문의' }, { value: 'answered', label: '답함' }, { value: 'closed', label: '닫음' }, { value: '', label: '전체' },
]

export default function InquiriesPage() {
    const [filter, setFilter] = useState<'' | Inquiry['status']>('open')
    const [list, setList] = useState<Inquiry[] | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)

    const load = useCallback(async () => {
        setErr(null)
        const res = await fetch(`/api/admin/os/inquiries${filter ? `?status=${filter}` : ''}`, { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setErr(data.error || '목록을 못 읽었어요'); return }
        setList(data.inquiries as Inquiry[])
    }, [filter])

    useEffect(() => { void load() }, [load])

    const setStatus = async (id: string, status: Inquiry['status']) => {
        setBusy(id); setErr(null)
        try {
            const res = await fetch('/api/admin/os/inquiries', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '바꾸지 못했어요')
            await load()
        } catch (e) {
            setErr(e instanceof Error ? e.message : '바꾸지 못했어요')
        } finally {
            setBusy(null)
        }
    }

    const btn: React.CSSProperties = { marginRight: 6, padding: '6px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>📮 고객센터 문의</h1>
            <p style={{ color: '#64748b', margin: '0 0 16px', fontSize: 14 }}>/support 에서 들어온 문의예요. 답은 문의한 이메일로 보내고 여기서 「답함」을 눌러 주세요.</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {FILTERS.map(f => (
                    <button key={f.label} type="button" onClick={() => { setList(null); setFilter(f.value) }}
                        style={{ ...btn, marginRight: 0, background: filter === f.value ? '#1a1a2e' : '#fff', color: filter === f.value ? '#fff' : '#1a1a2e' }}>{f.label}</button>
                ))}
            </div>
            {err && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{err}</div>}
            {list === null ? <div>읽는 중</div> : list.length === 0 ? <div style={{ color: '#64748b' }}>문의가 없어요</div> : (
                <div style={{ display: 'grid', gap: 12 }}>
                    {list.map(i => (
                        <div key={i.id} style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                                <b style={{ color: '#1a1a2e' }}>{categoryLabel(i.category)}</b>
                                <span>{STATUS_LABEL[i.status]}</span>
                                <span>{new Date(i.created_at).toLocaleString('ko-KR')}</span>
                                <a href={`mailto:${encodeURIComponent(i.email)}?subject=${encodeURIComponent('[큐리 AI 고객센터] 문의 답변')}`} style={{ color: '#2563eb' }}>{i.email}</a>
                                {i.platform && <span>{i.platform} {i.app_version ?? ''}</span>}
                                {i.user_id && <a href={`/admin/users/${encodeURIComponent(i.user_id)}`} style={{ color: '#2563eb' }}>회원 보기</a>}
                                {i.answered_at && <span>답한 시각 {new Date(i.answered_at).toLocaleString('ko-KR')}</span>}
                            </div>
                            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, lineHeight: 1.7, color: '#1a1a2e' }}>{i.body}</div>
                            <div style={{ marginTop: 10 }}>
                                {i.status !== 'answered' && <button type="button" disabled={busy === i.id} onClick={() => void setStatus(i.id, 'answered')}
                                    style={{ ...btn, border: 0, background: '#03C124', color: '#fff' }}>답함</button>}
                                {i.status !== 'closed' && <button type="button" disabled={busy === i.id} onClick={() => void setStatus(i.id, 'closed')} style={btn}>닫음</button>}
                                {i.status !== 'open' && <button type="button" disabled={busy === i.id} onClick={() => void setStatus(i.id, 'open')} style={btn}>다시 열기</button>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
