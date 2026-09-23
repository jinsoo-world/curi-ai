'use client'
// 오른쪽 세부칸의 「이 봇이 읽은 자료」 — 진짜 목록 + 넣기 + 빼기.
// 상태 = 기다리는 중(pending) / 읽는 중(processing) / 다 읽음(completed) / 못 읽음(failed)

import { useCallback, useEffect, useRef, useState } from 'react'
import AddKnowledgeSheet from './AddKnowledgeSheet'
import { KNOWLEDGE_CHANGED_EVENT } from '@/domains/os/feeds/events'

export interface BotSourceView {
    id: string
    title: string
    sourceType: 'pdf' | 'url' | 'youtube' | 'text'
    status: 'pending' | 'processing' | 'completed' | 'failed'
    chunkCount: number
}

const KIND_ICON: Record<BotSourceView['sourceType'], string> = { pdf: '📄', url: '🔗', youtube: '▶️', text: '📝' }
const STATUS_LABEL: Record<BotSourceView['status'], string> = {
    pending: '기다리는 중', processing: '읽는 중…', completed: '다 읽음', failed: '못 읽음',
}

export default function KnowledgeList({ mentorId, onCountChange }: { mentorId: string; onCountChange?: (n: number) => void }) {
    const [sources, setSources] = useState<BotSourceView[] | null>(null)
    const [sheet, setSheet] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [다시보기, set다시보기] = useState(0)
    /** 아직 읽는 중인 자료가 있나 (있을 때만 몇 초마다 다시 본다) */
    const 읽는중 = useRef(false)

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/os/knowledge?mentorId=${encodeURIComponent(mentorId)}`, { cache: 'no-store' })
            const data = await res.json()
            if (!res.ok) {
                읽는중.current = false
                // 403 = 시연 봇(내 봇이 아님). 「권한이 없어요」보다 왜 안 되는지 말해 준다
                setErr(res.status === 403 ? '이 봇은 시연용이라 자료를 넣을 수 없어요' : (data.error || '자료를 못 불러왔어요'))
                setSources([]); return
            }
            const list = (data.sources ?? []) as BotSourceView[]
            읽는중.current = list.some(s => s.status === 'pending' || s.status === 'processing')
            setErr(null)
            setSources(list)
            onCountChange?.(list.length)
        } catch {
            읽는중.current = false
            setErr('자료를 못 불러왔어요'); setSources([])
        }
    }, [mentorId, onCountChange])

    /** 자료를 넣거나 뺀 뒤 = 다시 불러오고, 읽는 중이면 되풀이도 다시 켠다 */
    const reload = useCallback(async () => {
        await load()
        set다시보기(n => n + 1)
    }, [load])

    // 화면에 뜨면 한 번 불러오고, 「읽는 중」인 자료가 있는 동안만 4초마다 다시 본다.
    // 다 읽으면 스스로 멈춘다 (계속 두드리지 않는다 = 조용함 규칙).
    useEffect(() => {
        let alive = true
        let timer: ReturnType<typeof setTimeout> | null = null
        const tick = () => {
            void load().then(() => {
                if (!alive || !읽는중.current) return
                timer = setTimeout(tick, 4000)
            })
        }
        timer = setTimeout(tick, 0)
        return () => { alive = false; if (timer) clearTimeout(timer) }
    }, [load, 다시보기])

    // 연결한 계정에서 글을 가져오거나 지우면(FeedList) 목록을 다시 본다
    useEffect(() => {
        const h = () => { void reload() }
        window.addEventListener(KNOWLEDGE_CHANGED_EVENT, h)
        return () => window.removeEventListener(KNOWLEDGE_CHANGED_EVENT, h)
    }, [reload])

    const 빼기 = async (id: string, title: string) => {
        if (!window.confirm(`「${title}」을 뺄까요? 봇이 이 자료를 더 이상 못 읽어요.`)) return
        const res = await fetch('/api/os/knowledge', {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mentorId, sourceId: id }),
        })
        if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error || '빼지 못했어요'); return }
        await reload()
    }

    return (
        <>
            <h4>이 봇이 읽은 자료 {sources ? `(${sources.length}개)` : ''}</h4>

            {/* 넣기 단추는 목록 위에 항상 보인다 (목록이 길어도 안 숨는다) */}
            <button className="os-btn primary" style={{ width: '100%', marginBottom: 10, minHeight: 44 }} onClick={() => setSheet(true)}>＋ 자료 넣기</button>

            {err && <div className="os-card" style={{ color: 'var(--os-경고)' }}>{err}</div>}

            {sources === null && <div className="os-card">불러오는 중…</div>}

            {sources && sources.length === 0 && !err && (
                <div className="os-card">아직 읽은 자료가 없어요.<br /><span style={{ fontSize: 13 }}>PDF, 링크, 유튜브, 붙여넣은 글을 넣을 수 있어요.</span></div>
            )}

            {sources && sources.map(s => (
                <div key={s.id} className="os-source">
                    <span className="os-source-kind" aria-hidden>{KIND_ICON[s.sourceType] ?? '📄'}</span>
                    <span className="os-source-title" title={s.title}>{s.title}</span>
                    <span className={`os-source-state${s.status === 'failed' ? ' bad' : ''}${s.status === 'completed' ? ' ok' : ''}`}>
                        {STATUS_LABEL[s.status]}
                    </span>
                    <button className="os-source-x" aria-label={`${s.title} 빼기`} title="빼기" onClick={() => void 빼기(s.id, s.title)}>✕</button>
                </div>
            ))}

            {sheet && (
                <AddKnowledgeSheet
                    mentorId={mentorId}
                    onClose={() => setSheet(false)}
                    onAdded={reload}
                />
            )}
        </>
    )
}
