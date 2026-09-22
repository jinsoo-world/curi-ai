'use client'
// /os 첫 화면 = 팀이 있으면 첫 봇 대화로, 없으면 「목표 말하고 팀 만들기」 (그록봇 Empty 문법)

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useOsTeam } from '@/components/os/OsShell'
import BotAvatar from '@/components/os/BotAvatar'

export default function OsHome() {
    const { team, loading, guest, openNewBot } = useOsTeam()
    const router = useRouter()
    const first = team.find(b => !b.hidden)

    useEffect(() => {
        if (loading) return
        const demo = new URLSearchParams(window.location.search).get('demo') === '1'
        if (first) {
            router.replace(`/os/chat/${first.mentorId}${demo ? '?demo=1' : ''}`)
        } else if (guest && !demo) {
            // 손님(로그인 전)은 소개 화면부터. 둘러보기(?demo=1)는 그대로 시연 팀으로 간다
            router.replace('/os/welcome')
        }
    }, [loading, first, guest, router])

    if (loading) return <div className="os-empty">불러오는 중…</div>
    if (first) return null

    return (
        <div className="os-empty">
            <div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 18 }}>
                    <BotAvatar shape="clover" color="green" state="idle" size={64} />
                    <BotAvatar shape="circle" color="orange" state="sleeping" size={64} />
                    <BotAvatar shape="hex" color="blue" state="sleeping" size={64} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--os-글)' }}>아직 팀이 없어요</div>
                <div style={{ marginTop: 6 }}>봇 하나에 일 하나. 첫 봇은 「내가 매일 말하는 한 명」이면 좋아요.</div>
                {guest
                    ? <Link href="/login?next=/os" className="os-cta" style={{ textDecoration: 'none' }}>로그인하고 팀 만들기</Link>
                    : <button className="os-cta" onClick={openNewBot}>＋ 첫 봇 만들기</button>}
            </div>
        </div>
    )
}
