'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface MentorHeaderProps {
    mentor: {
        id: string
        name: string
        slug: string
        title: string
        avatar_url: string | null
        sample_questions: string[]
    }
    mentorImage: string | undefined
    mentorEmoji: string
    isStreaming: boolean
    onNewChat: () => void
    /** 전화 버튼 클릭 시 콜백 (없으면 전화 버튼 숨김) */
    onCall?: () => void
    /** 사이드바 토글 (모바일) */
    onToggleSidebar?: () => void
    /** 사이드바 열림 상태 (열렸으면 헤더 햄버거 숨김) */
    isSidebarOpen?: boolean
    /** 현재 세션 ID (내보내기용) */
    sessionId?: string | null
    /** AI 답변 총 글자수 (리포트 활성화 기준 1500자) */
    aiContentLength?: number
    /** 리포트 버튼 처음 활성화 여부 (NEW 뱃지) */
    isReportNew?: boolean
}

/* ── SVG 아이콘 ── */
const BackIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 4L7 10L13 16" />
    </svg>
)
const PhoneIcon = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3.5C2 2.67 2.67 2 3.5 2H6.12a1 1 0 01.98.76l.68 3.03a1 1 0 01-.29.93L5.78 8.44a11.05 11.05 0 005.78 5.78l1.72-1.71a1 1 0 01.93-.29l3.03.68a1 1 0 01.76.98V16.5a1.5 1.5 0 01-1.5 1.5A14.5 14.5 0 012 3.5z" />
    </svg>
)
const PlusIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="8" y1="3" x2="8" y2="13" />
        <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
)
const ShareIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8V13H12V8" />
        <polyline points="8,2 8,10" />
        <polyline points="5.5,4.5 8,2 10.5,4.5" />
    </svg>
)
const ExportIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v8" />
        <polyline points="4,6 8,10 12,6" />
        <path d="M2 13h12" />
    </svg>
)
const KakaoIcon = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 1.5C4.86 1.5 1.5 4.14 1.5 7.38c0 2.08 1.38 3.9 3.45 4.94-.15.56-.55 2.03-.63 2.34-.1.39.14.38.3.28.12-.08 1.94-1.32 2.73-1.86.53.08 1.08.12 1.65.12 4.14 0 7.5-2.64 7.5-5.88S13.14 1.5 9 1.5z" fill="#3C1E1E"/>
    </svg>
)
const LinkIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 8.5a3 3 0 004.24.35l2-2a3 3 0 00-4.24-4.24L7.25 3.86" />
        <path d="M9.5 7.5a3 3 0 00-4.24-.35l-2 2a3 3 0 004.24 4.24L8.75 12.14" />
    </svg>
)

