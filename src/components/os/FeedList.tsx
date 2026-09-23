'use client'
// 오른쪽 세부칸의 「연결한 계정」 — 이 봇에 붙인 유튜브, 웹사이트, 팟캐스트 등.
// 줄마다 = 이름, 마지막으로 가져온 시각, 가져온 자료 수, 상태, 그리고 「지금 가져오기」 「재연결」 「끊기」.
// 끊기는 기본으로 가져온 자료를 남긴다. 「같이 지울까요?」에 체크하면 그 자료도 지운다.

import { useCallback, useEffect, useState } from 'react'
import type { FeedKind, FeedStatus, KnowledgeFeed } from '@/domains/os/feeds/types'
import { FEEDS_CHANGED_EVENT, KNOWLEDGE_CHANGED_EVENT } from '@/domains/os/feeds/events'
import { FEED_KIND_LABEL } from './ConnectFeedSheet'

const KIND_ICON: Record<FeedKind, string> = {
    youtube: '▶️', website: '🌐', podcast: '🎙️', substack: '✉️', x: '𝕏', instagram: '📷', tiktok: '🎵',
}
const STATUS_LABEL: Record<FeedStatus, string> = { connected: '연결됨', error: '오류', paused: '준비 중' }

/** 적은 그대로가 길면 보기 좋게 다듬는다 (https://, www. 떼기) */
export function feedDisplayName(f: Pick<KnowledgeFeed, 'handleOrUrl'>): string {
    return f.handleOrUrl.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
}

/** 「3시간 전」 같은 말로. 하루가 넘으면 날짜로 */
export function whenLabel(iso: string | null, now = Date.now()): string {
    if (!iso) return '아직 안 가져왔어요'
    const t = Date.parse(iso)
    if (Number.isNaN(t)) return '아직 안 가져왔어요'
    const 분 = Math.floor((now - t) / 60_000)
    if (분 < 1) return '방금 가져왔어요'
    if (분 < 60) return `${분}분 전에 가져왔어요`
    if (분 < 24 * 60) return `${Math.floor(분 / 60)}시간 전에 가져왔어요`
    const d = new Date(t)
    return `${d.getMonth() + 1}월 ${d.getDate()}일에 가져왔어요`
}

