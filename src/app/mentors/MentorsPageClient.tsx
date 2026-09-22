'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MENTOR_IMAGES } from '@/domains/mentor'

// 카테고리 목록
const categories = [
    { key: 'all', label: '전체' },
    { key: 'money', label: '돈 벌기', keywords: ['수익', '돈', '블로그', '세일즈', '협상', '마케팅', '창업'] },
    { key: 'write', label: '글·책', keywords: ['책', '출판', '글', '원고', '전자책', '콘텐츠'] },
    { key: 'tool', label: 'AI·도구', keywords: ['AI', '구글', '문서', '도구', '자동화'] },
    { key: 'mind', label: '마음', keywords: ['상담', '공감', '고민', '마음', '조언'] },
]

export default function MentorsPageClient({ mentors }: { mentors: any[] }) {
    const [searchQuery, setSearchQuery] = useState('')
    const [activeCategory, setActiveCategory] = useState('all')

    // 필터링된 멘토 목록
    const filteredMentors = useMemo(() => {
        let result = mentors

        // 카테고리 필터
        if (activeCategory !== 'all') {
            const category = categories.find(c => c.key === activeCategory)
            if (category && 'keywords' in category) {
                result = result.filter(m => {
                    const text = `${m.name} ${m.title || ''} ${m.description || ''} ${(m.expertise || []).join(' ')}`
                    return category.keywords!.some(keyword => text.includes(keyword))
                })
            }
        }

        // 검색어 필터
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim()
            result = result.filter(m => {
                const text = `${m.name} ${m.title || ''} ${m.description || ''}`.toLowerCase()
                return text.includes(query)
            })
        }

        return result
    }, [mentors, activeCategory, searchQuery])

    // 실제 DB 멘토가 없으면 빈 상태 표시
    if (mentors.length === 0) {
        return (
            <div style={{ minHeight: '100dvh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
                <div style={{ textAlign: 'center', maxWidth: 400 }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>🔍</div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>아직 멘토가 없어요</h2>
                    <p style={{ fontSize: 16, color: '#64748b', lineHeight: 1.6 }}>곧 멋진 멘토들을 만나실 수 있을 거예요!</p>
                </div>
            </div>
        )
    }

    return (
        <div style={{ minHeight: '100dvh', background: '#fff' }}>
            {/* 상단 헤더 */}
            <header style={{
                background: '#1C2321',
                color: '#fff',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: '#fff' }}>
                    <Image src="/logo.png" alt="큐리 AI" width={32} height={32} style={{ borderRadius: 6 }} />
                    <span style={{ fontSize: 20, fontWeight: 800 }}>큐리 AI</span>
                </Link>
                <Link href="/" style={{ fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none' }}>
                    홈으로
                </Link>
            </header>

            {/* 메인 컨테이너 */}
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>
                {/* 검색바 */}
                <div style={{ marginBottom: 24 }}>
                    <input
                        type="text"
                        placeholder="멘토 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            maxWidth: 600,
                            padding: '14px 20px',
                            fontSize: 16,
                            border: '1px solid #e5e7eb',
                            borderRadius: 12,
                            outline: 'none',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={(e) => e.currentTarget.style.borderColor = '#1C2321'}
                        onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                    />
                </div>

                {/* 카테고리 칩 */}
                <div style={{
                    display: 'flex',
                    gap: 10,
                    marginBottom: 32,
                    overflowX: 'auto',
                    paddingBottom: 8,
                }}>
                    {categories.map((category) => (
                        <button
                            key={category.key}
                            onClick={() => setActiveCategory(category.key)}
                            style={{
                                padding: '10px 20px',
                                fontSize: 15,
                                fontWeight: 600,
                                border: 'none',
                                borderRadius: 20,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.2s',
                                background: activeCategory === category.key ? '#1C2321' : '#f3f4f6',
                                color: activeCategory === category.key ? '#fff' : '#374151',
                            }}
                        >
                            {category.label}
                        </button>
                    ))}
                </div>

                {/* 큰 포트레이트 카드 캐러셀 */}
                <div style={{ marginBottom: 48 }}>
                    <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20, color: '#1e293b' }}>
                        멘토 찾기
                    </h2>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: 20,
                    }}>
                        {filteredMentors.slice(0, 5).map((mentor) => {
                            const avatarUrl = mentor.avatar_url || MENTOR_IMAGES[mentor.name] || null
                            return (
                                <Link
                                    key={mentor.id}
                                    href={`/chat/${mentor.id}`}
                                    style={{
                                        position: 'relative',
                                        aspectRatio: '3/4',
                                        borderRadius: 20,
                                        overflow: 'hidden',
                                        textDecoration: 'none',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                        transition: 'transform 0.2s, box-shadow 0.2s',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-4px)'
                                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)'
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)'
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                                    }}
                                >
                                    {avatarUrl && (
                                        <Image
                                            src={avatarUrl}
                                            alt={mentor.name}
                                            fill
                                            sizes="(max-width: 768px) 50vw, 200px"
                                            style={{ objectFit: 'cover' }}
                                        />
                                    )}
                                    {!avatarUrl && (
                                        <div style={{
                                            width: '100%',
                                            height: '100%',
                                            background: 'linear-gradient(135deg, #E8F2EC 0%, #C7E4D3 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 64,
                                            fontWeight: 900,
                                            color: '#1C2321',
                                        }}>
                                            {mentor.name.slice(0, 1)}
                                        </div>
                                    )}
                                    {/* 하단 그라데이션 + 이름/직함 */}
                                    <div style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        padding: '40px 16px 16px',
                                        background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)',
                                        color: '#fff',
                                    }}>
                                        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                                            {mentor.name}
                                        </div>
                                        {mentor.title && (
                                            <div style={{ fontSize: 13, opacity: 0.9 }}>
                                                {mentor.title}
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                </div>

                {/* 질문 리스트 */}
                <div>
                    <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: '#1e293b' }}>
                        이런 걸 물어보세요
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {filteredMentors.map((mentor) => {
                            const avatarUrl = mentor.avatar_url || MENTOR_IMAGES[mentor.name] || null
                            const questions = Array.isArray(mentor.sample_questions) ? mentor.sample_questions.slice(0, 1) : []
                            
                            if (questions.length === 0) return null

                            return questions.map((question: string, idx: number) => (
                                <Link
                                    key={`${mentor.id}-${idx}`}
                                    href={`/chat/${mentor.id}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 16,
                                        padding: '16px 20px',
                                        background: '#fff',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: 12,
                                        textDecoration: 'none',
                                        color: '#1e293b',
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = '#1C2321'
                                        e.currentTarget.style.background = '#f9fafb'
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = '#e5e7eb'
                                        e.currentTarget.style.background = '#fff'
                                    }}
                                >
                                    {/* 아바타 */}
                                    <div style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: '50%',
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                        background: '#f3f4f6',
                                    }}>
                                        {avatarUrl && (
                                            <Image
                                                src={avatarUrl}
                                                alt={mentor.name}
                                                width={48}
                                                height={48}
                                                style={{ objectFit: 'cover' }}
                                            />
                                        )}
                                        {!avatarUrl && (
                                            <div style={{
                                                width: '100%',
                                                height: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 20,
                                                fontWeight: 700,
                                                color: '#1C2321',
                                            }}>
                                                {mentor.name.slice(0, 1)}
                                            </div>
                                        )}
                                    </div>

                                    {/* 이름 + 직함 + 질문 */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                                                {mentor.name}
                                            </span>
                                            {mentor.title && (
                                                <span style={{ fontSize: 13, color: '#64748b' }}>
                                                    {mentor.title}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 15, color: '#374151', lineHeight: 1.5 }}>
                                            {question}
                                        </div>
                                    </div>
                                </Link>
                            ))
                        })}
                    </div>
                </div>

                {/* 필터링 결과가 없을 때 */}
                {filteredMentors.length === 0 && (
                    <div style={{
                        textAlign: 'center',
                        padding: '60px 20px',
                    }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                            검색 결과가 없어요
                        </h3>
                        <p style={{ fontSize: 16, color: '#64748b' }}>
                            다른 키워드로 검색해보세요
                        </p>
                    </div>
                )}
            </div>

            {/* 반응형 스타일 */}
            <style jsx>{`
                @media (max-width: 768px) {
                    input {
                        font-size: 14px !important;
                    }
                }
            `}</style>
        </div>
    )
}
