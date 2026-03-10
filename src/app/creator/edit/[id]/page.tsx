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
    const [knowledgeSources, setKnowledgeSources] = useState<{ id: string; title: string; source_type: string; processing_status: string; chunk_count: number; created_at: string }[]>([])

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

    return (
        <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>
            {/* ── GNB ── */}
            <header style={{
                position: 'sticky', top: 0, zIndex: 50,
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderBottom: '1px solid #f0f0f0',
            }}>
                <div style={{
                    maxWidth: 1200, margin: '0 auto',
                    padding: '0 40px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    height: 64,
                }}>
                    <Link href="/mentors" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                        <Image src="/logo.png" alt="큐리 AI" width={36} height={36} style={{ borderRadius: 10 }} />
                        <span style={{
                            fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em',
                            background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            큐리 AI
                        </span>
                    </Link>
                    <nav style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                        {[
                            { label: '멘토', href: '/mentors', active: false },
                            { label: '대화', href: '/chats', active: false },
                            { label: '마이페이지', href: '/profile', active: false },
                        ].map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                style={{
                                    textDecoration: 'none',
                                    fontSize: 16, fontWeight: item.active ? 700 : ('highlight' in item && item.highlight) ? 600 : 500,
                                    color: item.active ? '#16a34a' : ('highlight' in item && item.highlight) ? '#f59e0b' : '#9ca3af',
                                    transition: 'color 200ms',
                                    borderBottom: item.active ? '2px solid #22c55e' : '2px solid transparent',
                                    paddingBottom: 4,
                                }}
                            >
                                {('highlight' in item && item.highlight) ? '✨ ' : ''}{item.label}
                            </Link>
                        ))}
                    </nav>
                </div>
            </header>

            {/* ── 콘텐츠 ── */}
            <div style={styles.container}>
                {/* ── 토스트 (화면 상단 고정) ── */}
                {toast && (
                    <div style={{
                        position: 'fixed',
                        top: 20,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 9999,
                        padding: '14px 28px',
                        borderRadius: 14,
                        fontSize: 15,
                        fontWeight: 600,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        animation: 'slideDown 0.3s ease',
                        ...(toast.type === 'success'
                            ? { background: '#22c55e', color: '#fff' }
                            : { background: '#ef4444', color: '#fff' }),
                    }}>
                        {toast.message}
                    </div>
                )}

                {/* ── 헤더 ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <button
                        style={styles.backBtn}
                        onClick={() => router.back()}
                    >
                        ←
                    </button>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#18181b' }}>
                            {name} 설정
                        </h1>
                        <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9ca3af' }}>
                            AI 동작에 반영되는 설정만 표시됩니다
                        </p>
                    </div>
                </div>

                {/* ── 폼 ── */}
                <div style={styles.form}>
                    {/* 프로필 이미지 */}
                    <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', marginBottom: 20 }}>
                        <div
                            onClick={() => avatarInputRef.current?.click()}
                            style={{
                                width: 100, height: 100, borderRadius: '50%',
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
                                    <div style={{ fontSize: 28 }}>📷</div>
                                    <div style={{ fontSize: 11, marginTop: 2 }}>프로필</div>
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
                        <span style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                            클릭하여 프로필 사진 변경
                        </span>
                    </div>

                    {/* AI 이름 */}
                    <div style={styles.field}>
                        <label style={styles.label}>AI 이름</label>
                        <input
                            style={styles.input}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="예: 맥주대왕"
                        />
                    </div>

                    {/* 한줄 소개 */}
                    <div style={styles.field}>
                        <label style={styles.label}>한줄 소개</label>
                        <input
                            style={styles.input}
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="멘토 카드에 표시될 소개"
                        />
                    </div>

                    {/* 구분선 */}
                    <div style={styles.divider} />

                    {/* 시스템 프롬프트 */}
                    <div style={styles.field}>
                        <label style={styles.label}>🎭 시스템 프롬프트</label>
                        <p style={styles.hint}>AI의 성격, 말투, 전문성을 정의합니다</p>
                        <textarea
                            style={{ ...styles.textarea, fontFamily: 'monospace', fontSize: 13 }}
                            value={systemPrompt}
                            onChange={e => setSystemPrompt(e.target.value)}
                            rows={12}
                        />
                    </div>

                    {/* 인사 메시지 */}
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

                    {/* 예시 질문 */}
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

                    {/* 구분선 */}
                    <div style={styles.divider} />

                    {/* 📚 지식 파일 목록 */}
                    <div style={styles.field}>
                        <label style={styles.label}>📚 등록된 지식 파일</label>
                        <p style={styles.hint}>이 AI가 참고하는 파일 목록입니다</p>
                        {knowledgeSources.length === 0 ? (
                            <div style={{ padding: 20, textAlign: 'center' as const, color: '#9ca3af', fontSize: 14, background: '#f9fafb', borderRadius: 12 }}>
                                등록된 지식 파일이 없습니다
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                                {knowledgeSources.map((src) => (
                                    <div key={src.id} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '12px 16px', borderRadius: 12,
                                        background: '#f9fafb', border: '1px solid #f0f0f0',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontSize: 18 }}>
                                                {src.source_type === 'pdf' ? '📄' : src.source_type === 'hwp' ? '📝' : '📃'}
                                            </span>
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 500, color: '#18181b' }}>{src.title}</div>
                                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                                                    {src.chunk_count ? `${src.chunk_count}개 청크` : ''}
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
                                             src.processing_status === 'processing' ? '⏳ 처리중' :
                                             src.processing_status === 'pending' ? '⏳ 대기중' : '❌ 실패'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 활성화 토글 */}
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

                {/* ── 저장 버튼 (하단 고정) ── */}
                <div style={styles.bottomBar}>
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

                {/* 토스트 애니메이션 */}
                <style>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>
            </div>
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        maxWidth: 760,
        margin: '0 auto',
        padding: '20px 16px 100px',
        minHeight: '100dvh',
        background: '#f8f9fa',
        color: '#18181b',
        fontFamily: 'var(--font-noto-sans-kr), Pretendard, sans-serif',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        background: '#fff',
        borderRadius: 16,
        padding: '20px 18px',
        border: '1px solid #f0f0f0',
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
    divider: {
        height: 1,
        background: '#f0f0f0',
        margin: '4px 0',
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
    bottomBar: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(10px)',
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'center',
    },
    saveBtn: {
        width: '100%',
        maxWidth: 760,
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
