// 인사이트 DB 쿼리

import { createAdminClient } from '@/lib/supabase/admin'
import type { Insight } from './types'

/** 세션별 인사이트 조회 */
export async function getInsightsBySession(sessionId: string): Promise<Insight[]> {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('insights')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[Insight] Query error:', error)
        return []
    }
    return data || []
}

/** 인사이트 ID로 조회 (공유 페이지용) */
export async function getInsightById(id: string): Promise<Insight | null> {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('insights')
        .select('*')
        .eq('id', id)
        .single()

    if (error) {
        console.error('[Insight] Get by ID error:', error)
        return null
    }
    return data
}

/** 인사이트 저장 */
export async function saveInsight(insight: Omit<Insight, 'id' | 'created_at'>): Promise<Insight | null> {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('insights')
        .insert(insight)
        .select()
        .single()

    if (error) {
        console.error('[Insight] Save error:', error)
        return null
    }
    return data
}

/** 사용자의 전체 인사이트 조회 */
export async function getInsightsByUser(userId: string): Promise<Insight[]> {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('insights')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

    if (error) {
        console.error('[Insight] User query error:', error)
        return []
    }
    return data || []
}
