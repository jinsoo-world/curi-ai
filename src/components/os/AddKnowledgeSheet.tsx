'use client'
// 「자료 넣기」 시트 — 파일 / 링크(유튜브 포함) / 붙여넣은 글 셋 중 하나.
// 넣는 순간 봇이 읽기 시작하고, 상태(기다리는 중 → 읽는 중 → 다 읽음)가 오른쪽 세부칸에 보인다.

import { useRef, useState } from 'react'
import { 올릴수있는파일, 고르기필터, 안내문구 } from '@/domains/knowledge/files'
import { osTrack } from '@/domains/os/events'

type Tab = 'file' | 'link' | 'text'

interface Props {
    mentorId: string
    onClose: () => void
    /** 자료가 하나 들어갔을 때 (목록 새로고침용) */
    onAdded: () => void | Promise<void>
}

export default function AddKnowledgeSheet({ mentorId, onClose, onAdded }: Props) {
    const [tab, setTab] = useState<Tab>('file')
    const [url, setUrl] = useState('')
    const [title, setTitle] = useState('')
    const [text, setText] = useState('')
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState<string | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    const 파일넣기 = async (file: File) => {
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        if (!(올릴수있는파일 as readonly string[]).includes(ext)) {
            setErr(`이 파일은 못 읽어요. ${안내문구} 만 넣을 수 있어요`); return
        }
        setBusy(true); setErr(null); setMsg('올리는 중…')
        try {
            const r1 = await fetch('/api/os/knowledge/upload-url', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, fileName: file.name, fileSize: file.size }),
            })
            const d1 = await r1.json()
            if (!r1.ok) throw new Error(d1.error || '올릴 자리를 못 만들었어요')

            const up = await fetch(d1.signedUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || 'application/octet-stream' },
                body: file,
            })
            if (!up.ok) throw new Error('파일을 못 올렸어요')

            await onAdded()
            setMsg('봇이 읽는 중이에요…')
            // 글 뽑기 + 조각 저장 (기존 창구를 그대로 쓴다. 주인 확인은 서버가 한다)
            const r2 = await fetch('/api/creator/knowledge/process', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceId: d1.sourceId, mentorId }),
            })
            const d2 = await r2.json().catch(() => ({}))
            await onAdded()
            if (!r2.ok) throw new Error(d2.error || '봇이 파일을 못 읽었어요')
            osTrack('os_knowledge_added', { mentor_id: mentorId, kind: 'file' })
            setMsg('다 읽었어요')
            setTimeout(onClose, 700)
        } catch (e) {
            setMsg(null)
            setErr(e instanceof Error ? e.message : '넣지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    const 넣기 = async () => {
        setBusy(true); setErr(null); setMsg('봇이 읽는 중이에요…')
        try {
            const body = tab === 'link'
                ? { mentorId, kind: 'url', url: url.trim() }
                : { mentorId, kind: 'text', title: title.trim(), text }
            const res = await fetch('/api/os/knowledge', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '넣지 못했어요')
            osTrack('os_knowledge_added', { mentor_id: mentorId, kind: tab === 'link' ? 'url' : 'text' })
            await onAdded()
            setMsg('다 읽었어요')
            setTimeout(onClose, 700)
        } catch (e) {
            setMsg(null)
            setErr(e instanceof Error ? e.message : '넣지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    const 넣을수있나 = tab === 'link' ? url.trim().length > 6 : text.trim().length >= 10

    return (
        <div className="os-sheet-back" data-theme="os" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="자료 넣기">
            <div className="os-sheet" onClick={e => e.stopPropagation()}>
                <h3>자료 넣기</h3>
                <div className="os-step">봇은 여기 넣은 자료로만 답해요. 없는 건 지어내지 않아요.</div>

                <div className="os-tabs" role="tablist">
                    <button className="os-tab" role="tab" aria-selected={tab === 'file'} onClick={() => setTab('file')} disabled={busy}>파일</button>
                    <button className="os-tab" role="tab" aria-selected={tab === 'link'} onClick={() => setTab('link')} disabled={busy}>링크, 유튜브</button>
                    <button className="os-tab" role="tab" aria-selected={tab === 'text'} onClick={() => setTab('text')} disabled={busy}>글 붙여넣기</button>
                </div>

                {tab === 'file' && (
                    <div style={{ marginTop: 14 }}>
                        <input
                            ref={fileRef}
                            type="file"
                            accept={고르기필터}
                            style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) void 파일넣기(f) }}
                        />
                        <button className="os-btn primary" style={{ width: '100%' }} disabled={busy} onClick={() => fileRef.current?.click()}>
                            {busy ? '넣는 중…' : '내 컴퓨터에서 파일 고르기'}
                        </button>
                        <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
                            {안내문구} / 파일 하나 10MB 까지
                        </div>
                    </div>
                )}

                {tab === 'link' && (
                    <div style={{ marginTop: 14 }}>
                        <input type="text" value={url} onChange={e => setUrl(e.target.value)} disabled={busy}
                            placeholder="https://… (웹페이지나 유튜브 주소)" aria-label="링크 주소" />
                        <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
                            유튜브는 아직 제목과 주소만 기억해요. 영상 속 말은 못 읽어요.
                        </div>
                    </div>
                )}

                {tab === 'text' && (
                    <div style={{ marginTop: 14 }}>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} disabled={busy}
                            maxLength={120} placeholder="이 글의 제목 (예: 8월 강의 정리)" aria-label="제목" />
                        <textarea className="os-textarea" value={text} onChange={e => setText(e.target.value)} disabled={busy}
                            rows={8} placeholder="여기에 글을 붙여 넣으세요" aria-label="글 내용" />
                    </div>
                )}

                {msg && <div className="os-notice" style={{ margin: '14px 0 0', background: 'color-mix(in srgb, var(--os-클로버) 18%, transparent)', color: 'var(--os-클로버)' }}>{msg}</div>}
                {err && <div className="os-notice" style={{ margin: '14px 0 0' }}>{err}</div>}

                <div className="os-sheet-foot">
                    <button className="os-btn" onClick={onClose} disabled={busy}>닫기</button>
                    {tab !== 'file' && (
                        <button className="os-btn primary" onClick={넣기} disabled={busy || !넣을수있나}>
                            {busy ? '넣는 중…' : '넣기'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
