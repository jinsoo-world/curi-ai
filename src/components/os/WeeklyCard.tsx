'use client'
// 오른쪽 세부칸 맨 아래 「이번 주」 카드 = 그록봇 「주간 로스터 리뷰」의 아주 작은 첫 판.
// 숫자는 전부 /api/os/weekly 가 세고, 여기는 보여 주기만 한다.
// 규칙 = 숫자에 분모가 있으면 같이 쓴다(3/7일). 분모 없는 숫자는 혼자 크게 보인다.

import { useEffect, useState } from 'react'
import type { WeeklySummary } from '@/domains/os/weekly'
import { EMPTY_WEEK } from '@/domains/os/weekly'

export default function WeeklyCard() {
    const [week, setWeek] = useState<WeeklySummary | null>(null)
    const [guest, setGuest] = useState(false)

    useEffect(() => {
        let alive = true
        fetch('/api/os/weekly', { cache: 'no-store' })
            .then(r => r.json())
            .then(d => { if (!alive) return; setWeek(d.week ?? EMPTY_WEEK); setGuest(!!d.guest) })
            .catch(() => { if (alive) setWeek(EMPTY_WEEK) })
        return () => { alive = false }
    }, [])

    if (!week || guest) return null

    const 줄: { 이름: string; 값: string }[] = [
        { 이름: '미룬 일', 값: week.openNextSteps === 0 ? '없어요' : `${week.openNextSteps}개` },
        ...(week.openNextSteps > 0 ? [{ 이름: '가장 오래된 것', 값: `${week.oldestDays}일째` }] : []),
        { 이름: '승인 카드 처리', 값: `${week.approvalsDecided}건` },
        { 이름: '체크인', 값: `${week.checkinDays}/7일` },
        { 이름: '봇이 새로 읽은 자료', 값: `${week.knowledgeRead}개` },
    ]

    return (
        <>
            <h4>이번 주</h4>
            <div className="os-card">
                {줄.map(r => (
                    <div key={r.이름} className="os-week-row">
                        <span>{r.이름}</span>
                        <b>{r.값}</b>
                    </div>
                ))}
                <div style={{ fontSize: 12, color: 'var(--os-글-흐림)', marginTop: 8, lineHeight: 1.5 }}>
                    이번 주 월요일부터 오늘까지 센 숫자예요.
                </div>
            </div>
        </>
    )
}