export default function MentorHeader({
    mentor,
    mentorImage,
    mentorEmoji,
    isStreaming,
    onNewChat,
    onCall,
    onToggleSidebar,
    isSidebarOpen,
    sessionId,
    aiContentLength = 0,
    isReportNew = false,
}: MentorHeaderProps) {
    const router = useRouter()
    const [showShareMenu, setShowShareMenu] = useState(false)
    const [showExportModal, setShowExportModal] = useState(false)
    const [exportLoading, setExportLoading] = useState(false)
    const [exportData, setExportData] = useState<{ report: any; markdown: string; meta: any } | null>(null)
    const [exportError, setExportError] = useState<string | null>(null)

    const handleExport = async () => {
        if (!sessionId || sessionId.startsWith('guest-')) return
        setShowExportModal(true)
        setExportLoading(true)
        setExportError(null)
        setExportData(null)
        try {
            const res = await fetch('/api/chat/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId }),
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || '리포트 생성 실패')
            }
            const data = await res.json()
            setExportData(data)
        } catch (e: any) {
            setExportError(e.message)
        } finally {
            setExportLoading(false)
        }
    }

    const handleDownloadMarkdown = () => {
        if (!exportData) return
        const blob = new Blob([exportData.markdown], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${exportData.meta.mentorName}_리포트_${new Date().toISOString().split('T')[0]}.md`
        a.click()
        URL.revokeObjectURL(url)
    }

    const handleCopyReport = async () => {
        if (!exportData) return
        await navigator.clipboard.writeText(exportData.markdown)
        alert('리포트가 클립보드에 복사되었습니다!')
    }
    const [copied, setCopied] = useState(false)

    const shareUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/chat/${mentor.id}`
        : `https://www.curi-ai.com/chat/${mentor.id}`
    const shareTitle = `${mentor.name} AI ㅣ ${mentor.title}`
    const shareText = '궁금한 것을 언제든 물어보세요.'

    const handleKakaoShare = () => {
        const w = window as any
        if (w.Kakao && !w.Kakao.isInitialized()) {
            w.Kakao.init('27c5c27a03c6f936db39d20090643b3c')
        }
        if (w.Kakao && w.Kakao.isInitialized()) {
            w.Kakao.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title: shareTitle,
                    description: shareText,
                    imageUrl: 'https://www.curi-ai.com/icons/icon-512x512.png',
                    link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
                },
                buttons: [
                    { title: '대화하기', link: { mobileWebUrl: shareUrl, webUrl: shareUrl } },
                ],
            })
        } else {
            navigator.clipboard.writeText(shareUrl).then(() => {
                alert('링크가 복사되었습니다. 카카오톡에 붙여넣기 해주세요!')
            })
        }
        setShowShareMenu(false)
    }

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl)
            setCopied(true)
            setTimeout(() => {
                setCopied(false)
                setShowShareMenu(false)
            }, 1500)
        } catch {
            // fallback
            const input = document.createElement('input')
            input.value = shareUrl
            document.body.appendChild(input)
            input.select()
            document.execCommand('copy')
            document.body.removeChild(input)
            setCopied(true)
            setTimeout(() => {
                setCopied(false)
                setShowShareMenu(false)
            }, 1500)
        }
    }


    return (
        <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px 10px 12px',
            borderBottom: '1px solid #f1f5f9',
            background: '#fff',
            position: 'sticky',
            top: 0,
            zIndex: 10,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* 모바일 사이드바 토글 */}
                {onToggleSidebar && !isSidebarOpen && (
                    <button
                        onClick={onToggleSidebar}
                        className="sidebar-toggle-btn"
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 8,
                            borderRadius: 10,
                            color: '#64748b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                    >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="3" y1="5" x2="17" y2="5" />
                            <line x1="3" y1="10" x2="17" y2="10" />
                            <line x1="3" y1="15" x2="17" y2="15" />
                        </svg>
                    </button>
                )}
                <button
                    onClick={() => {
                        // 직접 URL 진입 시 (카카오톡 링크 등) back()하면 빈 페이지 → /mentors로 안전하게 이동
                        const hasHistory = window.history.length > 1
                        const isSameOrigin = document.referrer && document.referrer.includes(window.location.origin)
                        if (hasHistory && isSameOrigin) {
                            router.back()
                        } else {
                            router.push('/mentors')
                        }
                    }}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 8,
                        borderRadius: 10,
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                >
                    <BackIcon />
                </button>

                {mentorImage ? (
                    <img
                        src={mentorImage}
                        alt={mentor.name}
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            objectFit: 'cover',
                        }}
                    />
                ) : (
                    <img
                        src="/logo.png"
                        alt="큐리 AI"
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            objectFit: 'cover',
                        }}
                    />
                )}

                <div>
                    <div style={{
                        fontWeight: 700,
                        fontSize: 16,
                        color: '#1e293b',
                        lineHeight: 1.3,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}>
                        {mentor.name}
                        <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: '#fff',
                            padding: '2px 7px',
                            borderRadius: 5,
                            letterSpacing: '0.03em',
                            lineHeight: 1.4,
                        }}>AI</span>
                    </div>
                    <div style={{
                        fontSize: 13,
                        color: '#94a3b8',
                        lineHeight: 1.3,
                    }}>
                        {mentor.title}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isStreaming && (
                    <div className="header-streaming-badge" style={{
                        fontSize: 13,
                        color: '#22c55e',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        marginRight: 4,
                    }}>
                        <span style={{
                            display: 'inline-block',
                            width: 6, height: 6, borderRadius: '50%',
                            background: '#22c55e',
                            animation: 'pulseSoft 1.5s ease-in-out infinite',
                        }} />
                        <span className="header-text-label">답변 중</span>
                    </div>
                )}

                {onCall && (
                    <button
                        onClick={onCall}
                        aria-label="음성 대화 시작"
                        title="음성 대화"
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: 'transparent',
                            border: 'none',
                            color: '#22c55e',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f0fdf4' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                        <PhoneIcon />
                    </button>
                )}

                <button
                    onClick={onNewChat}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 10,
                        padding: '7px 12px',
                        fontSize: 14,
                        color: '#64748b',
                        cursor: 'pointer',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                    <PlusIcon />
                    <span className="header-text-label">새 대화</span>
                </button>

                {/* 내보내기 버튼 — 로그인 세션 + AI 답변 1500자 이상 */}
                {sessionId && !sessionId.startsWith('guest-') && aiContentLength >= 1500 && (
                    <button
                        onClick={handleExport}
                        aria-label="대화 리포트"
                        title="AI 요약 리포트"
                        style={{
                            position: 'relative',
                            background: isReportNew ? '#f0f9ff' : 'transparent',
                            border: isReportNew ? '1px solid #bfdbfe' : 'none',
                            borderRadius: 10,
                            padding: '7px 12px',
                            fontSize: 14,
                            color: isReportNew ? '#3b82f6' : '#64748b',
                            cursor: 'pointer',
                            fontWeight: isReportNew ? 600 : 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            transition: 'all 0.3s',
                            animation: isReportNew ? 'reportPulse 2s ease-in-out 3' : 'none',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff' }}
                        onMouseLeave={e => { e.currentTarget.style.background = isReportNew ? '#f0f9ff' : 'transparent' }}
                    >
                        <ExportIcon />
                        <span className="header-text-label">리포트</span>
                        {isReportNew && (
                            <span style={{
                                position: 'absolute', top: -4, right: -4,
                                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                color: '#fff', fontSize: 9, fontWeight: 700,
                                padding: '1px 5px', borderRadius: 6,
                                lineHeight: 1.5, letterSpacing: '0.05em',
                            }}>NEW</span>
                        )}
                    </button>
                )}
                <style>{`
                    @keyframes reportPulse {
                        0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
                        50% { box-shadow: 0 0 0 6px rgba(59,130,246,0.15); }
                    }
                `}</style>

                {/* 공유하기 버튼 */}
                <button
                    onClick={() => setShowShareMenu(true)}
                    aria-label="공유하기"
                    title="공유하기"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 10,
                        padding: '7px 12px',
                        fontSize: 14,
                        color: '#64748b',
                        cursor: 'pointer',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                    <ShareIcon />
                    <span className="header-text-label">공유하기</span>
                </button>

                {/* 공유 모달 */}
                {showShareMenu && (
                    <>
                        {/* 배경 오버레이 */}
                        <div
                            onClick={() => setShowShareMenu(false)}
                            style={{
                                position: 'fixed',
                                inset: 0,
                                background: 'rgba(0,0,0,0.4)',
                                zIndex: 1000,
                                animation: 'shareOverlayIn 0.2s ease',
                            }}
                        />
                        {/* 모달 */}
                        <div style={{
                            position: 'fixed',
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            background: '#fff',
                            borderRadius: 20,
                            padding: '28px 24px 24px',
                            width: 'min(360px, calc(100vw - 48px))',
                            zIndex: 1001,
                            animation: 'shareModalIn 0.2s ease',
                        }}>
                            <style>{`
                                @keyframes shareOverlayIn {
                                    from { opacity: 0; }
                                    to { opacity: 1; }
                                }
                                @keyframes shareModalIn {
                                    from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
                                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                                }
                            `}</style>

                            {/* 모달 헤더 */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 24,
                            }}>
                                <h3 style={{
                                    margin: 0,
                                    fontSize: 18,
                                    fontWeight: 700,
                                    color: '#18181b',
                                }}>공유하기</h3>
                                <button
                                    onClick={() => setShowShareMenu(false)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: 4,
                                        color: '#9ca3af',
                                        fontSize: 20,
                                        lineHeight: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* 링크 복사하기 */}
                            <button
                                onClick={handleCopyLink}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 10,
                                    padding: '14px 16px',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: 12,
                                    background: '#fff',
                                    cursor: 'pointer',
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: copied ? '#16a34a' : '#374151',
                                    transition: 'background 0.15s, border-color 0.15s',
                                    marginBottom: 10,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.borderColor = '#d1d5db' }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e5e7eb' }}
                            >
                                <LinkIcon />
                                {copied ? '✓ 복사됨!' : '링크 복사하기'}
                            </button>

                            {/* 카카오 공유하기 */}
                            <button
                                onClick={handleKakaoShare}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 10,
                                    padding: '14px 16px',
                                    border: 'none',
                                    borderRadius: 12,
                                    background: '#FEE500',
                                    cursor: 'pointer',
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: '#3C1E1E',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#fdd800' }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#FEE500' }}
                            >
                                <KakaoIcon />
                                카카오 공유하기
                            </button>
                        </div>
                    </>
                )}

                {/* 내보내기 리포트 모달 */}
                {showExportModal && (
                    <>
                        <div
                            onClick={() => setShowExportModal(false)}
                            style={{
                                position: 'fixed', inset: 0,
                                background: 'rgba(0,0,0,0.4)',
                                zIndex: 1000,
                                animation: 'shareOverlayIn 0.2s ease',
                            }}
                        />
                        <div style={{
                            position: 'fixed',
                            left: '50%', top: '50%',
                            transform: 'translate(-50%, -50%)',
                            background: '#fff',
                            borderRadius: 20,
                            padding: '28px 24px 24px',
                            width: 'min(480px, calc(100vw - 32px))',
                            maxHeight: '80vh',
                            overflowY: 'auto',
                            zIndex: 1001,
                            animation: 'shareModalIn 0.2s ease',
                        }}>
                            {/* 헤더 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#18181b' }}>
                                    📋 AI 요약 리포트
                                </h3>
                                <button
                                    onClick={() => setShowExportModal(false)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9ca3af', fontSize: 20 }}
                                >✕</button>
                            </div>

                            {/* 로딩 */}
                            {exportLoading && (
                                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '50%',
                                        border: '3px solid #e0e7ff', borderTopColor: '#6366f1',
                                        animation: 'spin 1s linear infinite',
                                        margin: '0 auto 16px',
                                    }} />
                                    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                                    <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>AI가 대화를 분석하고 있어요...</p>
                                    <p style={{ color: '#94a3b8', fontSize: 12, margin: '6px 0 0' }}>핵심 결정, 인사이트, 할 일을 추출 중</p>
                                </div>
                            )}

                            {/* 에러 */}
                            {exportError && (
                                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                                    <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
                                    <p style={{ color: '#dc2626', fontSize: 14, margin: 0 }}>{exportError}</p>
                                    <button onClick={handleExport} style={{
                                        marginTop: 16, padding: '8px 20px', borderRadius: 10,
                                        border: 'none', background: '#6366f1', color: '#fff',
                                        fontSize: 13, cursor: 'pointer',
                                    }}>다시 시도</button>
                                </div>
                            )}

                            {/* 리포트 내용 */}
                            {exportData && (
                                <div>
                                    {/* 메타 */}
                                    <div style={{
                                        background: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 16,
                                        border: '1px solid #f1f5f9',
                                    }}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                                            {exportData.report.title}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>
                                            {exportData.meta.mentorName} 멘토 · {exportData.meta.createdDate} · {exportData.meta.messageCount}개 메시지
                                        </div>
                                    </div>

                                    {/* 요약 */}
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>📝 요약</div>
                                        <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, margin: 0 }}>{exportData.report.summary}</p>
                                    </div>

                                    {/* 핵심 결정 */}
                                    {exportData.report.keyDecisions?.length > 0 && (
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>📌 핵심 결정 사항</div>
                                            {exportData.report.keyDecisions.map((d: string, i: number) => (
                                                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 14, color: '#334155' }}>
                                                    <span>✅</span><span>{d}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* 인사이트 */}
                                    {exportData.report.insights?.length > 0 && (
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>💡 주요 인사이트</div>
                                            {exportData.report.insights.map((ins: string, i: number) => (
                                                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 14, color: '#334155' }}>
                                                    <span>•</span><span>{ins}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* 할 일 */}
                                    {exportData.report.actionItems?.length > 0 && (
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>✅ 다음 할 일</div>
                                            {exportData.report.actionItems.map((a: string, i: number) => (
                                                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 14, color: '#334155' }}>
                                                    <span>☐</span><span>{a}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* 목차 */}
                                    {exportData.report.outline && (
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>📚 확정된 구조</div>
                                            <div style={{
                                                background: '#f8fafc', borderRadius: 10, padding: '12px 16px',
                                                fontSize: 13, lineHeight: 1.8, color: '#334155',
                                                whiteSpace: 'pre-wrap', border: '1px solid #f1f5f9',
                                            }}>
                                                {exportData.report.outline}
                                            </div>
                                        </div>
                                    )}

                                    {/* 액션 버튼 */}
                                    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                                        <button
                                            onClick={handleDownloadMarkdown}
                                            style={{
                                                flex: 1, padding: '12px 16px', borderRadius: 12,
                                                border: '1px solid #e5e7eb', background: '#fff',
                                                fontSize: 14, fontWeight: 600, color: '#374151',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center',
                                                justifyContent: 'center', gap: 6,
                                            }}
                                        >
                                            📥 다운로드
                                        </button>
                                        <button
                                            onClick={handleCopyReport}
                                            style={{
                                                flex: 1, padding: '12px 16px', borderRadius: 12,
                                                border: 'none',
                                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                fontSize: 14, fontWeight: 600, color: '#fff',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center',
                                                justifyContent: 'center', gap: 6,
                                            }}
                                        >
                                            📋 복사하기
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
            {/* 모바일에서 헤더 텍스트 숨김 — 아이콘만 표시 */}
            <style>{`
                @media (max-width: 640px) {
                    .header-text-label {
                        display: none !important;
                    }
                }
            `}</style>
        </header>
    )
}
