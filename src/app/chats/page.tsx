'use client'

/**
 * 채팅 — 렌트리 채팅 화면을 본떠 다시 짰다 (대표 지시 2026-09-16)
 *
 * 대표 지시 = 「채팅은 이 UI가 아니잖아. 렌트리처럼 만들어」 「중복인 거 정리하고, 깔끔하게 직관적으로 하라」
 *
 * 전에는 —
 *   화면 절반을 초록 큰 띠가 먹고, 그 아래 코치별로 접혔다 펴지는 서랍이 또 있었다.
 *   한 대화를 열려면 코치를 펴고(한 번) 대화를 고르고(두 번) 들어가야 했다.
 *   지우는 단추도 코치마다 하나, 대화마다 하나 두 벌이었다.
 *
 * 렌트리는 —
 *   제목 한 줄, 그 아래 방 카드가 최신순으로 쭉. 한 번 누르면 바로 들어간다.
 *   방이 없으면 빈 화면에 「다음에 할 일」 단추가 하나 있다.
 *
 * 그래서 접는 서랍과 코치별 묶음을 걷고 **대화 한 개 = 카드 한 장**으로 폈다.
 * 지우기는 대화마다 하나만 남긴다(코치별 일괄 지우기는 뺐다. 같은 일을 두 벌로 하던 것).
 */

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { MembershipBanner } from '@/components/MembershipBanner'
import AppSidebar from '@/components/AppSidebar'

const MENTOR_IMAGES: Record<string, string> = {
    '열정진': '/mentors/passion-jjin.png',
    '글담쌤': '/mentors/geuldam.jpg',
    'Cathy': '/mentors/cathy.jpeg',
    '봉이 김선달': '/mentors/bongi-kimsundal.png',
    '신사임당': '/mentors/shin-saimdang.png',
}

interface 대화 {
    id: string
    mentor_id: string
    mentor_name: string
    mentor_avatar_url: string | null
    last_message_at: string
    message_count: number
    topic: string
}

function 지난시간(값: string) {
    const 그때 = new Date(값).getTime()
    const 분 = Math.floor((Date.now() - 그때) / 60000)
    if (분 < 1) return '방금 전'
    if (분 < 60) return `${분}분 전`
    const 시간 = Math.floor(분 / 60)
    if (시간 < 24) return `${시간}시간 전`
    const 날 = Math.floor(시간 / 24)
    if (날 < 30) return `${날}일 전`
    if (날 < 365) return `${Math.floor(날 / 30)}개월 전`
    return `${Math.floor(날 / 365)}년 전`
}

function 줄임(글: string, 최대 = 42) {
    if (!글) return ''
    const 깨끗 = 글.replace(/\n/g, ' ').replace(/\*\*/g, '').trim()
    return 깨끗.length <= 최대 ? 깨끗 : 깨끗.slice(0, 최대) + '…'
}

