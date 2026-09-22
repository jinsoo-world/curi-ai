'use client'
// 손님(로그인 전) 왼쪽 명단 = 리더들이 만든 공개 봇 3개를 「둘러보기」 타일로 보여준다.
// 이름·얼굴은 /api/mentors/[id] 에서 가져오고, 못 가져오면 여기 적힌 이름으로 그린다.
// 손님이 타일을 누르면 그 봇과 바로 대화할 수 있다(손님 대화는 저장하지 않는다).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BotColor, BotShape } from '@/domains/os/types'
import BotAvatar from './BotAvatar'

interface Seed { mentorId: string; name: string; shape: BotShape; color: BotColor }
interface Loaded { name: string; title: string | null; avatarUrl: string | null }

// 리더 공개 봇 3개 (시연 팀과 같은 명단). 모양·색은 캐릭터용이라 여기서 정한다
const SEEDS: Seed[] = [
    { mentorId: '118bef35-26bc-4118-a446-aa96e977f9ee', name: '오재현', shape: 'clover', color: 'green' },
    { mentorId: '20728d0a-2aed-4c4c-bc48-f26be076d0bc', name: '임보라', shape: 'circle', color: 'orange' },
    { mentorId: '264ae26a-1b77-489c-abbd-9662b0b42e4c', name: '유선희', shape: 'hex', color: 'blue' },
]

export default function GuestRoster() {
    const router = useRouter()
    const [loaded, setLoaded] = useState<Record<string, Loaded>>({})

    useEffect(() => {
        let alive = true
        SEEDS.forEach(s => {
            fetch(`/api/mentors/${s.mentorId}`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    const m = d?.mentor
                    if (!alive || !m) return
                    setLoaded(prev => ({ ...prev, [s.mentorId]: { name: m.name ?? s.name, title: m.title ?? null, avatarUrl: m.avatar_url ?? null } }))
                })
                .catch(() => { /* 못 가져오면 기본 이름으로 그린다 */ })
        })
        return () => { alive = false }
    }, [])

    return (
        <div className="os-guest-roster">
            <div className="os-guest-roster-title">둘러보기: 리더들이 만든 공개 봇</div>
            <div className="os-roster" role="list" style={{ padding: 0, overflow: 'visible', flex: 'none' }}>
                {SEEDS.map(s => {
                    const m = loaded[s.mentorId]
                    const name = m?.name ?? s.name
                    return (
                        <button
                            key={s.mentorId}
                            role="listitem"
                            className="os-bot-tile"
                            title={m?.title ?? name}
                            onClick={() => router.push(`/os/chat/${s.mentorId}`)}
                        >
                            <BotAvatar shape={s.shape} color={s.color} state="idle" size={64} faceUrl={m?.avatarUrl ?? null} />
                            <span className="os-bot-name">{name}</span>
                            {m?.title && <span className="os-chip">{m.title}</span>}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
