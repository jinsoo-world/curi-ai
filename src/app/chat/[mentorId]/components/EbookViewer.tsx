'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

/* ── 타입 ── */
interface EbookPage {
    pageNum: number
    title: string
    imageGuide?: string
    content: string
    quote?: string
    cta?: string
    checklist?: string[]
}

interface EbookCover {
    title: string
    subtitle: string
    author: string
    imageGuide?: string
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

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

interface EbookViewerProps {
    ebook: EbookData
    meta: EbookMeta
    onClose: () => void
    onEditRequest?: (prefill: string) => void
    onEbookUpdate?: (newEbook: EbookData) => void
    sessionId?: string
}

/*
 * ── 8종 한국 베스트셀러 표지 분석 기반 테마 ──
 * 
 * 1. 프리미엄 그라디언트 (AI 강의 2026): 보라+남색 그라디언트, 흰 타이틀 중앙, 은은한 빛
 * 2. 임팩트 레드 (초격차): 검정+빨강, 파격적 큰 제목, 공격적, 박스 장식
 * 3. 클린 미니멀 (자녀성공학): 흰 배경, 검정 텍스트, 깔끔한 서체, 실루엣/일러스트 느낌
 * 4. 석양 무드 (왜 일하는가): 따뜻한 sunset 톤, 인용구, 감성적 분위기
 * 5. 클래식 골드 (캔들차트): 다크 올리브, 금색 포인트, 전통적 권위감
 * 6. 모던 캐주얼 (바이브 코딩): 밝은 회색, 컬러풀 뱃지, 둥근 요소, 경쾌한
 */
const THEMES = {
    gradient: {
        name: '프리미엄',
        cover: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 30%, #6366f1 70%, #818cf8 100%)',
        titleColor: '#fff', subtitleColor: 'rgba(199,210,254,0.9)', authorColor: 'rgba(255,255,255,0.6)',
        accent: '#6366f1', accentLight: '#e0e7ff', text: '#1e293b',
        decoStyle: 'circles' as const,
        pageBg: '#fff', pageAccent: '#6366f1',
    },
    impact: {
        name: '임팩트',
        cover: 'linear-gradient(160deg, #0c0c0c 0%, #1a1a1a 50%, #2d0a0a 100%)',
        titleColor: '#ef4444', subtitleColor: 'rgba(255,255,255,0.7)', authorColor: 'rgba(255,255,255,0.5)',
        accent: '#ef4444', accentLight: '#fef2f2', text: '#1e293b',
        decoStyle: 'lines' as const,
        pageBg: '#fff', pageAccent: '#dc2626',
    },
    minimal: {
        name: '미니멀',
        cover: '#fafaf9',
        titleColor: '#0c0a09', subtitleColor: '#57534e', authorColor: '#a8a29e',
        accent: '#292524', accentLight: '#f5f5f4', text: '#1c1917',
        decoStyle: 'none' as const,
        pageBg: '#fafaf9', pageAccent: '#292524',
    },
    sunset: {
        name: '석양',
        cover: 'linear-gradient(180deg, #1c1917 0%, #451a03 30%, #92400e 60%, #d97706 100%)',
        titleColor: '#fff', subtitleColor: 'rgba(254,243,199,0.8)', authorColor: 'rgba(255,255,255,0.5)',
        accent: '#d97706', accentLight: '#fef3c7', text: '#1e293b',
        decoStyle: 'glow' as const,
        pageBg: '#fff', pageAccent: '#b45309',
    },
    classic: {
        name: '클래식',
        cover: 'linear-gradient(160deg, #1a2e1a 0%, #14532d 40%, #166534 100%)',
        titleColor: '#fbbf24', subtitleColor: 'rgba(255,255,255,0.75)', authorColor: 'rgba(253,224,71,0.6)',
        accent: '#16a34a', accentLight: '#dcfce7', text: '#1e293b',
        decoStyle: 'border' as const,
        pageBg: '#fff', pageAccent: '#15803d',
    },
    casual: {
        name: '캐주얼',
        cover: '#f1f5f9',
        titleColor: '#1e293b', subtitleColor: '#6366f1', authorColor: '#94a3b8',
        accent: '#6366f1', accentLight: '#e0e7ff', text: '#1e293b',
        decoStyle: 'badges' as const,
        pageBg: '#fff', pageAccent: '#6366f1',
    },
} as const

type ThemeKey = keyof typeof THEMES

/* ── 메인 컴포넌트 ── */
export default function EbookViewer({ ebook, meta, onClose, onEditRequest, onEbookUpdate, sessionId }: EbookViewerProps) {
    const [currentPage, setCurrentPage] = useState(0)
    const [theme, setTheme] = useState<ThemeKey>('gradient')
    const [showThemeMenu, setShowThemeMenu] = useState(false)
    const [editedContent, setEditedContent] = useState<Record<number, Partial<EbookPage>>>({})
    const [editedCover, setEditedCover] = useState<Partial<EbookCover>>({})
    const [showChat, setShowChat] = useState(false)
    const [chatInput, setChatInput] = useState('')
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
    const [isEditing, setIsEditing] = useState(false)
    const chatEndRef = useRef<HTMLDivElement>(null)
    const touchStartX = useRef(0)
    const totalPages = (ebook.pages?.length || 0) + 1
    const t = THEMES[theme]
    const generatedAt = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [chatHistory, isEditing])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.isContentEditable) return
            if ((e.target as HTMLElement)?.tagName === 'INPUT') return
            if (e.key === 'ArrowRight') goNext()
            if (e.key === 'ArrowLeft') goPrev()
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [currentPage])

    const goNext = useCallback(() => setCurrentPage(p => Math.min(p + 1, totalPages - 1)), [totalPages])
    const goPrev = useCallback(() => setCurrentPage(p => Math.max(p - 1, 0)), [])
    const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
    const handleTouchEnd = (e: React.TouchEvent) => {
        const diff = touchStartX.current - e.changedTouches[0].clientX
        if (Math.abs(diff) > 50) { diff > 0 ? goNext() : goPrev() }
    }

    const handleDownloadPdf = async () => {
        try {
            const { generateEbookHtml } = await import('./ebookTemplate')
            const html2pdf = (await import('html2pdf.js')).default
            const finalEbook = applyEdits(ebook)
            const htmlContent = generateEbookHtml(finalEbook, meta.mentorName)
            const container = document.createElement('div')
            container.innerHTML = htmlContent
            document.body.appendChild(container)
            await html2pdf().set({
                margin: [0, 0, 0, 0],
                filename: `${finalEbook.cover.title || 'ebook'}_${new Date().toISOString().split('T')[0]}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'legacy'] },
            } as any).from(container).save()
            document.body.removeChild(container)
        } catch (e) {
            console.error('PDF error:', e)
            alert('PDF 생성에 실패했습니다.')
        }
    }

    const applyEdits = (data: EbookData): EbookData => ({
        cover: { ...data.cover, ...editedCover },
        pages: data.pages.map((p, i) => ({ ...p, ...(editedContent[i] || {}) }))
    })

    const handleEditRequest = (pageNum: number) => {
        setChatInput(`Page ${pageNum} 수정: `)
        setShowChat(true)
    }
    const handleSendEdit = async () => {
        const msg = chatInput.trim()
        if (!msg || isEditing) return
        
        setChatHistory(prev => [...prev, { role: 'user', content: msg }])
        setChatInput('')
        setIsEditing(true)
        
        try {
            // 현재 ebook + 수정 요청을 AI에게 전달
            const currentEbook = applyEdits(ebook)
            const res = await fetch('/api/chat/edit-ebook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentEbook,
                    editRequest: msg,
                    mentorName: meta.mentorName,
                }),
            })
            
            if (!res.ok) throw new Error('수정 실패')
            const data = await res.json()
            
            if (data.ebook && onEbookUpdate) {
                onEbookUpdate(data.ebook)
                setEditedContent({})
                setEditedCover({})
            }
            
            setChatHistory(prev => [...prev, { role: 'assistant', content: data.summary || '✅ 수정 완료!' }])
        } catch {
            setChatHistory(prev => [...prev, { role: 'assistant', content: '❌ 수정에 실패했습니다. 다시 시도해 주세요.' }])
        } finally {
            setIsEditing(false)
        }
    }
    const handleContentEdit = (pageIndex: number, field: string, value: string) => {
        setEditedContent(prev => ({ ...prev, [pageIndex]: { ...(prev[pageIndex] || {}), [field]: value } }))
    }
    const handleCoverEdit = (field: string, value: string) => {
        setEditedCover(prev => ({ ...prev, [field]: value }))
    }

    /* ── 6종 표지 렌더링 ── */
    const renderCover = () => {
        const cover = { ...ebook.cover, ...editedCover }
        const authorName = cover.author || meta.mentorName
        const isDark = theme !== 'minimal' && theme !== 'casual'

        return (
            <div style={{
                width: '100%', height: '100%', background: t.cover,
                display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center',
                padding: '40px 28px', boxSizing: 'border-box',
                position: 'relative', overflow: 'hidden',
            }}>
                {/* 데코레이션: 테마별 */}
                {t.decoStyle === 'circles' && <>
                    <div style={{ position: 'absolute', top: -80, right: -80, width: 250, height: 250, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
                    <div style={{ position: 'absolute', bottom: -50, left: -50, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
                    <div style={{ position: 'absolute', top: '40%', right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.02)' }} />
                </>}

                {t.decoStyle === 'lines' && <>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#ef4444' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: '#ef4444' }} />
                    <div style={{ position: 'absolute', top: '20%', left: 20, right: 20, height: 1, background: 'rgba(239,68,68,0.2)' }} />
                    <div style={{ position: 'absolute', bottom: '20%', left: 20, right: 20, height: 1, background: 'rgba(239,68,68,0.2)' }} />
                </>}

                {t.decoStyle === 'border' && (
                    <div style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, border: '2px solid rgba(251,191,36,0.3)', borderRadius: 0 }} />
                )}

                {t.decoStyle === 'glow' && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(to top, rgba(217,119,6,0.3), transparent)' }} />
                )}

                {t.decoStyle === 'badges' && <>
                    <div style={{ position: 'absolute', top: 20, right: 20, background: '#6366f1', color: '#fff', padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>AI 생성</div>
                    <div style={{ position: 'absolute', top: 20, left: 20, background: '#f97316', color: '#fff', padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>전자책</div>
                </>}

                {/* 상단 서브텍스트 (미니멀 스타일) */}
                {(theme === 'minimal' || theme === 'casual') && (
                    <p style={{ fontSize: 12, color: t.subtitleColor, letterSpacing: 1, margin: '0 0 auto', textAlign: 'center' }}>
                        {authorName} 지음
                    </p>
                )}

                {/* 메인 타이틀 영역 */}
                <div style={{
                    flex: (theme === 'minimal' || theme === 'casual') ? undefined : 1,
                    display: 'flex', flexDirection: 'column',
                    justifyContent: theme === 'impact' ? 'flex-end' : 'center',
                    alignItems: 'center', textAlign: 'center',
                    zIndex: 1, maxWidth: 480, margin: '0 auto',
                    paddingBottom: theme === 'impact' ? 40 : 0,
                }}>
                    {/* 임팩트 스타일: 상단에 작은 서브 */}
                    {theme === 'impact' && (
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 4, margin: '0 0 12px', textTransform: 'uppercase' }}>
                            ― {authorName} ―
                        </p>
                    )}

                    <h1
                        contentEditable suppressContentEditableWarning
                        onBlur={e => handleCoverEdit('title', e.currentTarget.textContent || '')}
                        style={{
                            fontSize: theme === 'impact' ? 'clamp(28px, 6vw, 44px)' : 'clamp(24px, 5vw, 38px)',
                            fontWeight: theme === 'minimal' ? 900 : 800,
                            color: t.titleColor, lineHeight: theme === 'impact' ? 1.2 : 1.35,
                            margin: '0 0 16px', wordBreak: 'keep-all', outline: 'none', cursor: 'text',
                            letterSpacing: theme === 'minimal' ? 2 : theme === 'impact' ? -1 : 0,
                            textShadow: isDark ? '0 2px 20px rgba(0,0,0,0.3)' : 'none',
                        }}
                    >{cover.title}</h1>

                    {/* 구분선 */}
                    {theme !== 'impact' && theme !== 'casual' && (
                        <div style={{
                            width: theme === 'minimal' ? 60 : 40, height: theme === 'minimal' ? 3 : 2,
                            background: theme === 'minimal' ? '#0c0a09' : theme === 'classic' ? '#fbbf24' : 'rgba(255,255,255,0.3)',
                            margin: '0 auto 16px',
                        }} />
                    )}

                    <p
                        contentEditable suppressContentEditableWarning
                        onBlur={e => handleCoverEdit('subtitle', e.currentTarget.textContent || '')}
                        style={{
                            fontSize: 'clamp(14px, 2.5vw, 17px)', color: t.subtitleColor,
                            lineHeight: 1.7, margin: 0, outline: 'none', cursor: 'text',
                        }}
                    >{cover.subtitle}</p>
                </div>

                {/* 하단 저자 (다크 테마) */}
                {isDark && (
                    <div style={{ zIndex: 1, textAlign: 'center', marginTop: theme === 'impact' ? 0 : 'auto', width: '100%' }}>
                        <span
                            contentEditable suppressContentEditableWarning
                            onBlur={e => handleCoverEdit('author', e.currentTarget.textContent || '')}
                            style={{ fontSize: 14, color: t.authorColor, outline: 'none', letterSpacing: 1 }}
                        >{authorName} 지음</span>
                    </div>
                )}

                {/* 미니멀 하단 */}
                {theme === 'minimal' && (
                    <div style={{ marginTop: 'auto', textAlign: 'center' }}>
                        <p style={{ fontSize: 11, color: '#a8a29e', margin: 0 }}>
                            {cover.subtitle ? '' : '큐리 AI · 전자책'}
                        </p>
                    </div>
                )}

                {/* 캐주얼 하단 저자 */}
                {theme === 'casual' && (
                    <div style={{ marginTop: 'auto', textAlign: 'center', padding: '12px 20px', background: 'rgba(99,102,241,0.1)', borderRadius: 12 }}>
                        <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>✨ {authorName}</span>
                    </div>
                )}

                {/* 편집 힌트 */}
                <div style={{
                    position: 'absolute', bottom: 8, right: 12,
                    fontSize: 9, color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                }}>클릭하여 직접 편집</div>
            </div>
        )
    }

    /* ── 페이지 렌더링 ── */
    const renderPage = (pageIndex: number) => {
        const page = { ...ebook.pages[pageIndex], ...(editedContent[pageIndex] || {}) }
        return (
            <div style={{
                width: '100%', height: '100%', padding: 'clamp(24px, 4vw, 40px)',
                boxSizing: 'border-box', background: t.pageBg, overflowY: 'auto', position: 'relative',
            }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 24, paddingBottom: 12, borderBottom: `2px solid ${t.accentLight}`,
                }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ebook.cover.title}
                    </span>
                    <span style={{ fontSize: 10, color: '#fff', background: t.pageAccent, padding: '3px 12px', borderRadius: 10, fontWeight: 600 }}>
                        Page {page.pageNum}
                    </span>
                </div>

                <h2
                    contentEditable suppressContentEditableWarning
                    onBlur={e => handleContentEdit(pageIndex, 'title', e.currentTarget.textContent || '')}
                    style={{
                        fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 700, color: '#0f172a',
                        margin: '0 0 20px', lineHeight: 1.4, wordBreak: 'keep-all', outline: 'none', cursor: 'text',
                    }}
                >{page.title}</h2>

                <div
                    contentEditable suppressContentEditableWarning
                    onBlur={e => handleContentEdit(pageIndex, 'content', e.currentTarget.innerText || '')}
                    style={{
                        fontSize: 'clamp(15px, 2.5vw, 18px)', color: '#334155',
                        lineHeight: 1.9, whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
                        outline: 'none', cursor: 'text', minHeight: 120,
                    }}
                >{page.content}</div>

                {page.quote && (
                    <div style={{ margin: '24px 0', padding: '16px 20px', borderLeft: `4px solid ${t.pageAccent}`, background: t.accentLight, borderRadius: '0 8px 8px 0' }}>
                        <p contentEditable suppressContentEditableWarning
                            onBlur={e => handleContentEdit(pageIndex, 'quote', e.currentTarget.textContent || '')}
                            style={{ fontSize: 16, color: t.pageAccent, fontStyle: 'italic', margin: 0, lineHeight: 1.7, outline: 'none' }}
                        >💡 {page.quote}</p>
                    </div>
                )}

                {page.cta && (
                    <div style={{ margin: '24px 0', padding: '20px 24px', background: t.accent, borderRadius: 12, textAlign: 'center' }}>
                        <p contentEditable suppressContentEditableWarning
                            onBlur={e => handleContentEdit(pageIndex, 'cta', e.currentTarget.textContent || '')}
                            style={{ fontSize: 15, color: '#fff', fontWeight: 700, margin: 0, lineHeight: 1.6, outline: 'none' }}
                        >{page.cta}</p>
                    </div>
                )}

                {page.checklist?.length ? (
                    <div style={{ margin: '24px 0', padding: '20px 24px', background: '#ecfdf5', border: '1px solid #86efac', borderRadius: 12 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#166534', margin: '0 0 12px' }}>✅ 당장 해야 할 미션</p>
                        {page.checklist.map((item, i) => (
                            <p key={i} style={{ fontSize: 13, color: '#15803d', margin: '8px 0', lineHeight: 1.6 }}>☐ {item}</p>
                        ))}
                    </div>
                ) : null}

                <button onClick={() => handleEditRequest(page.pageNum)} style={{
                    position: 'absolute', bottom: 16, right: 16, padding: '8px 16px', borderRadius: 20,
                    border: `1px solid ${t.accentLight}`, background: '#fff',
                    fontSize: 12, color: t.pageAccent, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}>✏️ AI에게 수정 요청</button>
            </div>
        )
    }

    /* ── 메인 레이아웃 ── */
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(12px)',
            display: 'flex', flexDirection: 'column',
            fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
        }}>
            {/* 상단 바 */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', background: 'rgba(0,0,0,0.5)',
                borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', padding: 4 }}>✕</button>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{ebook.cover.title}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>마지막 생성: {generatedAt} · 클릭하여 직접 편집</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowThemeMenu(!showThemeMenu)} style={{
                            padding: '5px 10px', borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)',
                            color: '#fff', fontSize: 11, cursor: 'pointer',
                        }}>🎨 테마</button>
                        {showThemeMenu && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: 6,
                                background: '#1e293b', borderRadius: 10, padding: 6,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 10, minWidth: 120,
                            }}>
                                {(Object.keys(THEMES) as ThemeKey[]).map(key => (
                                    <button key={key} onClick={() => { setTheme(key); setShowThemeMenu(false) }}
                                        style={{
                                            display: 'block', width: '100%', padding: '7px 10px',
                                            background: theme === key ? 'rgba(255,255,255,0.15)' : 'transparent',
                                            border: 'none', borderRadius: 6, color: '#fff',
                                            fontSize: 12, cursor: 'pointer', textAlign: 'left',
                                        }}
                                    >{theme === key ? '✓ ' : '  '}{THEMES[key].name}</button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button onClick={handleDownloadPdf} style={{
                        padding: '5px 12px', borderRadius: 8, border: 'none',
                        background: t.accent, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}>📄 PDF 다운로드</button>
                </div>
            </div>

            {/* 진행 바 */}
            <div style={{
                display: 'flex', justifyContent: 'center', gap: 5,
                padding: '8px 16px', background: 'rgba(0,0,0,0.3)', flexShrink: 0,
            }}>
                {Array.from({ length: totalPages }).map((_, i) => (
                    <button key={i} onClick={() => setCurrentPage(i)} style={{
                        width: i === currentPage ? 24 : 8, height: 6, borderRadius: 3,
                        border: 'none', cursor: 'pointer', transition: 'all 0.3s ease',
                        background: i === currentPage ? t.accent : i < currentPage ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
                    }} />
                ))}
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginLeft: 6 }}>
                    {currentPage === 0 ? '표지' : `${currentPage} / ${totalPages - 1}`}
                </span>
            </div>

            {/* 메인 콘텐츠 */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(8px, 2vw, 32px)', position: 'relative' }}>
                    {currentPage > 0 && (
                        <button onClick={goPrev} style={{
                            position: 'absolute', left: 'clamp(2px, 1.5vw, 16px)', top: '50%', transform: 'translateY(-50%)',
                            width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)',
                            background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 16, cursor: 'pointer', zIndex: 5,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>‹</button>
                    )}
                    <div style={{
                        width: 'min(100%, 560px)', height: 'min(100%, 780px)',
                        borderRadius: 8, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    }}>
                        {currentPage === 0 ? renderCover() : renderPage(currentPage - 1)}
                    </div>
                    {currentPage < totalPages - 1 && (
                        <button onClick={goNext} style={{
                            position: 'absolute', right: 'clamp(2px, 1.5vw, 16px)', top: '50%', transform: 'translateY(-50%)',
                            width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)',
                            background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 16, cursor: 'pointer', zIndex: 5,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>›</button>
                    )}
                </div>

                {/* 수정 채팅 패널 */}
                {showChat && (
                    <div style={{
                        width: 'min(360px, 40vw)', background: '#1e293b',
                        borderLeft: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex', flexDirection: 'column', flexShrink: 0,
                    }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>✏️ 수정 요청</span>
                            <button onClick={() => setShowChat(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                        </div>
                        <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
                            {chatHistory.length === 0 && (
                                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '0 0 12px', lineHeight: 1.5 }}>
                                    수정하고 싶은 내용을 입력하세요. AI가 즉시 반영합니다.
                                </p>
                            )}
                            {chatHistory.map((msg, i) => (
                                <div key={i} style={{
                                    marginBottom: 12,
                                    display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                }}>
                                    <div style={{
                                        maxWidth: '85%', padding: '8px 12px', borderRadius: 12,
                                        fontSize: 13, lineHeight: 1.5,
                                        ...(msg.role === 'user'
                                            ? { background: t.accent, color: '#fff', borderBottomRightRadius: 4 }
                                            : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', borderBottomLeftRadius: 4 }
                                        ),
                                    }}>{msg.content}</div>
                                </div>
                            ))}
                            {isEditing && (
                                <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
                                    <div style={{
                                        padding: '8px 16px', borderRadius: 12, borderBottomLeftRadius: 4,
                                        background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)',
                                        fontSize: 13,
                                    }}>
                                        <span style={{ display: 'inline-block', animation: 'pulse 1.5s infinite' }}>✨ 수정 중...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>
                        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSendEdit()}
                                    placeholder={isEditing ? '수정 중...' : '수정할 내용을 입력하세요'}
                                    disabled={isEditing}
                                    style={{
                                        flex: 1, padding: '10px 14px', borderRadius: 8,
                                        border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)',
                                        color: '#fff', fontSize: 13, outline: 'none',
                                        opacity: isEditing ? 0.5 : 1,
                                    }} autoFocus />
                                <button onClick={handleSendEdit} disabled={isEditing} style={{
                                    padding: '10px 16px', borderRadius: 8, border: 'none',
                                    background: isEditing ? 'rgba(255,255,255,0.2)' : t.accent,
                                    color: '#fff', fontSize: 13, fontWeight: 600, cursor: isEditing ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                                }}>{isEditing ? '⏳' : '전송'}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
