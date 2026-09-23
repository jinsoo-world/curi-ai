export const revalidate = 30 // 30초마다 재생성 (ISR) — 멘토 변경사항 빠르게 반영

import type { Metadata } from 'next'
import { getActiveMentors } from '@/domains/mentor'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLinkCounts } from '@/domains/os/team-link'
import MentorsPageClient from './MentorsPageClient'

/**
 * 대표 지적 2026-09-22 = 클릭 시 404 발생, Delphi Discover 레이아웃으로 변경 필요
 * - 실제 DB 멘토만 표시 (fallbackMentors 제거)
 * - 링크를 /chat/{uuid}로 수정 (실제 UUID 사용)
 * - Delphi 레이아웃: 검색 + 카테고리 칩 + 큰 포트레이트 캐러셀 + 질문 리스트
 * - 실제 유저 멘토를 먼저 표시 (sort_order >= 0, creator_id 있음)
 */
export const metadata: Metadata = {
    title: 'AI 발견하기',
    description: '당신에게 필요한 AI 멘토를 만나보세요. 콘텐츠 수익화, 브랜딩, 글쓰기 전문가들과 대화할 수 있습니다.',
    openGraph: {
        title: 'AI 발견하기 | 큐리 AI',
        description: '당신에게 필요한 AI 멘토를 만나보세요.',
    },
}

export default async function MentorsPage() {
    const mentors = await getActiveMentors()
    
    // CEO 요구: 실제 유저 멘토를 먼저 표시 (sort_order >= 0, creator_id 있음)
    // 그 다음 시스템 코치 (sort_order < 0)
    const sortedMentors = [...mentors].sort((a, b) => {
        const aIsCreator = (a.sort_order ?? 0) >= 0 || !!a.creator_id
        const bIsCreator = (b.sort_order ?? 0) >= 0 || !!b.creator_id
        
        if (aIsCreator && !bIsCreator) return -1
        if (!aIsCreator && bIsCreator) return 1
        
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    })

    // 「N명이 팀에 넣었어요」 — 뷰에서 한 번에 센다. 뷰가 없으면 전부 0(화면은 그대로 뜬다)
    const linkCounts: Record<string, number> = {}
    try {
        const counts = await getLinkCounts(createAdminClient(), sortedMentors.map(m => m.id))
        for (const [id, c] of counts) linkCounts[id] = c.linkCount
    } catch { /* 열쇠 없음 등 — 배지만 비운다 */ }

    return <MentorsPageClient mentors={sortedMentors} linkCounts={linkCounts} />
}
