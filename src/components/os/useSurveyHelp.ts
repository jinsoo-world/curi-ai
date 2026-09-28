'use client'
// 가입 온보딩 화면 3 에서 고른 「먼저 맡길 일」(첫 번째)을 첫 봇의 첫 대화 화면에 쓴다 (대표 승인 0928).
// 온보딩이 고른 첫 봇(SURVEY_BOT)에서만 보인다. 첫 메시지를 보내면 FIRST_SENT 표시가 남아 다시 안 뜬다.
// 이 기기 안에서만 기억한다.

import { useEffect, useState } from 'react'
import {
    FIRST_SENT_LOCAL_KEY, SURVEY_EVENT, SURVEY_LOCAL_KEY, SURVEY_BOT_LOCAL_KEY, isUseCase, type UseCase,
} from '@/domains/os/onboarding'

type Help = { help: UseCase; botMentorId: string | null }

function readHelp(): Help | null {
    try {
        if (localStorage.getItem(FIRST_SENT_LOCAL_KEY)) return null
        const v = localStorage.getItem(SURVEY_LOCAL_KEY)
        return isUseCase(v) ? { help: v, botMentorId: localStorage.getItem(SURVEY_BOT_LOCAL_KEY) } : null
    } catch {
        return null
    }
}

/** 서버 첫 그림과 맞추려고 처음엔 null, 효과에서 한 박자 뒤에 읽는다. mentorId 봇이 온보딩이 고른 첫 봇일 때만 값이 있다 */
export function useSurveyHelp(mentorId: string | null | undefined): UseCase | null {
    const [help, setHelp] = useState<Help | null>(null)
    useEffect(() => {
        const sync = () => setHelp(readHelp())
        void Promise.resolve().then(sync)
        window.addEventListener(SURVEY_EVENT, sync)
        return () => window.removeEventListener(SURVEY_EVENT, sync)
    }, [])
    if (!help || !mentorId) return null
    return !help.botMentorId || help.botMentorId === mentorId ? help.help : null
}

/** 첫 메시지를 보낼 때 부른다. 이후엔 설문 칩과 예시를 안 보여 준다 */
export function markFirstSent(): void {
    try {
        if (localStorage.getItem(FIRST_SENT_LOCAL_KEY)) return
        localStorage.setItem(FIRST_SENT_LOCAL_KEY, String(Date.now()))
        window.dispatchEvent(new Event(SURVEY_EVENT))
    } catch { /* 저장소가 막힌 브라우저는 넘어간다 */ }
}
