'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

/* ── 타입 ── */
interface EbookPage {
    pageNum: number
    title: string
    imageGuide: string
    content: string
    quote?: string
    cta?: string
    checklist?: string[]
}

interface EbookCover {
    title: string
    subtitle: string
    author: string
    imageGuide: string
}

interface EbookData {
    cover: EbookCover
    pages: EbookPage[]
}

interface EbookMeta {
    mentorName: string
    createdDate: string
    sessionTitle: string
}

interface EbookViewerProps {
    ebook: EbookData
    meta: EbookMeta
    onClose: () => void
    /** 수정 요청 시 채팅으로 돌아가면서 입력란에 프리필 */
    onEditRequest?: (prefill: string) => void
    /** 공유 링크 생성 API 호출 */
    sessionId?: string
}

/* ── 테마 ── */
const THEMES = {
    navy:   { name: '네이비', bg: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #2563eb 100%)', accent: '#2563eb', accentLight: '#dbeafe', text: '#1e293b' },
    green:  { name: '그린',   bg: 'linear-gradient(135deg, #064e3b 0%, #047857 40%, #10b981 100%)', accent: '#059669', accentLight: '#d1fae5', text: '#1e293b' },
    purple: { name: '퍼플',   bg: 'linear-gradient(135deg, #2e1065 0%, #6d28d9 40%, #a78bfa 100%)', accent: '#7c3aed', accentLight: '#ede9fe', text: '#1e293b' },
    warm:   { name: '웜톤',   bg: 'linear-gradient(135deg, #78350f 0%, #b45309 40%, #f59e0b 100%)', accent: '#d97706', accentLight: '#fef3c7', text: '#1e293b' },
} as const

type ThemeKey = keyof typeof THEMES

/* ── 메인 컴포넌트 ── */
export default function EbookViewer({ ebook, meta, onClose, onEditRequest, sessionId }: EbookViewerProps) {
    const [currentPage, setCurrentPage] = useState(0) // 0=표지, 1~5=페이지
    const [theme, setTheme] = useState<ThemeKey>('navy')
    const [showThemeMenu, setShowThemeMenu] = useState(false)
    const [shareUrl, setShareUrl] = useState<string | null>(null)
    const [shareLoading, setShareLoading] = useState(false)
    const [editedContent, setEditedContent] = useState<Record<number, Partial<EbookPage>>>({})
    const [editedCover, setEditedCover] = useState<Partial<EbookCover>>({})
    const touchStartX = useRef(0)
    const totalPages = (ebook.pages?.length || 0) + 1 // 표지 포함
    const t = THEMES[theme]
    const generatedAt = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

    // 키보드 네비게이션
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext()
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev()
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [currentPage])

    const goNext = useCallback(() => setCurrentPage(p => Math.min(p + 1, totalPages - 1)), [totalPages])
    const goPrev = useCallback(() => setCurrentPage(p => Math.max(p - 1, 0)), [])

    // 터치 스와이프
    const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
    const handleTouchEnd = (e: React.TouchEvent) => {
        const diff = touchStartX.current - e.changedTouches[0].clientX
        if (Math.abs(diff) > 50) { diff > 0 ? goNext() : goPrev() }
    }

    // PDF 다운로드
    const handleDownloadPdf = async () => {
        try {
            const { generateEbookHtml } = await import('./ebookTemplate')
            const html2pdf = (await import('html2pdf.js')).default

            // 편집된 내용 반영
            const finalEbook = applyEdits(ebook)
            const htmlContent = generateEbookHtml(finalEbook, meta.mentorName)
            const container = document.createElement('div')
            container.innerHTML = htmlContent
            document.body.appendChild(container)

            await html2pdf()
                .set({
                    margin: [0, 0, 0, 0],
                    filename: `${finalEbook.cover.title || 'ebook'}_${new Date().toISOString().split('T')[0]}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'] },
                } as any)
                .from(container)
                .save()

            document.body.removeChild(container)
        } catch (e) {
            console.error('PDF error:', e)
            alert('PDF 생성에 실패했습니다.')
        }
    }

    // 편집 내용 적용
    const applyEdits = (data: EbookData): EbookData => ({
        cover: { ...data.cover, ...editedCover },
        pages: data.pages.map((p, i) => ({ ...p, ...(editedContent[i] || {}) }))
    })

    // 공유 링크
    const handleShare = async () => {
        if (shareUrl) { navigator.clipboard.writeText(shareUrl); alert('링크가 복사되었습니다!'); return }
        if (!sessionId) { alert('세션 정보가 없습니다.'); return }
        setShareLoading(true)
        try {
            const res = await fetch('/api/chat/export-ebook/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, ebook: applyEdits(ebook), meta }),
            })
            if (res.ok) {
                const { url } = await res.json()
                setShareUrl(url)
                navigator.clipboard.writeText(url)
                alert('공유 링크가 복사되었습니다!')
            } else {
                alert('공유 링크 생성에 실패했습니다.')
            }
        } catch { alert('공유 링크 생성에 실패했습니다.') }
        finally { setShareLoading(false) }
    }

    // 수정 요청
    const handleEditRequest = (pageNum: number) => {
        if (onEditRequest) {
            onEditRequest(`Page ${pageNum} 수정: `)
            onClose()
        }
    }

    // 인라인 편집
    const handleContentEdit = (pageIndex: number, field: string, value: string) => {
        setEditedContent(prev => ({
            ...prev,
            [pageIndex]: { ...(prev[pageIndex] || {}), [field]: value }
        }))
    }

    const handleCoverEdit = (field: string, value: string) => {
        setEditedCover(prev => ({ ...prev, [field]: value }))
    }

    /* ── 표지 렌더링 ── */
    const renderCover = () => {
        const cover = { ...ebook.cover, ...editedCover }
        return (
            <div style={{
                width: '100%', height: '100%',
                background: t.bg,
                display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center',
                padding: '40px 30px', boxSizing: 'border-box',
                position: 'relative',
            }}>
                {/* 장식 보더 */}
                <div style={{
                    position: 'absolute', top: 24, left: 24, right: 24, bottom: 24,
                    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                }} />

                <div style={{ textAlign: 'center', maxWidth: 500 }}>
                    <h1
                        contentEditable suppressContentEditableWarning
                        onBlur={e => handleCoverEdit('title', e.currentTarget.textContent || '')}
                        style={{
                            fontFamily: "'Pretendard', sans-serif", fontSize: 'clamp(24px, 5vw, 36px)',
                            fontWeight: 800, color: '#fff', lineHeight: 1.3,
                            margin: '0 0 16px', wordBreak: 'keep-all',
                            outline: 'none', cursor: 'text',
                            borderBottom: '2px dashed transparent',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={e => { (e.target as HTMLElement).style.borderBottomColor = 'rgba(255,255,255,0.4)' }}
                        onBlurCapture={e => { (e.target as HTMLElement).style.borderBottomColor = 'transparent' }}
                    >
                        {cover.title}
                    </h1>
                    <p
                        contentEditable suppressContentEditableWarning
                        onBlur={e => handleCoverEdit('subtitle', e.currentTarget.textContent || '')}
                        style={{
                            fontSize: 'clamp(13px, 2.5vw, 16px)', color: 'rgba(186,230,253,0.9)',
                            lineHeight: 1.6, margin: 0, outline: 'none', cursor: 'text',
                        }}
                    >
                        {cover.subtitle}
                    </p>
                </div>

                <div style={{ marginTop: 'auto', marginBottom: 40, textAlign: 'center' }}>
                    <div style={{
                        display: 'inline-block', padding: '8px 24px',
                        border: '1px solid rgba(255,255,255,0.3)', borderRadius: 3,
                    }}>
                        <span
                            contentEditable suppressContentEditableWarning
                            onBlur={e => handleCoverEdit('author', e.currentTarget.textContent || '')}
                            style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', outline: 'none' }}
                        >
                            by {cover.author || meta.mentorName}
                        </span>
                    </div>
                </div>
            </div>
        )
    }

    /* ── 페이지 렌더링 ── */
    const renderPage = (pageIndex: number) => {
        const page = { ...ebook.pages[pageIndex], ...(editedContent[pageIndex] || {}) }
        return (
            <div style={{
                width: '100%', height: '100%', padding: 'clamp(20px, 4vw, 40px)',
                boxSizing: 'border-box', background: '#fff', overflowY: 'auto',
                position: 'relative',
            }}>
                {/* 페이지 헤더 */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 20, paddingBottom: 10,
                    borderBottom: `2px solid ${t.accentLight}`,
                }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{ebook.cover.title}</span>
                    <span style={{
                        fontSize: 10, color: '#fff', background: t.accent,
                        padding: '2px 10px', borderRadius: 10, fontWeight: 600,
                    }}>Page {page.pageNum}</span>
                </div>

                {/* 제목 */}
                <h2
                    contentEditable suppressContentEditableWarning
                    onBlur={e => handleContentEdit(pageIndex, 'title', e.currentTarget.textContent || '')}
                    style={{
                        fontSize: 'clamp(18px, 3.5vw, 24px)', fontWeight: 700, color: '#0f172a',
                        margin: '0 0 16px', lineHeight: 1.4, wordBreak: 'keep-all',
                        outline: 'none', cursor: 'text',
                    }}
                >
                    {page.title}
                </h2>

                {/* 이미지 가이드 */}
                {page.imageGuide && (
                    <div style={{
                        margin: '16px 0', padding: '14px 18px',
                        border: '2px dashed #cbd5e1', borderRadius: 8, background: '#f8fafc',
                        textAlign: 'center',
                    }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>🖼️ {page.imageGuide}</span>
                    </div>
                )}

                {/* 본문 (편집 가능) */}
                <div
                    contentEditable suppressContentEditableWarning
                    onBlur={e => handleContentEdit(pageIndex, 'content', e.currentTarget.innerText || '')}
                    style={{
                        fontSize: 'clamp(14px, 2.2vw, 16px)', color: '#334155',
                        lineHeight: 1.85, whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
                        outline: 'none', cursor: 'text', minHeight: 100,
                    }}
                >
                    {page.content}
                </div>

                {/* 인용구 */}
                {page.quote && (
                    <div style={{
                        margin: '20px 0', padding: '16px 20px',
                        borderLeft: `4px solid ${t.accent}`,
                        background: t.accentLight, borderRadius: '0 8px 8px 0',
                    }}>
                        <p
                            contentEditable suppressContentEditableWarning
                            onBlur={e => handleContentEdit(pageIndex, 'quote', e.currentTarget.textContent || '')}
                            style={{ fontSize: 14, color: t.accent, fontStyle: 'italic', margin: 0, lineHeight: 1.7, outline: 'none' }}
                        >
                            💡 {page.quote}
                        </p>
                    </div>
                )}

                {/* CTA */}
                {page.cta && (
                    <div style={{
                        margin: '20px 0', padding: '18px 22px',
                        background: t.bg, borderRadius: 10, textAlign: 'center',
                    }}>
                        <p
                            contentEditable suppressContentEditableWarning
                            onBlur={e => handleContentEdit(pageIndex, 'cta', e.currentTarget.textContent || '')}
                            style={{ fontSize: 15, color: '#fff', fontWeight: 700, margin: 0, lineHeight: 1.6, outline: 'none' }}
                        >
                            {page.cta}
                        </p>
                    </div>
                )}

                {/* 체크리스트 */}
                {page.checklist?.length ? (
                    <div style={{
                        margin: '20px 0', padding: '18px 22px',
                        background: '#ecfdf5', border: '1px solid #86efac', borderRadius: 10,
                    }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#166534', margin: '0 0 10px' }}>✅ 당장 해야 할 첫 번째 미션</p>
                        {page.checklist.map((item, i) => (
                            <p key={i} style={{ fontSize: 13, color: '#15803d', margin: '6px 0', lineHeight: 1.6 }}>
                                ☐ {item}
                            </p>
                        ))}
                    </div>
                ) : null}

                {/* 수정 요청 버튼 */}
                {onEditRequest && (
                    <button
                        onClick={() => handleEditRequest(page.pageNum)}
                        style={{
                            position: 'absolute', bottom: 20, right: 20,
                            padding: '8px 16px', borderRadius: 20,
                            border: `1px solid ${t.accentLight}`, background: '#fff',
                            fontSize: 12, color: t.accent, cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                            display: 'flex', alignItems: 'center', gap: 4,
                        }}
                    >
                        ✏️ 이 페이지 수정 요청
                    </button>
                )}
            </div>
        )
    }

    /* ── 메인 레이아웃 ── */
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', flexDirection: 'column',
            fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
        }}>
            {/* ── 상단 바 ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', background: 'rgba(0,0,0,0.5)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
            }}>
                {/* 좌측: 닫기 + 메타 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', color: '#fff',
                        fontSize: 20, cursor: 'pointer', padding: 4,
                    }}>✕</button>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                            {ebook.cover.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                            마지막 생성: {generatedAt} · 텍스트를 클릭하면 직접 편집 가능
                        </div>
                    </div>
                </div>

                {/* 우측: 액션 버튼들 */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* 테마 */}
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowThemeMenu(!showThemeMenu)} style={{
                            padding: '6px 12px', borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)',
                            color: '#fff', fontSize: 12, cursor: 'pointer',
                        }}>🎨 테마</button>
                        {showThemeMenu && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: 6,
                                background: '#1e293b', borderRadius: 10, padding: 8,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                                zIndex: 10, minWidth: 120,
                            }}>
                                {(Object.keys(THEMES) as ThemeKey[]).map(key => (
                                    <button key={key} onClick={() => { setTheme(key); setShowThemeMenu(false) }}
                                        style={{
                                            display: 'block', width: '100%', padding: '8px 12px',
                                            background: theme === key ? 'rgba(255,255,255,0.15)' : 'transparent',
                                            border: 'none', borderRadius: 6, color: '#fff',
                                            fontSize: 13, cursor: 'pointer', textAlign: 'left',
                                        }}
                                    >
                                        {theme === key ? '✓ ' : '  '}{THEMES[key].name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 공유 */}
                    <button onClick={handleShare} disabled={shareLoading} style={{
                        padding: '6px 12px', borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)',
                        color: '#fff', fontSize: 12, cursor: 'pointer',
                        opacity: shareLoading ? 0.5 : 1,
                    }}>
                        {shareLoading ? '⏳' : shareUrl ? '✅ 링크복사' : '🔗 공유'}
                    </button>

                    {/* PDF */}
                    <button onClick={handleDownloadPdf} style={{
                        padding: '6px 14px', borderRadius: 8, border: 'none',
                        background: t.accent, color: '#fff',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>📄 PDF 다운로드</button>
                </div>
            </div>

            {/* ── 페이지 진행 바 ── */}
            <div style={{
                display: 'flex', justifyContent: 'center', gap: 6,
                padding: '10px 20px', background: 'rgba(0,0,0,0.3)',
            }}>
                {Array.from({ length: totalPages }).map((_, i) => (
                    <button key={i} onClick={() => setCurrentPage(i)} style={{
                        width: i === currentPage ? 28 : 8, height: 8, borderRadius: 4,
                        border: 'none', cursor: 'pointer', transition: 'all 0.3s ease',
                        background: i === currentPage ? t.accent :
                            i < currentPage ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
                    }} />
                ))}
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>
                    {currentPage === 0 ? '표지' : `${currentPage} / ${totalPages - 1} 페이지`}
                </span>
            </div>

            {/* ── 메인 콘텐츠 ── */}
            <div
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 'clamp(12px, 3vw, 40px)', overflow: 'hidden',
                    position: 'relative',
                }}
            >
                {/* 좌측 화살표 */}
                {currentPage > 0 && (
                    <button onClick={goPrev} style={{
                        position: 'absolute', left: 'clamp(4px, 2vw, 20px)', top: '50%',
                        transform: 'translateY(-50%)', width: 44, height: 44,
                        borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)',
                        background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 18,
                        cursor: 'pointer', zIndex: 5,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>‹</button>
                )}

                {/* 페이지 카드 */}
                <div style={{
                    width: 'min(100%, 600px)',
                    height: 'min(100%, 800px)',
                    borderRadius: 12, overflow: 'hidden',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    transition: 'transform 0.3s ease',
                }}>
                    {currentPage === 0 ? renderCover() : renderPage(currentPage - 1)}
                </div>

                {/* 우측 화살표 */}
                {currentPage < totalPages - 1 && (
                    <button onClick={goNext} style={{
                        position: 'absolute', right: 'clamp(4px, 2vw, 20px)', top: '50%',
                        transform: 'translateY(-50%)', width: 44, height: 44,
                        borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)',
                        background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 18,
                        cursor: 'pointer', zIndex: 5,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>›</button>
                )}
            </div>
        </div>
    )
}
