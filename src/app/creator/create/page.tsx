'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import AppSidebar from '@/components/AppSidebar'
import { PERSONA_TEMPLATES } from '@/domains/creator/types'
import type { PersonaTemplate } from '@/domains/creator/types'

interface UploadedFile {
    id: string
    fileName: string
    fileSize: number
    status: 'uploading' | 'processing' | 'completed' | 'failed'
}

export default function CreatorCreatePage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [toast, setToast] = useState<string | null>(null)

    // 기본 정보
    const [name, setName] = useState('')
    const [title, setTitle] = useState('')
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

    // AI 성격
    const [template, setTemplate] = useState<PersonaTemplate | null>(null)
    const [customPrompt, setCustomPrompt] = useState('')

    // 인사말 / 예시 질문
    const [greetingMessage, setGreetingMessage] = useState('')
    const [sampleQuestions, setSampleQuestions] = useState('')

    // 지식 (선택)
    const [knowledgeText, setKnowledgeText] = useState('')
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const avatarInputRef = useRef<HTMLInputElement>(null)
    const [dragOver, setDragOver] = useState(false)
    const [mentorIdForUpload, setMentorIdForUpload] = useState<string | null>(null)

    function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) {
            setError('이미지 파일만 업로드 가능합니다.')
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            setError('이미지 크기는 5MB 이하여야 합니다.')
            return
        }
        setAvatarFile(file)
        setAvatarPreview(URL.createObjectURL(file))
    }

    async function handleCreate() {
        // 유효성 검사
        if (!name.trim()) {
            setError('AI 이름을 입력해주세요.')
            return
        }
        if (!title.trim()) {
            setError('한줄 소개를 입력해주세요.')
            return
        }
        if (!template) {
            setError('AI 성격을 선택해주세요.')
            return
        }
        // 파일 처리 중이면 경고
        const processingFiles = uploadedFiles.filter(f => f.status === 'uploading' || f.status === 'processing')
        if (processingFiles.length > 0) {
            setError(`파일 ${processingFiles.length}개가 처리 중입니다. 잠시 후 다시 시도해주세요.`)
            return
        }

        setLoading(true)
        setError(null)

        try {
            // 프로필 이미지 업로드 (있는 경우)
            let avatarUrl = ''
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

            // Step 1: 기본 정보 생성 (이미 draft가 있으면 스킵)
            let mentorId = mentorIdForUpload
            if (!mentorId) {
                const res1 = await fetch('/api/creator/mentor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        step: 1,
                        name: name.trim(),
                        title: title.trim(),
                        description: '',
                        expertise: [],
                        avatarUrl,
                    }),
                })
                const data1 = await res1.json()
                if (!res1.ok) throw new Error(data1.error)
                mentorId = data1.mentor.id
            } else {
                // draft 멘토가 있으면 이름/소개/아바타만 업데이트
                await fetch('/api/creator/mentor/update', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mentorId,
                        name: name.trim(),
                        title: title.trim(),
                        ...(avatarUrl && { avatarUrl }),
                    }),
                })
            }

            // Step 2: 페르소나 설정
            const selectedTemplate = PERSONA_TEMPLATES.find(t => t.id === template)
            const basePrompt = selectedTemplate?.defaultPromptStyle || ''
            const customPart = customPrompt.trim()
            const fullPrompt = customPart
                ? `${basePrompt}\n\n## 크리에이터 추가 지시사항\n${customPart}`
                : basePrompt

            const res2 = await fetch('/api/creator/mentor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    step: 2,
                    mentorId,
                    mentorName: name,
                    template,
                    systemPrompt: fullPrompt,
                    greetingMessage: greetingMessage.trim() ||
                        `안녕하세요! ${name}입니다 😊 무엇이 궁금하세요?`,
                    sampleQuestions: sampleQuestions
                        .split('\n')
                        .map(s => s.trim())
                        .filter(Boolean),
                }),
            })
            const data2 = await res2.json()
            if (!res2.ok) throw new Error(data2.error)

            // Step 3: 지식 (있으면)
            if (knowledgeText.trim()) {
                await fetch('/api/creator/mentor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        step: 3,
                        mentorId,
                        knowledgeText: knowledgeText.trim(),
                    }),
                })
            }

            // Publish
            const pubRes = await fetch('/api/creator/mentor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step: 'publish', mentorId }),
            })
            const pubData = await pubRes.json()
            if (!pubRes.ok) throw new Error(pubData.error)

            // 성공 → 멘토 목록으로
            router.push('/mentors')
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
        } finally {
            setLoading(false)
        }
    }

    // 파일 업로드 (mentorId 필요 → 먼저 draft 생성)
    async function handleFileUpload(files: FileList | null) {
        if (!files || files.length === 0) return

        // 최대 파일 수 검증 (3개)
        const newFilesArr = Array.from(files)
        if (uploadedFiles.length + newFilesArr.length > 3) {
            setError('파일은 최대 3개까지 등록할 수 있습니다.')
            return
        }

        // 합산 용량 검증 (10MB)
        const existingSize = uploadedFiles.reduce((sum, f) => sum + f.fileSize, 0)
        const newSize = newFilesArr.reduce((sum, f) => sum + f.size, 0)
        if (existingSize + newSize > 10 * 1024 * 1024) {
            setError('모든 파일 합산 10MB를 초과할 수 없습니다.')
            return
        }

        setUploading(true)
        setError(null)

        try {
            // mentorId가 아직 없으면 draft 먼저 생성
            let mid = mentorIdForUpload
            if (!mid) {
                if (!name.trim() || !title.trim()) {
                    setError('파일 업로드 전에 AI 이름과 한줄 소개를 입력해주세요.')
                    setUploading(false)
                    return
                }
                const res = await fetch('/api/creator/mentor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        step: 1,
                        name: name.trim(),
                        title: title.trim(),
                        description: '',
                        expertise: [],
                    }),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error)
                mid = data.mentor.id
                setMentorIdForUpload(mid)
            }

            const allowedTypes = [
                'application/pdf', 'text/plain', 'text/markdown',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            ]
            // HWP/HWPX는 MIME 타입이 없으므로 확장자로 체크
            const allowedExtensions = ['pdf', 'txt', 'md', 'doc', 'docx', 'hwp', 'hwpx', 'ppt', 'pptx']

            for (const file of newFilesArr) {
                const ext = file.name.split('.').pop()?.toLowerCase() || ''
                if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(ext)) {
                    setError(`지원하지 않는 형식: ${file.name}`)
                    continue
                }

                const formData = new FormData()
                formData.append('file', file)
                formData.append('mentorId', mid!)

                const res = await fetch('/api/creator/knowledge/upload', {
                    method: 'POST',
                    body: formData,
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error)

                const sourceId = data.source.id
                setUploadedFiles(prev => [...prev, {
                    id: sourceId,
                    fileName: data.source.fileName,
                    fileSize: data.source.fileSize,
                    status: 'processing' as const,
                }])

                // 파일 텍스트 추출 + 임베딩 트리거 (모든 파일)
                fetch('/api/creator/knowledge/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sourceId,
                        mentorId: mid,
                    }),
                }).then(async (r) => {
                    const result = await r.json()
                    if (r.ok) {
                        setUploadedFiles(prev => prev.map(f => f.id === sourceId ? { ...f, status: 'completed' as const } : f))
                        setToast(`✅ ${file.name} — AI 학습 완료!`)
                    } else {
                        setUploadedFiles(prev => prev.map(f => f.id === sourceId ? { ...f, status: 'failed' as const } : f))
                        setToast(`⚠️ ${file.name} 처리 실패: ${result.error}`)
                    }
                    setTimeout(() => setToast(null), 4000)
                }).catch(() => {
                    setUploadedFiles(prev => prev.map(f => f.id === sourceId ? { ...f, status: 'failed' as const } : f))
                })
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '업로드 실패')
        }
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    function formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes}B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
    }

    // ── 미리보기 채팅 ──
    const [previewMessages, setPreviewMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
    const [previewInput, setPreviewInput] = useState('')
    const [previewLoading, setPreviewLoading] = useState(false)
    const previewEndRef = useRef<HTMLDivElement>(null)

    async function handlePreviewSend(msg?: string) {
        const text = msg || previewInput.trim()
        if (!text || previewLoading) return
        if (!mentorIdForUpload) {
            setError('미리보기를 사용하려면 먼저 AI 이름과 소개를 입력 후 파일을 첨부하거나 지식을 입력해주세요.')
            return
        }

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
                    mentorId: mentorIdForUpload,
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
            <AppSidebar />

            <div className="sidebar-content" style={{ marginLeft: 240, minHeight: '100dvh' }}>
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
                        <div style={{ marginBottom: 20 }}>
                            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#18181b' }}>
                                🤖 나만의 AI 만들기
                            </h1>
                            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#9ca3af' }}>
                                AI에 반영되는 설정만 표시됩니다
                            </p>
                        </div>

                        {/* 에러 */}
                        {error && (
                            <div style={styles.errorBox}>
                                {error}
                                <button
                                    onClick={() => setError(null)}
                                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', marginLeft: 8, fontWeight: 600 }}
                                >✕</button>
                            </div>
                        )}

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
                                    클릭하여 프로필 사진 업로드 (선택)
                                </span>
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>AI 이름 *</label>
                                <input
                                    style={styles.input}
                                    placeholder="예: 커피마스터, 영어코치"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    maxLength={20}
                                />
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>한줄 소개 *</label>
                                <input
                                    style={styles.input}
                                    placeholder="예: 바리스타 경력 10년, 커피 로스팅 전문가"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    maxLength={50}
                                />
                            </div>
                        </div>

                        {/* ── AI 성격 선택 ── */}
                        <div style={styles.card}>
                            <label style={{ ...styles.label, marginBottom: 8, fontSize: 15 }}>🎭 AI 성격 선택 *</label>
                            <div className="template-grid" style={styles.templateGrid}>
                                {PERSONA_TEMPLATES.map(t => (
                                    <button
                                        key={t.id}
                                        style={{
                                            ...styles.templateCard,
                                            ...(template === t.id ? styles.templateCardSelected : {}),
                                        }}
                                        onClick={() => setTemplate(t.id)}
                                    >
                                        <span style={{ fontSize: 24 }}>{t.emoji}</span>
                                        <strong style={{ fontSize: 13 }}>{t.label}</strong>
                                        <span style={{ fontSize: 11, color: '#9ca3af', lineHeight: '1.3' }}>
                                            {t.description}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            <div style={{ ...styles.field, marginTop: 8 }}>
                                <label style={styles.label}>추가 지시사항 (선택)</label>
                                <p style={styles.hint}>원하는 대화 스타일을 자유롭게 적어주세요</p>
                                <textarea
                                    style={styles.textarea}
                                    placeholder={"예:\n- 반드시 실전 사례를 들어서 설명해줘\n- 질문을 2개 이상 연속으로 하지 마\n- 대화 끝에 항상 액션 아이템을 줘"}
                                    value={customPrompt}
                                    onChange={e => setCustomPrompt(e.target.value)}
                                    rows={4}
                                />
                            </div>
                        </div>

                        {/* ── 인사말 / 예시 질문 ── */}
                        <div style={styles.card}>
                            <div style={styles.field}>
                                <label style={styles.label}>👋 인사말 (선택)</label>
                                <input
                                    style={styles.input}
                                    placeholder={`안녕하세요! ${name || 'AI'}입니다 😊`}
                                    value={greetingMessage}
                                    onChange={e => setGreetingMessage(e.target.value)}
                                />
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>💬 예시 질문 (선택)</label>
                                <p style={styles.hint}>줄바꿈으로 구분 — 대화 시작 시 추천 질문으로 표시</p>
                                <textarea
                                    style={styles.textarea}
                                    placeholder={"질문 1\n질문 2\n질문 3"}
                                    value={sampleQuestions}
                                    onChange={e => setSampleQuestions(e.target.value)}
                                    rows={3}
                                />
                            </div>
                        </div>

                        {/* ── 지식 추가 ── */}
                        <div style={styles.card}>
                            <label style={{ ...styles.label, marginBottom: 4, fontSize: 15 }}>📚 지식 추가 (선택)</label>
                            <p style={styles.hint}>AI가 참고할 정보를 입력하거나 파일을 첨부하세요</p>

                            <div
                                style={{
                                    ...styles.dropZone,
                                    ...(dragOver ? styles.dropZoneActive : {}),
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
                                <div style={{ fontSize: 28 }}>{uploading ? '⏳' : '📄'}</div>
                                <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                                    {uploading ? '업로드 중...' : '클릭하거나 드래그'}
                                </div>
                                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                                    HWP, PDF, PPT, DOCX, TXT · 최대 3개 · 합산 10MB
                                </div>
                            </div>

                            {uploadedFiles.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                    {uploadedFiles.map(f => (
                                        <div key={f.id} style={{
                                            ...styles.fileItem,
                                            background: f.status === 'completed' ? '#f0fdf4' :
                                                        f.status === 'failed' ? '#fef2f2' : '#fffbeb',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span>{f.status === 'processing' ? '⏳' : f.status === 'completed' ? '✅' : f.status === 'failed' ? '❌' : '📄'}</span>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 500 }}>{f.fileName}</div>
                                                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{formatFileSize(f.fileSize)}</div>
                                                </div>
                                            </div>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
                                                background: f.status === 'completed' ? '#dcfce7' :
                                                            f.status === 'failed' ? '#fee2e2' : '#fef3c7',
                                                color: f.status === 'completed' ? '#16a34a' :
                                                       f.status === 'failed' ? '#dc2626' : '#d97706',
                                            }}>
                                                {f.status === 'processing' ? '📄 파일 읽는 중...' :
                                                 f.status === 'completed' ? '✅ 완료' :
                                                 f.status === 'failed' ? '❌ 실패' : '업로드 중...'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <textarea
                                style={{ ...styles.textarea, marginTop: 8 }}
                                placeholder="직접 입력: AI가 알아야 할 전문 지식, 경험, 노하우"
                                value={knowledgeText}
                                onChange={e => setKnowledgeText(e.target.value)}
                                rows={4}
                            />
                        </div>

                        {/* ── 하단 버튼 ── */}
                        <div style={{ paddingBottom: 20 }}>
                            {uploadedFiles.some(f => f.status === 'processing' || f.status === 'uploading') && (
                                <div style={{
                                    fontSize: 12, color: '#d97706', textAlign: 'center' as const,
                                    marginBottom: 6, fontWeight: 500,
                                }}>
                                    ⏳ 파일 처리 중... 완료되면 공개할 수 있어요
                                </div>
                            )}
                            <button
                                style={{
                                    ...styles.createBtn,
                                    opacity: (loading || uploadedFiles.some(f => f.status === 'processing' || f.status === 'uploading')) ? 0.5 : 1,
                                }}
                                onClick={handleCreate}
                                disabled={loading || uploadedFiles.some(f => f.status === 'processing' || f.status === 'uploading')}
                            >
                                {loading ? '생성 중...' :
                                 uploadedFiles.some(f => f.status === 'processing') ? '⏳ 파일 처리 중...' :
                                 '🚀 AI 공개하기'}
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
                                    <div style={{
                                        display: 'flex', gap: 8, alignItems: 'flex-start',
                                    }}>
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

                                    {/* 예시 질문 버튼 */}
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
                                                    onMouseEnter={e => {
                                                        (e.currentTarget as HTMLElement).style.background = '#d1fae5'
                                                    }}
                                                    onMouseLeave={e => {
                                                        (e.currentTarget as HTMLElement).style.background = '#ecfdf5'
                                                    }}
                                                >
                                                    {q}
                                                </button>
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

                        {/* 미리보기 없을 때 안내 */}
                        {!mentorIdForUpload && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexDirection: 'column', gap: 8, zIndex: 10,
                            }}>
                                <div style={{ fontSize: 40 }}>💬</div>
                                <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>미리보기</div>
                                <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center' as const, maxWidth: 200 }}>
                                    AI 이름을 입력하고 지식을 추가하면<br />여기서 바로 대화해볼 수 있어요
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 토스트 */}
                {toast && (
                    <div
                        style={{
                            position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
                            background: '#18181b', color: '#fff', padding: '10px 20px',
                            borderRadius: 10, fontSize: 14, zIndex: 9999,
                            animation: 'slideDown 0.3s ease',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        }}
                        onClick={() => setToast(null)}
                    >
                        {toast}
                    </div>
                )}

                {/* 반응형 CSS */}
                <style>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @media (min-width: 640px) {
                    .template-grid {
                        grid-template-columns: repeat(3, 1fr) !important;
                    }
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
                @media (max-width: 768px) {
                    .sidebar-content {
                        margin-left: 0 !important;
                    }
                }
            `}</style>
            </div>
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
    errorBox: {
        background: '#fef2f2',
        border: '1px solid #fca5a5',
        color: '#dc2626',
        padding: '10px 14px',
        borderRadius: 10,
        fontSize: 14,
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    templateGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
    },
    templateCard: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '14px 8px',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        background: '#fafafa',
        cursor: 'pointer',
        transition: 'all 0.2s',
        color: '#4b5563',
        textAlign: 'center',
    },
    templateCardSelected: {
        border: '2px solid #22c55e',
        background: '#f0fdf4',
        color: '#14532d',
    },
    dropZone: {
        border: '2px dashed #d1d5db',
        borderRadius: 12,
        padding: '20px 12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
        transition: 'all 0.2s',
        background: '#fafafa',
    },
    dropZoneActive: {
        border: '2px dashed #22c55e',
        background: '#f0fdf4',
    },
    fileItem: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderRadius: 8,
        background: '#f0fdf4',
        fontSize: 13,
    },
    createBtn: {
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
}