export default function ChatsPage() {
    const [대화들, set대화들] = useState<대화[]>([])
    const [부르는중, set부르는중] = useState(true)
    const [로그인함, set로그인함] = useState<boolean | null>(null)

    const 불러오기 = useCallback(async () => {
        const supabase = createClient()
        // getUser() 는 부를 때마다 서버에 토큰을 확인하러 간다. 화면을 여는 데는 session 이면 충분하고
        // 남의 대화가 새지 않는 것은 데이터베이스 규칙(RLS)이 막는다 — 2026-09-16
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user ?? null
        set로그인함(!!user)
        if (!user) { set부르는중(false); return }

        const { data } = await supabase
            .from('chat_sessions')
            .select('id, mentor_id, created_at, last_message_at, message_count, title, mentors ( name, avatar_url, is_active )')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .gt('message_count', 0)
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(50)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const 산것 = (data ?? []).filter((s: any) => s.mentors != null && s.mentors.is_active !== false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const 첫판: 대화[] = 산것.map((s: any) => ({
            id: s.id,
            mentor_id: s.mentor_id,
            mentor_name: s.mentors?.name || '코치',
            mentor_avatar_url: s.mentors?.avatar_url || null,
            last_message_at: s.last_message_at || s.created_at,
            message_count: s.message_count || 0,
            topic: !s.title || s.title.endsWith('와의 대화') ? '' : s.title,
        }))
        set대화들(첫판)
        set부르는중(false)

        // 제목이 없는 대화는 첫 질문을 가져와 채운다 (뒤에서 조용히)
        const 빈것 = 첫판.filter((s) => !s.topic)
        for (let i = 0; i < 빈것.length; i += 10) {
            const 묶음 = 빈것.slice(i, i + 10)
            const 결과 = await Promise.all(묶음.map(async (s) => {
                const { data: 첫줄 } = await supabase
                    .from('messages').select('content')
                    .eq('session_id', s.id).eq('role', 'user')
                    .order('created_at', { ascending: true }).limit(1).maybeSingle()
                return { id: s.id, topic: 첫줄?.content || '' }
            }))
            set대화들((앞) => 앞.map((s) => {
                const 찾음 = 결과.find((r) => r.id === s.id)
                return 찾음 && 찾음.topic ? { ...s, topic: 찾음.topic } : s
            }))
        }
    }, [])

    useEffect(() => { void 불러오기() }, [불러오기])

    const 지우기 = async (id: string) => {
        if (!confirm('이 대화를 지울까요? 되돌릴 수 없습니다.')) return
        const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
        if (res.ok) set대화들((앞) => 앞.filter((s) => s.id !== id))
        else alert('지우지 못했어요. 잠시 뒤 다시 해주세요.')
    }

    return (
        <main style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <MembershipBanner />
            <AppSidebar />

            {/* 대화방(헤더 960·입력창 900)과 폭을 맞춘다 — 대표 지시 2026-09-16 「클릭 시 들어가는 대화랑 UI 크기 싱크 맞춰」 */}
            <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 18px 40px' }}>
                <h1 style={{ fontSize: 'var(--글자-대)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 6px' }}>
                    채팅
                </h1>
                <p style={{ fontSize: 'var(--글자-작)', color: 'var(--먹연)', margin: '0 0 20px', lineHeight: 1.6 }}>
                    코치와 나눈 이야기가 여기 쌓입니다. 누르면 그 자리에서 이어서 물어볼 수 있어요.
                </p>

                {부르는중 && (
                    <p style={{ fontSize: 15, color: 'var(--먹연)' }}>불러오는 중입니다</p>
                )}

                {!부르는중 && 로그인함 === false && (
                    <빈칸
                        제목="로그인하면 지난 이야기가 보여요"
                        설명="주고받은 이야기는 로그인한 분의 것만 남습니다."
                        단추="로그인하기"
                        주소="/login"
                    />
                )}

                {!부르는중 && 로그인함 && 대화들.length === 0 && (
                    <빈칸
                        제목="아직 나눈 이야기가 없어요"
                        설명="코치에게 한 가지만 물어보세요. 여기에 그대로 남아 이어집니다."
                        단추="코치 고르러 가기"
                        주소="/mentors"
                    />
                )}

                {대화들.map((s) => {
                    const 사진 = s.mentor_avatar_url || MENTOR_IMAGES[s.mentor_name] || null
                    return (
                        <div key={s.id} style={{ position: 'relative', marginBottom: 10 }}>
                            <Link
                                href={`/chat/${s.mentor_id}?session=${s.id}`}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 13,
                                    background: '#fff', border: '1px solid var(--선)', borderRadius: 16,
                                    padding: '16px 48px 16px 16px', textDecoration: 'none', color: 'inherit',
                                }}
                            >
                                <span style={{
                                    width: 54, height: 54, borderRadius: '50%', overflow: 'hidden',
                                    background: 'var(--종이)', flexShrink: 0, display: 'block',
                                }}>
                                    {/* 코치 사진은 여러 곳에서 오고 주소가 우리 저장소 밖일 수도 있다.
                                        next/image 로 바꿨더니 허용 목록 밖 주소가 통째로 안 떴다(2026-09-16). 원래대로 되돌린다. */}
                                    {사진 && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={사진} alt="" width={54} height={54}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                    )}
                                </span>

                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                        <span style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: '-0.03em' }}>
                                            {s.mentor_name}
                                        </span>
                                        <span style={{ fontSize: 12.5, color: '#9AA3A0', fontWeight: 600, flexShrink: 0 }}>
                                            {지난시간(s.last_message_at)}
                                        </span>
                                    </span>
                                    <span style={{
                                        display: 'block', marginTop: 3,
                                        fontSize: 14.5, color: 'var(--먹연)', lineHeight: 1.45,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {줄임(s.topic) || `이야기 ${s.message_count}개`}
                                    </span>
                                </span>
                            </Link>

                            <button
                                type="button"
                                onClick={() => 지우기(s.id)}
                                aria-label={`${s.mentor_name}와 나눈 이 이야기 지우기`}
                                style={{
                                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                    width: 32, height: 32, borderRadius: '50%',
                                    border: 0, background: 'transparent', cursor: 'pointer',
                                    color: '#C4CBC8', fontSize: 17, lineHeight: 1,
                                }}
                            >
                                ×
                            </button>
                        </div>
                    )
                })}
            </div>
        </main>
    )
}

/** 아무것도 없을 때 — 렌트리는 빈 화면에도 다음 할 일을 하나 놓는다 */
function 빈칸({ 제목, 설명, 단추, 주소 }: { 제목: string; 설명: string; 단추: string; 주소: string }) {
    return (
        <div style={{
            background: '#fff', border: '1px solid var(--선)', borderRadius: 18,
            padding: '44px 24px 40px', textAlign: 'center',
        }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C4CBC8" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }} aria-hidden>
                <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
            </svg>
            <p style={{ fontSize: 17, fontWeight: 800, margin: '0 0 7px' }}>{제목}</p>
            <p style={{ fontSize: 14.5, color: 'var(--먹연)', margin: '0 0 20px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                {설명}
            </p>
            <Link href={주소} style={{
                display: 'inline-block', background: 'var(--먹)', color: '#fff',
                padding: '13px 26px', borderRadius: 999, fontWeight: 800, fontSize: 15.5, textDecoration: 'none',
            }}>
                {단추}
            </Link>
        </div>
    )
}
