'use client'
// /os 첫 화면 = 팀이 있으면 첫 봇 대화로, 없으면 「목표 말하고 팀 만들기」 (그록봇 Empty 문법)

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useOsTeam } from '@/components/os/OsShell'
import BotAvatar from '@/components/os/BotAvatar'
import { readHomeDraft } from '@/domains/home/draft-store'

export default function OsHome() {
    const { team, loading, guest } = useOsTeam()
    const router = useRouter()
    const first = team.find(b => !b.hidden)

    // /os 는 「첫 봇 대화로 가는 문」이라 자기 자리를 첫 봇 주소로 바꾼다(replace). 그래서 뒤로 가기 목록엔 /os 가 안 남고
    // 봇 마켓, 설정에서 뒤로를 누르면 곧장 직전 대화로 돌아온다. 이 replace 는 /os 에서만, 다른 화면에선 자동 이동이 없다.
    useEffect(() => {
        if (loading) return
        const demo = new URLSearchParams(window.location.search).get('demo') === '1'
        // 주소를 넣어 두고 로그인하고 온 분 = 주소 넣기 화면이 이어 만든다 (1003)
        if (!guest && !demo && readHomeDraft(window.localStorage)) { router.replace('/os/make'); return }
        if (guest && !demo) {
            // 손님(로그인 전) 첫 경험 = OS 안 주소 넣기 (대표 확정 1003 「OS UI에 다 옮겨놔」). 옛 /os/welcome 은 남겨 둠
            router.replace('/os/make')
            return
        }
        if (first) {
            router.replace(`/os/chat/${first.mentorId}${demo ? '?demo=1' : ''}`)
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
                    : <button className="os-cta" onClick={() => router.push('/os/make')}>＋ 첫 봇 만들기</button>}
            </div>
        </div>
    )
}
