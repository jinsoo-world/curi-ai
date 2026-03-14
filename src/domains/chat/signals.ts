// domains/chat/signals — 대화 외부 신호 감지 & 저장
// OpenClaw-RL 영감: 에이전트의 모든 인터랙션에서 학습 신호를 포착

import type { SupabaseClient } from '@supabase/supabase-js'

// 신호 타입 정의
export type SignalType =
    | 're_question'        // 유사 질문 재질문
    | 'early_exit'         // 1~2턴 후 이탈
    | 'long_session'       // 10턴 이상 긴 대화 (긍정)
    | 'negative_feedback'  // 👎 피드백
    | 'topic_gap'          // AI가 "잘 모르겠다" 응답

interface SignalData {
    [key: string]: string | number | boolean | null
}

/**
 * 신호 저장 (서비스 롤 클라이언트 사용)
 */
export async function saveSignal(
    db: SupabaseClient,
    params: {
        sessionId: string
        mentorId: string
        userId: string
        signalType: SignalType
        signalData?: SignalData
    }
) {
    const { error } = await db.from('conversation_signals').insert({
        session_id: params.sessionId,
        mentor_id: params.mentorId,
        user_id: params.userId,
        signal_type: params.signalType,
        signal_data: params.signalData || {},
    })
    if (error) {
        console.error('[Signals] saveSignal error:', JSON.stringify(error))
    }
}

/**
 * 🔍 조기 이탈 감지 — 세션 메시지가 1~2개면 이탈로 판단
 * 세션 종료(페이지 떠남) 시 호출
 */
export async function detectEarlyExit(
    db: SupabaseClient,
    sessionId: string,
    mentorId: string,
    userId: string,
    messageCount: number,
) {
    // 유저 메시지 1~2개 = 조기 이탈 (0은 아예 대화 안 한 것이라 무시)
    if (messageCount >= 1 && messageCount <= 2) {
        await saveSignal(db, {
            sessionId,
            mentorId,
            userId,
            signalType: 'early_exit',
            signalData: {
                message_count: messageCount,
                reason: '세션 메시지 1~2개 후 이탈',
            },
        })
        return true
    }
    return false
}

/**
 * 🎉 긴 대화 감지 — 10턴 이상이면 만족 신호
 */
export async function detectLongSession(
    db: SupabaseClient,
    sessionId: string,
    mentorId: string,
    userId: string,
    messageCount: number,
) {
    // 유저+AI 합산 20 이상 = 10턴 이상
    if (messageCount >= 20) {
        // 이미 이 세션에 long_session 기록했는지 확인
        const { data: existing } = await db
            .from('conversation_signals')
            .select('id')
            .eq('session_id', sessionId)
            .eq('signal_type', 'long_session')
            .limit(1)

        if (!existing || existing.length === 0) {
            await saveSignal(db, {
                sessionId,
                mentorId,
                userId,
                signalType: 'long_session',
                signalData: {
                    message_count: messageCount,
                    reason: '10턴 이상 활발한 대화',
                },
            })
            return true
        }
    }
    return false
}

/**
 * 🕳️ 토픽 갭 감지 — AI 응답에 "잘 모르겠다" 류의 표현 탐지
 */
export function detectTopicGap(aiResponse: string): {
    isGap: boolean
    matchedPhrase: string | null
} {
    const gapPhrases = [
        '잘 모르겠',
        '정확히 알지 못',
        '제 전문 분야가 아닌',
        '전문 영역 밖',
        '명확한 답을 드리기 어려',
        '해당 분야에 대한 지식이',
        '정보가 부족하여',
        '확실하게 말씀드리기',
        '제가 답변드리기 어려운',
        '다른 전문가에게',
    ]

    for (const phrase of gapPhrases) {
        if (aiResponse.includes(phrase)) {
            return { isGap: true, matchedPhrase: phrase }
        }
    }
    return { isGap: false, matchedPhrase: null }
}

/**
 * 토픽 갭 신호 저장
 */
export async function saveTopicGapSignal(
    db: SupabaseClient,
    sessionId: string,
    mentorId: string,
    userId: string,
    userQuestion: string,
    aiResponse: string,
    matchedPhrase: string,
) {
    await saveSignal(db, {
        sessionId,
        mentorId,
        userId,
        signalType: 'topic_gap',
        signalData: {
            user_question: userQuestion.slice(0, 200),
            ai_response_preview: aiResponse.slice(0, 200),
            matched_phrase: matchedPhrase,
        },
    })
}

/**
 * 🔄 재질문 감지 — 같은 세션에서 유사한 질문이 반복되면 감지
 * (간단 버전: 단어 겹침 비율로 판단)
 */
export function isSimilarQuestion(
    newQuestion: string,
    previousQuestions: string[],
    threshold: number = 0.6,
): { isSimilar: boolean; similarTo: string | null } {
    const newWords = new Set(
        newQuestion.split(/\s+/).filter(w => w.length > 1)
    )

    for (const prev of previousQuestions) {
        const prevWords = new Set(
            prev.split(/\s+/).filter(w => w.length > 1)
        )

        if (newWords.size === 0 || prevWords.size === 0) continue

        // 교집합 비율
        let overlap = 0
        for (const word of newWords) {
            if (prevWords.has(word)) overlap++
        }

        const similarity = overlap / Math.max(newWords.size, prevWords.size)

        if (similarity >= threshold) {
            return { isSimilar: true, similarTo: prev }
        }
    }

    return { isSimilar: false, similarTo: null }
}

/**
 * 크리에이터용 — 멘토별 신호 통계 조회
 */
export async function getSignalStats(
    db: SupabaseClient,
    mentorId: string,
    days: number = 30,
) {
    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data, error } = await db
        .from('conversation_signals')
        .select('signal_type, signal_data, created_at')
        .eq('mentor_id', mentorId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[Signals] getSignalStats error:', JSON.stringify(error))
        return null
    }

    // 타입별 집계
    const stats = {
        total: data?.length || 0,
        re_question: 0,
        early_exit: 0,
        long_session: 0,
        negative_feedback: 0,
        topic_gap: 0,
        topic_gaps: [] as { question: string; date: string }[],
        recent: data?.slice(0, 20) || [],
    }

    for (const signal of data || []) {
        const type = signal.signal_type as SignalType
        stats[type] = (stats[type] || 0) + 1

        if (type === 'topic_gap' && signal.signal_data) {
            const sd = signal.signal_data as Record<string, string>
            stats.topic_gaps.push({
                question: sd.user_question || '',
                date: signal.created_at,
            })
        }
    }

    return stats
}
