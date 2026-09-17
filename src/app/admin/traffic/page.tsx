'use client'

/**
 * 들어온 길 — 어디서 몇 명이 왔나 (대표 지시 2026-09-17 「1,2 둘다」)
 *
 * 카톡방에 링크를 뿌리고 나서 「몇 명 들어왔는지」를 여기서 본다.
 */
import { useCallback, useEffect, useState } from 'react'

interface 길 { 이름: string; 방문: number; 사람: number; 회원: number; 최근: string }
interface 줄 { created_at: string; path: string | null; utm_source: string | null; utm_campaign: string | null; referrer: string | null; user_id: string | null }

const 칸 = { padding: '11px 14px', fontSize: 14, borderBottom: '1px solid #f1f5f9' } as const

export default function TrafficPage() {
    const [일수, set일수] = useState(7)
    const [자료, set자료] = useState<{ 들어온길: 길[]; 최근: 줄[]; 같은기간: { 가입: number; 사진: number } } | null>(null)
    const [부르는중, set부르는중] = useState(true)

    const 불러오기 = useCallback(async (d: number) => {
        set부르는중(true)
        try {
            const r = await fetch(`/api/admin/traffic?days=${d}`)
            set자료(await r.json())
        } catch { set자료(null) }
        set부르는중(false)
    }, [])

    useEffect(() => { void 불러오기(일수) }, [일수, 불러오기])

    const 시각 = (s: string) => new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

    return (
        <div style={{ padding: '28px 24px 60px', maxWidth: 1100, margin: '0 auto' }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 6px' }}>들어온 길</h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 18px' }}>
                링크를 뿌린 뒤 어디서 몇 명이 왔는지 봅니다. 우리 안에서 화면을 옮겨 다닌 것은 세지 않습니다.
            </p>

            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
                {[1, 7, 30].map((d) => (
                    <button key={d} type="button" onClick={() => set일수(d)}
                        style={{
                            padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            border: '1px solid ' + (일수 === d ? '#111827' : '#e2e8f0'),
                            background: 일수 === d ? '#111827' : '#fff',
                            color: 일수 === d ? '#fff' : '#475569',
                        }}>
                        {d === 1 ? '오늘(24시간)' : `${d}일`}
                    </button>
                ))}
            </div>

            {부르는중 && <p style={{ fontSize: 14, color: '#94a3b8' }}>세는 중입니다…</p>}

            {자료 && (
                <>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                        {[
                            { 이름: '들어온 사람', 값: 자료.들어온길.reduce((a, b) => a + b.사람, 0) },
                            { 이름: '가입', 값: 자료.같은기간.가입 },
                            { 이름: '만든 사진', 값: 자료.같은기간.사진 },
                        ].map((k) => (
                            <div key={k.이름} style={{ flex: '1 1 160px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 18px' }}>
                                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>{k.이름}</div>
                                <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em' }}>{k.값.toLocaleString()}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                    <th style={{ ...칸, fontWeight: 800 }}>어디서</th>
                                    <th style={{ ...칸, fontWeight: 800, textAlign: 'right' }}>사람</th>
                                    <th style={{ ...칸, fontWeight: 800, textAlign: 'right' }}>방문</th>
                                    <th style={{ ...칸, fontWeight: 800, textAlign: 'right' }}>그중 회원</th>
                                    <th style={{ ...칸, fontWeight: 800, textAlign: 'right' }}>마지막</th>
                                </tr>
                            </thead>
                            <tbody>
                                {자료.들어온길.length === 0 && (
                                    <tr><td style={{ ...칸, color: '#94a3b8' }} colSpan={5}>아직 기록이 없습니다. 링크를 뿌리면 여기에 쌓입니다.</td></tr>
                                )}
                                {자료.들어온길.map((g) => (
                                    <tr key={g.이름}>
                                        <td style={{ ...칸, fontWeight: 700 }}>{g.이름}</td>
                                        <td style={{ ...칸, textAlign: 'right', fontWeight: 800 }}>{g.사람.toLocaleString()}</td>
                                        <td style={{ ...칸, textAlign: 'right', color: '#64748b' }}>{g.방문.toLocaleString()}</td>
                                        <td style={{ ...칸, textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>{g.회원.toLocaleString()}</td>
                                        <td style={{ ...칸, textAlign: 'right', color: '#94a3b8', fontSize: 13 }}>{시각(g.최근)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 10px' }}>최근에 들어온 것</h2>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
                        {자료.최근.length === 0 && <div style={{ ...칸, color: '#94a3b8' }}>아직 없습니다.</div>}
                        {자료.최근.map((r, i) => (
                            <div key={i} style={{ ...칸, display: 'flex', gap: 12, alignItems: 'center' }}>
                                <span style={{ color: '#94a3b8', fontSize: 13, width: 92, flexShrink: 0 }}>{시각(r.created_at)}</span>
                                <span style={{ fontWeight: 700, flexShrink: 0 }}>
                                    {r.utm_source ? `${r.utm_source}${r.utm_campaign ? ` · ${r.utm_campaign}` : ''}` : (r.referrer ? new URL(r.referrer).hostname.replace(/^www\./, '') : '직접')}
                                </span>
                                <span style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.path}</span>
                                {r.user_id && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>회원</span>}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