export default function FeedList({ mentorId }: { mentorId: string }) {
    const [feeds, setFeeds] = useState<KnowledgeFeed[] | null>(null)
    const [note, setNote] = useState<string | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const [일하는중, set일하는중] = useState<string | null>(null)
    const [결과, set결과] = useState<{ id: string; text: string; bad: boolean } | null>(null)
    const [끊을것, set끊을것] = useState<KnowledgeFeed | null>(null)
    const [같이지우기, set같이지우기] = useState(false)

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/os/feeds?mentorId=${encodeURIComponent(mentorId)}`, { cache: 'no-store' })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                setErr(res.status === 403 ? null : (data.error || '연결한 계정을 못 불러왔어요'))
                setFeeds([]); return
            }
            setErr(null)
            setNote(data.note ?? null)
            setFeeds((data.feeds ?? []) as KnowledgeFeed[])
        } catch {
            setErr('연결한 계정을 못 불러왔어요'); setFeeds([])
        }
    }, [mentorId])

    useEffect(() => {
        const first = setTimeout(() => { void load() }, 0)
        const h = () => { void load() }
        window.addEventListener(FEEDS_CHANGED_EVENT, h)
        return () => { clearTimeout(first); window.removeEventListener(FEEDS_CHANGED_EVENT, h) }
    }, [load])

    const 가져오기 = async (f: KnowledgeFeed) => {
        set일하는중(f.id); set결과(null)
        try {
            const res = await fetch('/api/os/feeds/sync', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, feedId: f.id }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '가져오지 못했어요')
            const s = data.sync as { ok: boolean; added: number; note?: string }
            if (s.added > 0) window.dispatchEvent(new Event(KNOWLEDGE_CHANGED_EVENT))
            set결과({
                id: f.id, bad: !s.ok,
                text: !s.ok ? (s.note || '가져오지 못했어요')
                    : s.added > 0 ? `새 글 ${s.added}개를 넣었어요.${s.note ? ` ${s.note}` : ''}`
                        : (s.note || '새 글이 없어요'),
            })
        } catch (e) {
            set결과({ id: f.id, bad: true, text: e instanceof Error ? e.message : '가져오지 못했어요' })
        } finally {
            set일하는중(null)
            await load()
        }
    }

    const 끊기 = async () => {
        const f = 끊을것
        if (!f) return
        set일하는중(f.id)
        try {
            const res = await fetch('/api/os/feeds', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, feedId: f.id, deleteSources: 같이지우기 }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '끊지 못했어요')
            if ((data.removedSources ?? 0) > 0) window.dispatchEvent(new Event(KNOWLEDGE_CHANGED_EVENT))
            set끊을것(null); set같이지우기(false)
        } catch (e) {
            setErr(e instanceof Error ? e.message : '끊지 못했어요')
        } finally {
            set일하는중(null)
            await load()
        }
    }

    return (
        <>
            <h4>연결한 계정 {feeds ? `(${feeds.length}개)` : ''}</h4>
            {err && <div className="os-card" style={{ color: 'var(--os-경고)' }}>{err}</div>}
            {feeds === null && <div className="os-card">불러오는 중…</div>}
            {feeds && feeds.length === 0 && !err && (
                <div className="os-card">
                    {note ?? '아직 연결한 계정이 없어요.'}<br />
                    <span style={{ fontSize: 13 }}>「자료 넣기」의 「계정 연결」에서 유튜브 채널이나 웹사이트를 붙이면 새 글을 매일 가져와요.</span>
                </div>
            )}

            {feeds && feeds.map(f => {
                const 바쁨 = 일하는중 === f.id
                const 이름 = feedDisplayName(f)
                return (
                    <div key={f.id} className="os-card" style={{ padding: '10px 12px', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span aria-hidden>{KIND_ICON[f.kind] ?? '🔗'}</span>
                            <span className="os-source-title" title={f.handleOrUrl} style={{ flex: 1 }}>{이름}</span>
                            <span className={`os-source-state${f.status === 'error' ? ' bad' : ''}${f.status === 'connected' ? ' ok' : ''}`}>
                                {STATUS_LABEL[f.status]}
                            </span>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--os-글-흐림)', marginTop: 4, lineHeight: 1.5 }}>
                            {FEED_KIND_LABEL[f.kind]} / {whenLabel(f.lastSyncedAt)} / 가져온 자료 {f.itemCount}개
                        </div>
                        {f.lastError && (
                            <div style={{ fontSize: 12.5, color: f.status === 'error' ? 'var(--os-오류)' : 'var(--os-글-흐림)', marginTop: 4, lineHeight: 1.5 }}>
                                {f.lastError}
                            </div>
                        )}
                        {결과?.id === f.id && (
                            <div style={{ fontSize: 12.5, color: 결과.bad ? 'var(--os-오류)' : 'var(--os-클로버)', marginTop: 4, lineHeight: 1.5 }}>{결과.text}</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                            {f.status !== 'paused' && (
                                <button className="os-btn" style={{ minHeight: 36, padding: '6px 12px', fontSize: 13 }} disabled={!!일하는중}
                                    onClick={() => void 가져오기(f)}>
                                    {바쁨 ? '가져오는 중…' : f.status === 'error' ? '재연결' : '지금 가져오기'}
                                </button>
                            )}
                            <button className="os-btn" style={{ minHeight: 36, padding: '6px 12px', fontSize: 13 }} disabled={!!일하는중}
                                onClick={() => { set끊을것(f); set같이지우기(false) }}>끊기</button>
                        </div>
                    </div>
                )
            })}

            {끊을것 && (
                <div className="os-sheet-back" data-theme="os" onClick={일하는중 ? undefined : () => set끊을것(null)} role="dialog" aria-modal="true" aria-label="계정 연결 끊기">
                    <div className="os-sheet" onClick={e => e.stopPropagation()}>
                        <h3>연결을 끊을까요?</h3>
                        <div className="os-step">「{feedDisplayName(끊을것)}」에서 더 이상 새 글을 가져오지 않아요.</div>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, fontSize: 14, cursor: 'pointer' }}>
                            <input type="checkbox" checked={같이지우기} onChange={e => set같이지우기(e.target.checked)} disabled={!!일하는중} />
                            이 계정에서 가져온 자료도 같이 지울까요?
                        </label>
                        <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                            체크하지 않으면 이미 가져온 자료 {끊을것.itemCount}개는 그대로 남아요.
                        </div>
                        <div className="os-sheet-foot">
                            <button className="os-btn" onClick={() => set끊을것(null)} disabled={!!일하는중}>그만두기</button>
                            <button className="os-btn primary" onClick={() => void 끊기()} disabled={!!일하는중}>
                                {일하는중 ? '끊는 중…' : '끊기'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
