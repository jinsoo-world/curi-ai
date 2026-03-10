'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import AppSidebar from '@/components/AppSidebar'
import { createClient } from '@/lib/supabase/client'
// PERSONA_TEMPLATES import removed — agent prompt now directly entered

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

    // AI 성격 → 에이전트 프롬프트
    const [systemPrompt, setSystemPrompt] = useState('')

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

    // 미리보기 디바이스 모드
    const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')

    // 크리에이터 탭 (AI 설정 / 파일 학습)
    const [creatorTab, setCreatorTab] = useState<'settings' | 'files'>('settings')

    // 로그인 상태 체크
    const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)

    useEffect(() => {
        const supabase = createClient()
        supabase.auth.getUser().then(({ data: { user } }) => {
            setIsLoggedIn(!!user)
        })
    }, [])

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
            const fullPrompt = systemPrompt.trim()

            const res2 = await fetch('/api/creator/mentor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    step: 2,
                    mentorId,
                    mentorName: name,
                    template: null,
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
                        padding: '16px 20px 80px',
                        overflowY: 'auto',
                        height: '100dvh',
                        boxSizing: 'border-box',
                    }}>
                        {/* 헤더 */}
                        <div style={{ marginBottom: 0 }}>
                            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#18181b' }}>
                                🤖 나만의 AI 만들기
                            </h1>
                            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9ca3af' }}>
                                AI에 반영되는 설정만 표시됩니다
                            </p>
                        </div>

                        {/* 로그인 필요 — 전면 유도 화면 */}
                        {isLoggedIn === false && (
                            <div style={{
                                position: 'fixed', inset: 0, zIndex: 100,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(255,255,255,0.92)',
                                backdropFilter: 'blur(8px)',
                                padding: 24,
                            }}>
                                <div style={{
                                    textAlign: 'center', maxWidth: 400,
                                    background: '#fff',
                                    borderRadius: 24,
                                    padding: '48px 32px 40px',
                                    boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
                                    animation: 'fadeIn 0.4s ease',
                                }}>
                                    <div style={{ fontSize: 56, marginBottom: 16 }}>🔐</div>
                                    <h2 style={{
                                        fontSize: 22, fontWeight: 800, color: '#18181b',
                                        marginBottom: 8, letterSpacing: '-0.02em',
                                    }}>
                                        로그인이 필요합니다
                                    </h2>
                                    <p style={{
                                        fontSize: 15, color: '#6b7280', lineHeight: 1.6,
                                        marginBottom: 28,
                                    }}>
                                        AI를 만들려면 먼저 로그인해주세요.<br />
                                        구글 계정으로 바로 시작할 수 있습니다.
                                    </p>
                                    <Link
                                        href="/login"
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 10,
                                            padding: '14px 36px',
                                            borderRadius: 14,
                                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                            color: '#fff', textDecoration: 'none',
                                            fontWeight: 700, fontSize: 16,
                                            boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                                            transition: 'transform 150ms',
                                        }}
                                    >
                                        🚀 로그인하기
                                    </Link>
                                    <div style={{ marginTop: 16 }}>
                                        <Link
                                            href="/mentors"
                                            style={{
                                                fontSize: 14, color: '#9ca3af',
                                                textDecoration: 'none',
                                            }}
                                        >
                                            ← AI 둘러보기
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ═══ GNB 탭 ═══ */}
                        <div style={{
                            display: 'flex', gap: 0,
                            borderBottom: '2px solid #f0f0f0',
                            marginBottom: 16, marginTop: 12,
                        }}>
                            {[
                                { key: 'settings' as const, label: '🎯 AI 설정' },
                                { key: 'files' as const, label: '📁 파일 학습' },
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setCreatorTab(tab.key)}
                                    style={{
                                        flex: 1,
                                        padding: '10px 0',
                                        fontSize: 14,
                                        fontWeight: creatorTab === tab.key ? 700 : 500,
                                        color: creatorTab === tab.key ? '#18181b' : '#9ca3af',
                                        background: 'none',
                                        border: 'none',
                                        borderBottom: creatorTab === tab.key ? '2px solid #22c55e' : '2px solid transparent',
                                        cursor: 'pointer',
                                        transition: 'all 150ms',
                                        marginBottom: -2,
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
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

                        {creatorTab === 'settings' && (<>
                        {/* ── 기본 정보 ── */}
                        <div style={styles.card}>
                            <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', marginBottom: 12 }}>
                                <div
                                    onClick={() => avatarInputRef.current?.click()}
                                    style={{
                                        width: 64, height: 64, borderRadius: '50%',
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

                        {/* ── 에이전트 프롬프트 ── */}
                        <div style={styles.card}>
                            <div style={styles.field}>
                                <label style={{ ...styles.label, fontSize: 15 }}>🎭 에이전트 프롬프트</label>
                                <p style={styles.hint}>AI의 성격, 말투, 전문성을 정의합니다</p>
                                <textarea
                                    style={{ ...styles.textarea, fontFamily: 'monospace', fontSize: 13 }}
                                    value={systemPrompt}
                                    onChange={e => setSystemPrompt(e.target.value)}
                                    maxLength={1000}
                                    placeholder="예: 당신은 마케팅 전문가입니다. 데이터 기반 분석과 실전 사례를 통해 조언합니다."
                                    rows={8}
                                />
                                <div style={{ textAlign: 'right' as const, fontSize: 11, color: systemPrompt.length > 900 ? '#f59e0b' : '#b0b8c1', marginTop: 4 }}>
                                    {systemPrompt.length}/1,000
                                </div>
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
                                    maxLength={200}
                                />
                                <div style={{ textAlign: 'right' as const, fontSize: 11, color: greetingMessage.length > 180 ? '#f59e0b' : '#b0b8c1', marginTop: 4 }}>
                                    {greetingMessage.length}/200
                                </div>
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>💬 예시 질문 (선택)</label>
                                <p style={styles.hint}>줄바꿈으로 구분 — 대화 시작 시 추천 질문으로 표시</p>
                                <textarea
                                    style={styles.textarea}
                                    placeholder={"질문 1\n질문 2\n질문 3"}
                                    value={sampleQuestions}
                                    onChange={e => setSampleQuestions(e.target.value)}
                                    maxLength={300}
                                    rows={3}
                                />
                                <div style={{ textAlign: 'right' as const, fontSize: 11, color: sampleQuestions.length > 270 ? '#f59e0b' : '#b0b8c1', marginTop: 4 }}>
                                    {sampleQuestions.length}/300
                                </div>
                            </div>
                        </div>
                        </>)}

                        {creatorTab === 'files' && (<>
                        {/* ── 지식 추가 ── */}
                        <div style={styles.card}>
                            <label style={{ ...styles.label, marginBottom: 4, fontSize: 15 }}>📚 지식 파일 추가</label>
                            <p style={styles.hint}>AI가 참고할 문서를 업로드하거나 직접 입력하세요</p>

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
                                <div style={{ fontSize: 28, marginBottom: 4 }}>{uploading ? '⏳' : '📄'}</div>
                                <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                                    {uploading ? '업로드 중...' : '클릭하거나 드래그'}
                                </div>
                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
                                    gap: 6, marginTop: 10,
                                }}>
                                    {[
                                        { ext: 'HWP', color: '#2563eb', bg: '#dbeafe' },
                                        { ext: 'PDF', color: '#dc2626', bg: '#fee2e2' },
                                        { ext: 'PPT', color: '#ea580c', bg: '#ffedd5' },
                                        { ext: 'DOCX', color: '#2563eb', bg: '#dbeafe' },
                                        { ext: 'TXT', color: '#6b7280', bg: '#f3f4f6' },
                                    ].map(f => (
                                        <span key={f.ext} style={{
                                            fontSize: 10, fontWeight: 700,
                                            color: f.color, background: f.bg,
                                            padding: '3px 8px', borderRadius: 6,
                                            letterSpacing: '0.02em',
                                        }}>
                                            .{f.ext}
                                        </span>
                                    ))}
                                </div>
                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                                    최대 3개 · 합산 10MB
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
                        </>)}


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
                        background: previewDevice !== 'desktop' ? '#f0f0f0' : '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100dvh',
                        position: 'sticky',
                        top: 0,
                        transition: 'background 0.2s',
                    }}>
                        {/* 미리보기 헤더: 디바이스 전환 버튼 */}
                        <div style={{
                            padding: '10px 20px',
                            borderBottom: '1px solid #e5e7eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#fff',
                        }}>
                            <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 8, padding: 3 }}>
                                {(['desktop', 'tablet', 'mobile'] as const).map(device => (
                                    <button
                                        key={device}
                                        onClick={() => setPreviewDevice(device)}
                                        title={device === 'desktop' ? 'PC' : device === 'tablet' ? '태블릿' : '모바일'}
                                        style={{
                                            padding: '6px 10px', borderRadius: 6, border: 'none',
                                            background: previewDevice === device ? '#fff' : 'transparent',
                                            boxShadow: previewDevice === device ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'all 0.15s',
                                            color: previewDevice === device ? '#18181b' : '#9ca3af',
                                            fontSize: 16,
                                        }}
                                    >
                                        {device === 'desktop' ? '🖥️' : device === 'tablet' ? '📱' : '📲'}
                                    </button>
                                ))}
                            </div>
                            <span style={{ fontSize: 12, color: '#9ca3af' }}>미리보기</span>
                        </div>

                        {/* 디바이스 프레임 외부 래퍼 */}
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            padding: previewDevice !== 'desktop' ? '20px 16px' : 0,
                        }}>
                            {/* 디바이스 프레임 */}
                            <div style={{
                                width: previewDevice === 'mobile' ? 375 : previewDevice === 'tablet' ? 768 : '100%',
                                maxWidth: '100%',
                                background: '#fff',
                                borderRadius: previewDevice !== 'desktop' ? 16 : 0,
                                boxShadow: previewDevice !== 'desktop' ? '0 4px 24px rgba(0,0,0,0.12)' : 'none',
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                transition: 'width 0.3s ease, border-radius 0.3s ease',
                                height: '100%',
                            }}>
                                {/* 채팅 스크롤 영역 */}
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
                                        padding: '16px 12px',
                                        borderRadius: 16,
                                        background: '#f9fafb',
                                        marginBottom: 8,
                                    }}>
                                        <div style={{
                                            width: 48, height: 48, borderRadius: '50%',
                                            background: avatarPreview ? '#f3f4f6' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 24, fontWeight: 700,
                                            margin: '0 auto 8px',
                                            overflow: 'hidden',
                                            border: avatarPreview ? '1px solid #e5e7eb' : 'none',
                                        }}>
                                            {avatarPreview ? (
                                                <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <img
                                                    src="/logo.png"
                                                    alt="큐리"
                                                    style={{ width: 48, height: 48, objectFit: 'contain', opacity: 0.3 }}
                                                />
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
                                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                                    background: avatarPreview ? '#f3f4f6' : 'transparent',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    overflow: 'hidden',
                                                    border: avatarPreview ? '1px solid #e5e7eb' : 'none',
                                                    marginTop: 2,
                                                }}>
                                                    {avatarPreview ? (
                                                        <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <img
                                                            src="/logo.png"
                                                            alt="큐리"
                                                            style={{ width: 36, height: 36, objectFit: 'contain', opacity: 0.3 }}
                                                        />
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '80%' }}>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{name || 'AI'}</div>
                                                    <div style={{
                                                        padding: '4px 0', fontSize: 14, color: '#1e293b',
                                                        lineHeight: 1.7,
                                                    }}>
                                                        {effectiveGreeting}
                                                    </div>
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
                                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#d1fae5' }}
                                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#ecfdf5' }}
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
                                            flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                                            alignItems: 'flex-start',
                                            gap: 10,
                                        }}>
                                            {m.role === 'assistant' && (
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 14, fontWeight: 700, overflow: 'hidden',
                                                    marginTop: 2,
                                                }}>
                                                    {avatarPreview ? (
                                                        <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (name ? name[0] : '🤖')}
                                                </div>
                                            )}
                                            <div style={{
                                                display: 'flex', flexDirection: 'column',
                                                maxWidth: m.role === 'user' ? '75%' : '80%',
                                            }}>
                                                {m.role === 'assistant' && (
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{name || 'AI'}</div>
                                                )}
                                                <div style={{
                                                    ...(m.role === 'user' ? {
                                                        padding: '12px 18px',
                                                        borderRadius: '20px 20px 6px 20px',
                                                        background: '#22c55e',
                                                        color: '#fff',
                                                        fontSize: 14,
                                                        lineHeight: 1.7,
                                                    } : {
                                                        padding: '4px 0',
                                                        color: '#1e293b',
                                                        fontSize: 14,
                                                        lineHeight: 1.7,
                                                    }),
                                                }}>
                                                {!m.content && previewLoading && i === previewMessages.length - 1 ? (
                                                    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', padding: '4px 0' }}>
                                                        {[0, 1, 2].map(d => (
                                                            <span key={d} style={{
                                                                width: 7, height: 7, borderRadius: '50%',
                                                                background: '#94a3b8',
                                                                animation: `previewDot 1.4s ease-in-out ${d * 0.2}s infinite`,
                                                            }} />
                                                        ))}
                                                    </span>
                                                ) : m.role === 'user' ? (
                                                    <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
                                                ) : (
                                                    <div className="preview-markdown">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                                            p: ({ children }) => <p style={{ margin: '0 0 8px 0', lineHeight: 1.7 }}>{children}</p>,
                                                            strong: ({ children }) => <strong style={{ fontWeight: 700, color: '#1e293b' }}>{children}</strong>,
                                                            ul: ({ children }) => <ul style={{ margin: '4px 0 8px 0', paddingLeft: 18 }}>{children}</ul>,
                                                            ol: ({ children }) => <ol style={{ margin: '4px 0 8px 0', paddingLeft: 18 }}>{children}</ol>,
                                                            li: ({ children }) => <li style={{ marginBottom: 4, lineHeight: 1.6 }}>{children}</li>,
                                                            code: ({ children, className }) => {
                                                                const isInline = !className
                                                                return isInline ? (
                                                                    <code style={{ background: '#e5e7eb', padding: '1px 5px', borderRadius: 4, fontSize: '0.88em' }}>{children}</code>
                                                                ) : (
                                                                    <code style={{ display: 'block', background: '#f8fafc', border: '1px solid #e2e8f0', padding: 10, borderRadius: 8, fontSize: '0.85em', overflowX: 'auto', margin: '6px 0' }}>{children}</code>
                                                                )
                                                            },
                                                            blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid #22c55e', paddingLeft: 12, margin: '6px 0', color: '#64748b' }}>{children}</blockquote>,
                                                        }}>
                                                            {m.content}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}
                                            </div>
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

                        {/* 미리보기 없을 때 안내 오버레이 */}
                        {!name.trim() && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexDirection: 'column', gap: 8, zIndex: 10,
                            }}>
                                <div style={{ fontSize: 40 }}>💬</div>
                                <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>미리보기</div>
                                <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center' as const, maxWidth: 200 }}>
                                    AI 이름을 입력하면<br />미리보기가 시작됩니다
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
                @keyframes previewDot {
                    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                    40% { opacity: 1; transform: scale(1); }
                }
                .preview-markdown p:last-child { margin-bottom: 0 !important; }
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

