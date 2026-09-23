'use client'
// 「자료 넣기」 시트 — 파일 / 링크(유튜브 포함) / 붙여넣은 글 / 내 폴더 중 하나.
// 넣는 순간 봇이 읽기 시작하고, 상태(기다리는 중 → 읽는 중 → 다 읽음)가 오른쪽 세부칸에 보인다.

import { useRef, useState } from 'react'
import { 올릴수있는파일, 고르기필터, 안내문구 } from '@/domains/knowledge/files'
import { osTrack } from '@/domains/os/events'
import { splitUrls } from '@/domains/os/settings'
import { parseQaCsv } from '@/domains/os/csv'
import FolderSync from './FolderSync'
import ConnectFeedSheet from './ConnectFeedSheet'

type Tab = 'file' | 'link' | 'text' | 'qa' | 'csv' | 'note' | 'folder' | 'feed'

interface Props {
    mentorId: string
    onClose: () => void
    /** 자료가 하나 들어갔을 때 (목록 새로고침용) */
    onAdded: () => void | Promise<void>
}

export default function AddKnowledgeSheet({ mentorId, onClose, onAdded }: Props) {
    const [tab, setTab] = useState<Tab>('file')
    /** 링크 칸 여러 개. 붙여 넣은 글에 주소가 여러 개면 자동으로 칸이 늘어난다 */
    const [urls, setUrls] = useState<string[]>([''])
    const [title, setTitle] = useState('')
    const [text, setText] = useState('')
    // Q&A 직접 쓰기
    const [qaQuestion, setQaQuestion] = useState('')
    const [qaAnswer, setQaAnswer] = useState('')
    // 짧은 메모(Quick Note)
    const [noteText, setNoteText] = useState('')
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState<string | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)
    const csvRef = useRef<HTMLInputElement>(null)

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

    /** 링크 칸 하나를 고친다. 주소가 여러 개 들어오면(줄바꿈, 쉼표) 칸을 나눠 준다 */
    const 링크칸바꾸기 = (i: number, value: string) => {
        const 나눔 = splitUrls(value)
        setUrls(prev => {
            const next = [...prev]
            if (나눔.length > 1) next.splice(i, 1, ...나눔)
            else next[i] = value
            return next
        })
    }

    /** 링크 여러 개를 차례로 넣는다. 실패한 주소만 칸에 남겨 다시 시도할 수 있게 한다 */
    const 링크넣기 = async () => {
        const 목록 = splitUrls(urls.join('\n'))
        if (목록.length === 0) return
        setBusy(true); setErr(null)
        const 실패: { url: string; why: string }[] = []
        let 성공 = 0
        for (const [i, u] of 목록.entries()) {
            setMsg(목록.length > 1 ? `${목록.length}개 중 ${i + 1}번째를 봇이 읽는 중이에요…` : '봇이 읽는 중이에요…')
            try {
                const res = await fetch('/api/os/knowledge', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mentorId, kind: 'url', url: u }),
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(data.error || '넣지 못했어요')
                성공 += 1
                osTrack('os_knowledge_added', { mentor_id: mentorId, kind: 'url' })
            } catch (e) {
                실패.push({ url: u, why: e instanceof Error ? e.message : '넣지 못했어요' })
            }
        }
        if (성공 > 0) await onAdded()
        setBusy(false)
        if (실패.length === 0) {
            setMsg(목록.length > 1 ? `${목록.length}개 다 읽었어요` : '다 읽었어요')
            setTimeout(onClose, 700)
            return
        }
        setUrls(실패.map(f => f.url))
        setMsg(성공 > 0 ? `${목록.length}개 중 ${성공}개 넣었어요` : null)
        setErr(`${실패.length}개는 못 넣었어요. 남긴 주소를 고쳐서 다시 「넣기」를 눌러 주세요. (${실패[0].why})`)
    }

    /** Q&A 한 쌍을 직접 써서 넣는다. 질문+답을 하나로 기억해서 비슷한 질문에 이 답을 앞세운다 */
    const qa넣기 = async () => {
        setBusy(true); setErr(null); setMsg('봇이 읽는 중이에요…')
        try {
            const res = await fetch('/api/os/knowledge', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, kind: 'qa', question: qaQuestion.trim(), answer: qaAnswer.trim() }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '넣지 못했어요')
            osTrack('os_knowledge_added', { mentor_id: mentorId, kind: 'qa' })
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

    /** 짧은 메모 하나를 넣는다 (제목 없이 글만) */
    const note넣기 = async () => {
        setBusy(true); setErr(null); setMsg('봇이 읽는 중이에요…')
        try {
            const res = await fetch('/api/os/knowledge', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, kind: 'text', text: noteText, sourceKind: 'note' }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '넣지 못했어요')
            osTrack('os_knowledge_added', { mentor_id: mentorId, kind: 'note' })
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

    /** CSV 파일(질문,답 두 칸)을 통째로 올린다. 한 줄씩 차례로 넣고, 실패한 줄만 이유와 함께 알려 준다 */
    const csv넣기 = async (file: File) => {
        setBusy(true); setErr(null); setMsg('CSV 를 읽는 중…')
        try {
            const 원문 = await file.text()
            const 목록 = parseQaCsv(원문)
            if (목록.length === 0) throw new Error('「질문,답」 두 칸짜리 줄을 못 찾았어요')
            const 실패: { question: string; why: string }[] = []
            let 성공 = 0
            for (const [i, row] of 목록.entries()) {
                setMsg(`${목록.length}개 중 ${i + 1}번째를 넣는 중이에요…`)
                try {
                    const res = await fetch('/api/os/knowledge', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mentorId, kind: 'qa', question: row.question, answer: row.answer, sourceKind: 'csv' }),
                    })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok) throw new Error(data.error || '넣지 못했어요')
                    성공 += 1
                } catch (e) {
                    실패.push({ question: row.question, why: e instanceof Error ? e.message : '넣지 못했어요' })
                }
            }
            if (성공 > 0) { osTrack('os_knowledge_added', { mentor_id: mentorId, kind: 'csv' }); await onAdded() }
            if (실패.length === 0) {
                setMsg(`${목록.length}개 다 넣었어요`)
                setTimeout(onClose, 700)
            } else {
                setMsg(성공 > 0 ? `${목록.length}개 중 ${성공}개 넣었어요` : null)
                setErr(`${실패.length}개는 못 넣었어요. (${실패[0].question}: ${실패[0].why})`)
            }
        } catch (e) {
            setMsg(null)
            setErr(e instanceof Error ? e.message : 'CSV 를 못 읽었어요')
        } finally {
            setBusy(false)
            if (csvRef.current) csvRef.current.value = ''
        }
    }

    const 넣기 = async () => {
        if (tab === 'link') { await 링크넣기(); return }
        if (tab === 'qa') { await qa넣기(); return }
        if (tab === 'note') { await note넣기(); return }
        setBusy(true); setErr(null); setMsg('봇이 읽는 중이에요…')
        try {
            const res = await fetch('/api/os/knowledge', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId, kind: 'text', title: title.trim(), text }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '넣지 못했어요')
            osTrack('os_knowledge_added', { mentor_id: mentorId, kind: 'text' })
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

    const 주소개수 = splitUrls(urls.join('\n')).length
    const 넣을수있나 = tab === 'link' ? 주소개수 > 0
        : tab === 'qa' ? qaQuestion.trim().length >= 2 && qaAnswer.trim().length >= 1
        : tab === 'note' ? noteText.trim().length >= 5
        : text.trim().length >= 10

    return (
        <div className="os-sheet-back" data-theme="os" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="자료 넣기">
            <div className="os-sheet" onClick={e => e.stopPropagation()}>
                <h3>자료 넣기</h3>
                <div className="os-step">봇은 여기 넣은 자료로만 답해요. 없는 건 지어내지 않아요.</div>

                <div className="os-tabs" role="tablist">
                    <button className="os-tab" role="tab" aria-selected={tab === 'file'} onClick={() => setTab('file')} disabled={busy}>파일</button>
                    <button className="os-tab" role="tab" aria-selected={tab === 'link'} onClick={() => setTab('link')} disabled={busy}>링크, 유튜브</button>
                    <button className="os-tab" role="tab" aria-selected={tab === 'text'} onClick={() => setTab('text')} disabled={busy}>글 붙여넣기</button>
                    <button className="os-tab" role="tab" aria-selected={tab === 'qa'} onClick={() => setTab('qa')} disabled={busy}>Q&amp;A 쓰기</button>
                    <button className="os-tab" role="tab" aria-selected={tab === 'csv'} onClick={() => setTab('csv')} disabled={busy}>CSV 올리기</button>
                    <button className="os-tab" role="tab" aria-selected={tab === 'note'} onClick={() => setTab('note')} disabled={busy}>짧은 메모</button>
                    <button className="os-tab" role="tab" aria-selected={tab === 'folder'} onClick={() => setTab('folder')} disabled={busy}>내 폴더</button>
                    <button className="os-tab" role="tab" aria-selected={tab === 'feed'} onClick={() => setTab('feed')} disabled={busy}>계정 연결</button>
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
                    <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                        {urls.map((u, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input type="text" value={u} onChange={e => 링크칸바꾸기(i, e.target.value)} disabled={busy}
                                    placeholder="https://… (웹페이지나 유튜브 주소)" aria-label={`링크 주소 ${i + 1}`} style={{ flex: 1, minWidth: 0 }} />
                                {urls.length > 1 && (
                                    <button type="button" className="os-source-x" aria-label={`주소 ${i + 1} 빼기`} disabled={busy}
                                        onClick={() => setUrls(prev => prev.filter((_, j) => j !== i))}>✕</button>
                                )}
                            </div>
                        ))}
                        <button type="button" className="os-btn" style={{ minHeight: 44 }} disabled={busy}
                            onClick={() => setUrls(prev => [...prev, ''])}>＋ 주소 더 넣기</button>
                        <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, lineHeight: 1.5 }}>
                            주소를 여러 줄 붙여 넣으면 알아서 나눠요. 유튜브는 아직 제목과 주소만 기억해요. 영상 속 말은 못 읽어요.
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

                {tab === 'qa' && (
                    <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                        <input type="text" value={qaQuestion} onChange={e => setQaQuestion(e.target.value)} disabled={busy}
                            maxLength={300} placeholder="자주 받는 질문 (예: 환불은 어떻게 하나요?)" aria-label="질문" />
                        <textarea className="os-textarea" value={qaAnswer} onChange={e => setQaAnswer(e.target.value)} disabled={busy}
                            rows={5} placeholder="이 질문에 봇이 할 답" aria-label="답" />
                        <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, lineHeight: 1.5 }}>
                            질문과 답을 통째로 하나로 기억해요. 그래서 비슷한 질문이 오면 이 답을 먼저 찾아요.
                        </div>
                    </div>
                )}

                {tab === 'csv' && (
                    <div style={{ marginTop: 14 }}>
                        <input
                            ref={csvRef}
                            type="file"
                            accept=".csv,text/csv"
                            style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) void csv넣기(f) }}
                        />
                        <button className="os-btn primary" style={{ width: '100%' }} disabled={busy} onClick={() => csvRef.current?.click()}>
                            {busy ? '넣는 중…' : 'CSV 파일 고르기'}
                        </button>
                        <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
                            첫 칸 = 질문, 둘째 칸 = 답. 맨 위에 「질문,답」 머리글 줄이 있어도 알아서 건너뛰어요.
                        </div>
                    </div>
                )}

                {tab === 'note' && (
                    <div style={{ marginTop: 14 }}>
                        <textarea className="os-textarea" value={noteText} onChange={e => setNoteText(e.target.value)} disabled={busy}
                            rows={5} placeholder="빠르게 메모 (예: 이번 주 특별 공지)" aria-label="짧은 메모" />
                    </div>
                )}

                {tab === 'folder' && (
                    <FolderSync mentorId={mentorId} onAdded={onAdded} onBusy={setBusy} onDone={onClose} />
                )}

                {tab === 'feed' && (
                    <ConnectFeedSheet mentorId={mentorId} onAdded={onAdded} onBusy={setBusy} onDone={onClose} />
                )}

                {msg && <div className="os-notice" style={{ margin: '14px 0 0', background: 'color-mix(in srgb, var(--os-클로버) 18%, transparent)', color: 'var(--os-클로버)' }}>{msg}</div>}
                {err && <div className="os-notice" style={{ margin: '14px 0 0' }}>{err}</div>}

                <div className="os-sheet-foot">
                    <button className="os-btn" onClick={onClose} disabled={busy}>닫기</button>
                    {tab !== 'file' && tab !== 'csv' && tab !== 'folder' && tab !== 'feed' && (
                        <button className="os-btn primary" onClick={넣기} disabled={busy || !넣을수있나}>
                            {busy ? '넣는 중…' : tab === 'link' && 주소개수 > 1 ? `${주소개수}개 넣기` : '넣기'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
