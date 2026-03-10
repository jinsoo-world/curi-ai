'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export default function CreatorEditPage() {
    const router = useRouter()
    const params = useParams()
    const mentorId = params.id as string

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

    // AI에 반영되는 필드만
    const [name, setName] = useState('')
    const [title, setTitle] = useState('')
    const [systemPrompt, setSystemPrompt] = useState('')
    const [greetingMessage, setGreetingMessage] = useState('')
    const [sampleQuestions, setSampleQuestions] = useState('')
    const [isActive, setIsActive] = useState(true)
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
    const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(null)
    const avatarInputRef = useRef<HTMLInputElement>(null)
    const [knowledgeSources, setKnowledgeSources] = useState<{ id: string; title: string; source_type: string; processing_status: string; chunk_count: number; content?: string; created_at: string }[]>([])
    const [previewSource, setPreviewSource] = useState<{ title: string; content: string } | null>(null)
    const [uploading, setUploading] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ── 미리보기 채팅 ──
    const [previewMessages, setPreviewMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
    const [previewInput, setPreviewInput] = useState('')
    const [previewLoading, setPreviewLoading] = useState(false)
    const previewEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetchMentor()
    }, [mentorId])

    // 토스트 자동 숨김
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000)
            return () => clearTimeout(timer)
        }
    }, [toast])

    async function fetchMentor() {
        try {
            const res = await fetch(`/api/creator/mentor/detail?id=${mentorId}`)
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            const m = data.mentor
            setName(m.name || '')
            setTitle(m.title || '')
            setSystemPrompt(m.system_prompt || '')
            setGreetingMessage(m.greeting_message || '')
            setSampleQuestions((m.sample_questions || []).join('\n'))
            setIsActive(m.is_active)
            if (m.avatar_url) {
                setCurrentAvatarUrl(m.avatar_url)
                setAvatarPreview(m.avatar_url)
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '멘토 정보를 불러올 수 없습니다.')
        } finally {
            setLoading(false)
        }

        // 지식 파일 목록 로드
        try {
            const kRes = await fetch(`/api/creator/knowledge/list?mentorId=${mentorId}`)
            const kData = await kRes.json()
            if (kRes.ok) setKnowledgeSources(kData.sources || [])
        } catch { /* ignore */ }
    }

    // 파일 업로드
    async function handleFileUpload(files: FileList | null) {
        if (!files || files.length === 0) return

        // 최대 파일 수 검증 (3개)
        const newFilesArr = Array.from(files)
        if (knowledgeSources.length + newFilesArr.length > 3) {
            setToast({ type: 'error', message: '파일은 최대 3개까지 등록할 수 있습니다.' })
            return
        }

        setUploading(true)
        try {
            const allowedExtensions = ['pdf', 'txt', 'md', 'doc', 'docx', 'hwp', 'hwpx', 'ppt', 'pptx']
            for (const file of newFilesArr) {
                const ext = file.name.split('.').pop()?.toLowerCase() || ''
                if (!allowedExtensions.includes(ext)) {
                    setToast({ type: 'error', message: `지원하지 않는 형식: ${file.name}` })
                    continue
                }
                const formData = new FormData()
                formData.append('file', file)
                formData.append('mentorId', mentorId)
                const res = await fetch('/api/creator/knowledge/upload', { method: 'POST', body: formData })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error)

                const sourceId = data.source.id
                setKnowledgeSources(prev => [...prev, {
                    id: sourceId, title: data.source.fileName, source_type: ext,
                    processing_status: 'processing', chunk_count: 0, created_at: new Date().toISOString(),
                }])

                // 파일 텍스트 추출
                fetch('/api/creator/knowledge/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sourceId, mentorId }),
                }).then(async (r) => {
                    const result = await r.json()
                    if (r.ok) {
                        setKnowledgeSources(prev => prev.map(s => s.id === sourceId
                            ? { ...s, processing_status: 'completed', chunk_count: result.chunksProcessed }
                            : s
                        ))
                        setToast({ type: 'success', message: `✅ ${file.name} — AI 학습 완료!` })
                    } else {
                        setKnowledgeSources(prev => prev.map(s => s.id === sourceId
                            ? { ...s, processing_status: 'failed' } : s))
                        setToast({ type: 'error', message: `${file.name} 처리 실패` })
                    }
                }).catch(() => {
                    setKnowledgeSources(prev => prev.map(s => s.id === sourceId
                        ? { ...s, processing_status: 'failed' } : s))
                })
            }
        } catch (err: unknown) {
            setToast({ type: 'error', message: err instanceof Error ? err.message : '업로드 실패' })
        }
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // 실패한 파일 재처리
    async function handleReprocess(sourceId: string) {
        setKnowledgeSources(prev => prev.map(s => s.id === sourceId
            ? { ...s, processing_status: 'processing' } : s))
        try {
            const res = await fetch('/api/creator/knowledge/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceId, mentorId }),
            })
            const result = await res.json()
            if (res.ok) {
                // 재처리 완료 → 지식 목록을 다시 불러와서 content도 갱신
                try {
                    const listRes = await fetch(`/api/creator/knowledge/list?mentorId=${mentorId}`)
                    if (listRes.ok) {
                        const { sources } = await listRes.json()
                        setKnowledgeSources(sources)
                    }
                } catch {
                    // fallback: chunk count만 업데이트
                    setKnowledgeSources(prev => prev.map(s => s.id === sourceId
                        ? { ...s, processing_status: 'completed', chunk_count: result.chunksProcessed }
                        : s
                    ))
                }
                setToast({ type: 'success', message: `✅ 재처리 완료! ${result.totalCharacters?.toLocaleString() ?? 0}자 추출, AI 학습 완료` })
            } else {
                setKnowledgeSources(prev => prev.map(s => s.id === sourceId
                    ? { ...s, processing_status: 'failed' } : s))
                setToast({ type: 'error', message: `재처리 실패: ${result.error}` })
            }
        } catch {
            setKnowledgeSources(prev => prev.map(s => s.id === sourceId
                ? { ...s, processing_status: 'failed' } : s))
        }
    }

    async function handleDeleteSource(sourceId: string, title: string) {
        if (!confirm(`"${title}" 파일을 삭제하시겠습니까?`)) return
        try {
            const res = await fetch('/api/creator/knowledge/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceId, mentorId }),
            })
            if (res.ok) {
                setKnowledgeSources(prev => prev.filter(s => s.id !== sourceId))
                setToast({ type: 'success', message: `🗑️ "${title}" 삭제 완료` })
            } else {
                const data = await res.json()
                setToast({ type: 'error', message: `삭제 실패: ${data.error}` })
            }
        } catch {
            setToast({ type: 'error', message: '삭제 중 오류가 발생했습니다.' })
        }
    }

    function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) return
        if (file.size > 5 * 1024 * 1024) return
        setAvatarFile(file)
        setAvatarPreview(URL.createObjectURL(file))
    }

    async function handleSave() {
        setSaving(true)
        setToast(null)

        try {
            // 프로필 이미지 업로드 (새로 선택한 경우만)
            let avatarUrl: string | undefined = undefined
            if (avatarFile) {
                const ext = avatarFile.name.split('.').pop()
                const fileName = `mentor-avatar-${Date.now()}.${ext}`
                const formData = new FormData()
                formData.append('file', avatarFile)
                formData.append('fileName', fileName)
                formData.append('bucket', 'mentor-avatars')

                const avatarRes = await fetch('/api/creator/avatar/upload', {
                    method: 'POST',
                    body: formData,
                })
                if (avatarRes.ok) {
                    const avatarData = await avatarRes.json()
                    avatarUrl = avatarData.url
                }
            }
            const res = await fetch('/api/creator/mentor/update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mentorId,
                    name,
                    title,
                    systemPrompt,
                    greetingMessage,
                    sampleQuestions: sampleQuestions.split('\n').map(s => s.trim()).filter(Boolean),
                    isActive,
                    ...(avatarUrl !== undefined && { avatarUrl }),
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            setToast({ type: 'success', message: '✅ 저장 완료!' })
        } catch (err: unknown) {
            setToast({ type: 'error', message: err instanceof Error ? err.message : '저장 실패' })
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return <div style={styles.container}><div style={styles.emptyState}>불러오는 중...</div></div>
    }

    if (error && !name) {
        return (
            <div style={styles.container}>
                <div style={styles.emptyState}>
                    <div style={{ fontSize: 48 }}>❌</div>
                    <div>{error}</div>
                    <button style={styles.backBtn} onClick={() => router.back()}>← 돌아가기</button>
                </div>
            </div>
        )
    }

    // ── 미리보기 채팅 ──

    async function handlePreviewSend(msg?: string) {
        const text = msg || previewInput.trim()
        if (!text || previewLoading) return

        const newMessages = [...previewMessages, { role: 'user' as const, content: text }]
        setPreviewMessages(newMessages)
        setPreviewInput('')
        setPreviewLoading(true)

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: newMessages.map(m => ({ role: m.role, content: m.content })),
                    mentorId,
                }),
            })

            const reader = res.body?.getReader()
            if (!reader) return

            let fullText = ''
            setPreviewMessages(prev => [...prev, { role: 'assistant', content: '' }])

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = new TextDecoder().decode(value)
                const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line.slice(6))
                        if (data.text) {
                            fullText = data.fullResponse || (fullText + data.text)
                            setPreviewMessages(prev => {
                                const updated = [...prev]
                                updated[updated.length - 1] = { role: 'assistant', content: fullText }
                                return updated
                            })
                        }
                    } catch { /* skip */ }
                }
            }
        } catch {
            setPreviewMessages(prev => [...prev, { role: 'assistant', content: '미리보기 응답을 가져올 수 없습니다.' }])
        }
        setPreviewLoading(false)
        setTimeout(() => previewEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }

    const effectiveGreeting = greetingMessage.trim() || `안녕하세요! ${name || 'AI'}입니다 😊 무엇이 궁금하세요?`
    const sampleQArr = sampleQuestions.split('\n').map(s => s.trim()).filter(Boolean)

    return (
        <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>
            {/* ── 2컬럼 레이아웃 ── */}
            <div className="creator-layout" style={{
                display: 'flex',
                gap: 0,
                minHeight: '100dvh',
            }}>
                {/* ══════ 좌측: 설정 폼 ══════ */}
                <div className="creator-form-col" style={{
                    flex: '1 1 0',
                    maxWidth: 640,
                    padding: '24px 20px 120px',
                    overflowY: 'auto',
                    height: '100dvh',
                    boxSizing: 'border-box',
                }}>
                    {/* 헤더 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <button
                            style={styles.backBtn}
                            onClick={() => router.back()}
                        >←</button>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#18181b' }}>
                                {name} 설정
                            </h1>
                            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9ca3af' }}>
                                AI 동작에 반영되는 설정만 표시됩니다
                            </p>
                        </div>
                    </div>

                    {/* ── 기본 정보 ── */}
                    <div style={styles.card}>
                        <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', marginBottom: 20 }}>
                            <div
                                onClick={() => avatarInputRef.current?.click()}
                                style={{
                                    width: 80, height: 80, borderRadius: '50%',
                                    border: '3px dashed #d1d5db', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    overflow: 'hidden', background: '#f9fafb',
                                    transition: 'border-color 200ms',
                                }}
                                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#22c55e')}
                                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = '#d1d5db')}
                            >
                                {avatarPreview ? (
                                    <img src={avatarPreview} alt="프로필" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{ textAlign: 'center' as const, color: '#9ca3af' }}>
                                        <div style={{ fontSize: 24 }}>📷</div>
                                        <div style={{ fontSize: 10 }}>프로필</div>
                                    </div>
                                )}
                            </div>
                            <input
                                ref={avatarInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleAvatarChange}
                            />
                            <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                                클릭하여 프로필 사진 변경
                            </span>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>AI 이름</label>
                            <input
                                style={styles.input}
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="예: 맥주대왕"
                            />
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>한줄 소개</label>
                            <input
                                style={styles.input}
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="멘토 카드에 표시될 소개"
                            />
                        </div>
                    </div>

                    {/* ── 시스템 프롬프트 ── */}
                    <div style={styles.card}>
                        <div style={styles.field}>
                            <label style={{ ...styles.label, fontSize: 15 }}>🎭 시스템 프롬프트</label>
                            <p style={styles.hint}>AI의 성격, 말투, 전문성을 정의합니다</p>
                            <textarea
                                style={{ ...styles.textarea, fontFamily: 'monospace', fontSize: 13 }}
                                value={systemPrompt}
                                onChange={e => setSystemPrompt(e.target.value)}
                                rows={12}
                            />
                        </div>
                    </div>

                    {/* ── 인사말 / 예시 질문 ── */}
                    <div style={styles.card}>
                        <div style={styles.field}>
                            <label style={styles.label}>👋 인사 메시지</label>
                            <p style={styles.hint}>대화 시작 시 첫 번째로 보여줄 메시지</p>
                            <textarea
                                style={styles.textarea}
                                value={greetingMessage}
                                onChange={e => setGreetingMessage(e.target.value)}
                                rows={3}
                            />
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>💬 예시 질문</label>
                            <p style={styles.hint}>줄바꿈으로 구분 — 대화 시작 시 추천 질문으로 표시</p>
                            <textarea
                                style={styles.textarea}
                                value={sampleQuestions}
                                onChange={e => setSampleQuestions(e.target.value)}
                                placeholder={"질문 1\n질문 2\n질문 3"}
                                rows={4}
                            />
                        </div>
                    </div>

                    {/* ── 지식 파일 관리 ── */}
                    <div style={styles.card}>
                        <label style={{ ...styles.label, marginBottom: 4, fontSize: 15 }}>📚 등록된 지식 파일</label>
                        <p style={styles.hint}>이 AI가 참고하는 파일 목록입니다</p>

                        <div
                            style={{
                                border: `2px dashed ${dragOver ? '#22c55e' : '#d1d5db'}`,
                                borderRadius: 12, padding: '14px 12px',
                                display: 'flex', flexDirection: 'column' as const,
                                alignItems: 'center', gap: 4,
                                cursor: 'pointer', transition: 'all 0.2s',
                                background: dragOver ? '#f0fdf4' : '#fafafa',
                            }}
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={e => {
                                e.preventDefault()
                                setDragOver(false)
                                handleFileUpload(e.dataTransfer.files)
                            }}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.txt,.md,.doc,.docx,.hwp,.hwpx,.ppt,.pptx"
                                multiple
                                style={{ display: 'none' }}
                                onChange={e => handleFileUpload(e.target.files)}
                            />
                            <div style={{ fontSize: 22 }}>{uploading ? '⏳' : '➕'}</div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
                                {uploading ? '업로드 중...' : '파일 추가 (클릭 또는 드래그)'}
                            </div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>
                                HWP, PDF, PPT, DOCX, TXT · 최대 3개 · 합산 10MB
                            </div>
                        </div>

                        {knowledgeSources.length === 0 ? (
                            <div style={{ padding: 20, textAlign: 'center' as const, color: '#9ca3af', fontSize: 14, background: '#f9fafb', borderRadius: 12 }}>
                                등록된 지식 파일이 없습니다
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                                {knowledgeSources.map((src) => (
                                    <div key={src.id} style={{
                                        padding: '12px 16px', borderRadius: 12,
                                        background: src.processing_status === 'completed' ? '#f9fafb' :
                                                    src.processing_status === 'failed' ? '#fef2f2' : '#fffbeb',
                                        border: '1px solid #f0f0f0',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <span>{src.processing_status === 'processing' ? '⏳' : src.processing_status === 'completed' ? '✅' : '❌'}</span>
                                                <div>
                                                    <div style={{ fontSize: 14, fontWeight: 500, color: '#18181b' }}>{src.title}</div>
                                                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                                                        {src.processing_status === 'processing' ? '📄 파일 읽는 중...' :
                                                         src.processing_status === 'completed' ? '✅ AI가 학습 완료' :
                                                         src.processing_status === 'failed' ? '텍스트 추출에 실패했습니다' : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                                                background: src.processing_status === 'completed' ? '#dcfce7' :
                                                            src.processing_status === 'processing' ? '#fef3c7' : '#fee2e2',
                                                color: src.processing_status === 'completed' ? '#16a34a' :
                                                       src.processing_status === 'processing' ? '#d97706' : '#dc2626',
                                            }}>
                                                {src.processing_status === 'completed' ? '✅ 완료' :
                                                 src.processing_status === 'processing' ? '⏳ 읽는 중...' :
                                                 src.processing_status === 'pending' ? '⏳ 대기중' : '❌ 실패'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                            {src.processing_status === 'completed' && (src.content || src.chunk_count > 0) && (
                                                <button
                                                    onClick={async () => {
                                                        if (src.content) {
                                                            setPreviewSource({ title: src.title, content: src.content })
                                                        } else {
                                                            try {
                                                                const res = await fetch(`/api/creator/knowledge/list?mentorId=${mentorId}`)
                                                                const data = await res.json()
                                                                const found = data.sources?.find((s: any) => s.id === src.id)
                                                                if (found?.content) {
                                                                    setPreviewSource({ title: src.title, content: found.content })
                                                                    setKnowledgeSources(prev => prev.map(p => p.id === src.id ? { ...p, content: found.content } : p))
                                                                } else {
                                                                    setToast({ type: 'error', message: '파일 내용을 불러올 수 없습니다.' })
                                                                }
                                                            } catch {
                                                                setToast({ type: 'error', message: '파일 내용을 불러올 수 없습니다.' })
                                                            }
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '5px 12px', borderRadius: 8,
                                                        border: '1px solid #e5e7eb', background: '#fff',
                                                        color: '#16a34a', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                    }}
                                                >📄 내용 보기</button>
                                            )}
                                            {src.processing_status === 'failed' && (
                                                <button
                                                    onClick={() => handleReprocess(src.id)}
                                                    style={{
                                                        padding: '5px 12px', borderRadius: 8,
                                                        border: '1px solid #fca5a5', background: '#fff',
                                                        color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                    }}
                                                >🔄 재처리</button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteSource(src.id, src.title)}
                                                style={{
                                                    padding: '5px 12px', borderRadius: 8,
                                                    border: '1px solid #e5e7eb', background: '#fff',
                                                    color: '#9ca3af', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                }}
                                            >🗑️ 삭제</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── 활성화 토글 ── */}
                    <div style={styles.card}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>멘토 활성화</div>
                                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                                    비활성화하면 멘토 목록에서 보이지 않습니다
                                </div>
                            </div>
                            <div
                                onClick={() => setIsActive(!isActive)}
                                style={{
                                    width: 48, height: 26, borderRadius: 13,
                                    background: isActive ? '#22c55e' : '#d1d5db',
                                    cursor: 'pointer', transition: 'background 0.2s',
                                    display: 'flex', alignItems: 'center', padding: '0 3px',
                                    flexShrink: 0,
                                }}
                            >
                                <div style={{
                                    width: 20, height: 20, borderRadius: '50%',
                                    background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                    transition: 'transform 0.2s',
                                    transform: isActive ? 'translateX(22px)' : 'translateX(0)',
                                }} />
                            </div>
                        </div>
                    </div>

                    {/* ── 저장 버튼 ── */}
                    <div style={{ paddingBottom: 20 }}>
                        <button
                            style={{
                                ...styles.saveBtn,
                                opacity: saving ? 0.6 : 1,
                            }}
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? '저장 중...' : '💾 변경사항 저장'}
                        </button>
                    </div>
                </div>

                {/* ══════ 우측: 미리보기 채팅 ══════ */}
                <div className="creator-preview-col" style={{
                    flex: '1 1 0',
                    borderLeft: '1px solid #e5e7eb',
                    background: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100dvh',
                    position: 'sticky',
                    top: 0,
                }}>
                    {/* 미리보기 헤더 */}
                    <div style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid #f0f0f0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}>
                        <span style={{ fontSize: 16 }}>👁️</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>미리보기</span>
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>실시간으로 AI 대화를 테스트하세요</span>
                    </div>

                    {/* 채팅 영역 */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '20px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                    }}>
                        {/* AI 프로필 카드 */}
                        <div style={{
                            textAlign: 'center' as const,
                            padding: '24px 16px',
                            borderRadius: 16,
                            background: '#f0fdf4',
                            marginBottom: 8,
                        }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: '50%',
                                background: '#22c55e', color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 24, fontWeight: 700,
                                margin: '0 auto 8px',
                                overflow: 'hidden',
                            }}>
                                {avatarPreview ? (
                                    <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    name ? name[0] : '🤖'
                                )}
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#18181b' }}>
                                {name || 'AI 이름'}
                            </div>
                            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                                {title || '한줄 소개'}
                            </div>
                        </div>

                        {/* 인사말 */}
                        {previewMessages.length === 0 && (
                            <>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                        background: '#22c55e', color: '#fff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 14, fontWeight: 700, overflow: 'hidden',
                                    }}>
                                        {avatarPreview ? (
                                            <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (name ? name[0] : '🤖')}
                                    </div>
                                    <div style={{
                                        background: '#f3f4f6', borderRadius: '4px 16px 16px 16px',
                                        padding: '10px 14px', fontSize: 14, color: '#374151',
                                        maxWidth: '80%', lineHeight: 1.5,
                                    }}>
                                        {effectiveGreeting}
                                    </div>
                                </div>

                                {sampleQArr.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 40 }}>
                                        {sampleQArr.map((q, i) => (
                                            <button
                                                key={i}
                                                onClick={() => handlePreviewSend(q)}
                                                style={{
                                                    padding: '8px 14px', borderRadius: 20,
                                                    border: '1px solid #d1fae5', background: '#ecfdf5',
                                                    color: '#065f46', fontSize: 13, cursor: 'pointer',
                                                    transition: 'all 0.15s',
                                                }}
                                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#d1fae5' }}
                                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#ecfdf5' }}
                                            >{q}</button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {/* 대화 메시지 */}
                        {previewMessages.map((m, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                                gap: 8,
                            }}>
                                {m.role === 'assistant' && (
                                    <div style={{
                                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                        background: '#22c55e', color: '#fff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 14, fontWeight: 700, overflow: 'hidden',
                                    }}>
                                        {avatarPreview ? (
                                            <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (name ? name[0] : '🤖')}
                                    </div>
                                )}
                                <div style={{
                                    maxWidth: '75%',
                                    padding: '10px 14px',
                                    borderRadius: m.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                                    background: m.role === 'user' ? '#22c55e' : '#f3f4f6',
                                    color: m.role === 'user' ? '#fff' : '#374151',
                                    fontSize: 14,
                                    lineHeight: 1.5,
                                    whiteSpace: 'pre-wrap',
                                }}>
                                    {m.content || (previewLoading && i === previewMessages.length - 1 ? '...' : '')}
                                </div>
                            </div>
                        ))}
                        <div ref={previewEndRef} />
                    </div>

                    {/* 입력창 */}
                    <div style={{
                        padding: '12px 16px',
                        borderTop: '1px solid #f0f0f0',
                        display: 'flex',
                        gap: 8,
                    }}>
                        <input
                            style={{
                                flex: 1, padding: '10px 14px',
                                borderRadius: 24, border: '1px solid #e5e7eb',
                                background: '#fafafa', fontSize: 14, outline: 'none',
                            }}
                            placeholder="메시지를 입력하세요..."
                            value={previewInput}
                            onChange={e => setPreviewInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePreviewSend() } }}
                            disabled={previewLoading}
                        />
                        <button
                            onClick={() => handlePreviewSend()}
                            disabled={previewLoading || !previewInput.trim()}
                            style={{
                                width: 40, height: 40, borderRadius: '50%',
                                border: 'none', background: '#22c55e', color: '#fff',
                                fontSize: 18, cursor: 'pointer',
                                opacity: previewLoading || !previewInput.trim() ? 0.5 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'opacity 0.15s',
                            }}
                        >↑</button>
                    </div>
                </div>
            </div>

            {/* 토스트 */}
            {toast && (
                <div
                    style={{
                        position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
                        zIndex: 9999, padding: '14px 28px', borderRadius: 14,
                        fontSize: 15, fontWeight: 600,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        animation: 'slideDown 0.3s ease',
                        ...(toast.type === 'success'
                            ? { background: '#22c55e', color: '#fff' }
                            : { background: '#ef4444', color: '#fff' }),
                    }}
                    onClick={() => setToast(null)}
                >
                    {toast.message}
                </div>
            )}

            {/* 파일 내용 미리보기 모달 */}
            {previewSource && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 20, animation: 'fadeIn 0.2s ease',
                    }}
                    onClick={() => setPreviewSource(null)}
                >
                    <div
                        style={{
                            background: '#fff', borderRadius: 20,
                            maxWidth: 700, width: '100%',
                            maxHeight: '80dvh', overflow: 'hidden',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                            display: 'flex', flexDirection: 'column' as const,
                            animation: 'scaleIn 0.2s ease',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '16px 20px', borderBottom: '1px solid #f0f0f0',
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#18181b' }}>
                                    📄 파일에서 읽어온 내용
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9ca3af' }}>
                                    {previewSource.title}
                                </p>
                            </div>
                            <button
                                onClick={() => setPreviewSource(null)}
                                style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    border: 'none', background: '#f3f4f6',
                                    fontSize: 16, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >✕</button>
                        </div>
                        <div style={{ padding: '16px 20px', overflowY: 'auto' as const, flex: 1 }}>
                            <div style={{ background: '#f9fafb', borderRadius: 12, padding: 16, border: '1px solid #f0f0f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const }}>
                                    <span style={{
                                        fontSize: 11, fontWeight: 600, color: '#6b7280',
                                        background: '#e5e7eb', padding: '2px 8px', borderRadius: 6,
                                    }}>
                                        📄 전체 글자수: {previewSource.content.length.toLocaleString()}자
                                    </span>
                                    {previewSource.content.length > 5000 && (
                                        <span style={{ fontSize: 11, color: '#d97706', fontWeight: 500 }}>
                                            앞부분 5,000자만 보여드려요 (AI는 전체를 참고해요)
                                        </span>
                                    )}
                                    {previewSource.content.length <= 5000 && (
                                        <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 500 }}>
                                            ✅ 전체 내용 표시
                                        </span>
                                    )}
                                </div>
                                <pre style={{
                                    margin: 0, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
                                    fontFamily: 'var(--font-noto-sans-kr), Pretendard, monospace',
                                    fontSize: 13, lineHeight: 1.7, color: '#374151',
                                }}>
                                    {previewSource.content.length > 5000
                                        ? previewSource.content.slice(0, 5000) + '\n\n--- ✂️ 여기까지만 보여드려요 (전체 ' + previewSource.content.length.toLocaleString() + '자) ---'
                                        : previewSource.content}
                                </pre>
                            </div>
                        </div>
                        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setPreviewSource(null)}
                                style={{
                                    padding: '8px 20px', borderRadius: 10,
                                    border: 'none', background: '#22c55e', color: '#fff',
                                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                }}
                            >닫기</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 반응형 CSS */}
            <style>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                @media (max-width: 1023px) {
                    .creator-preview-col {
                        display: none !important;
                    }
                    .creator-form-col {
                        max-width: 100% !important;
                        height: auto !important;
                    }
                }
            `}</style>
        </div>
    )
}


const styles: Record<string, React.CSSProperties> = {
    card: {
        background: '#fff',
        borderRadius: 16,
        padding: '18px 16px',
        border: '1px solid #f0f0f0',
        marginBottom: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    field: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    label: {
        fontSize: 14,
        fontWeight: 600,
        color: '#374151',
    },
    hint: {
        fontSize: 12,
        color: '#9ca3af',
        margin: '0 0 4px',
    },
    input: {
        width: '100%',
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid #e5e7eb',
        background: '#fafafa',
        color: '#18181b',
        fontSize: 15,
        outline: 'none',
        boxSizing: 'border-box',
    },
    textarea: {
        width: '100%',
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid #e5e7eb',
        background: '#fafafa',
        color: '#18181b',
        fontSize: 15,
        outline: 'none',
        resize: 'vertical',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
    },
    backBtn: {
        padding: '8px 14px',
        borderRadius: 10,
        border: '1px solid #e5e7eb',
        background: '#fff',
        color: '#6b7280',
        fontSize: 16,
        cursor: 'pointer',
    },
    saveBtn: {
        width: '100%',
        padding: '16px 24px',
        borderRadius: 14,
        border: 'none',
        background: '#22c55e',
        color: '#fff',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'opacity 0.2s',
        boxShadow: '0 2px 12px rgba(34,197,94,0.3)',
    },
    emptyState: {
        textAlign: 'center',
        padding: '80px 20px',
        color: '#6b7280',
        fontSize: 15,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
    },
}

