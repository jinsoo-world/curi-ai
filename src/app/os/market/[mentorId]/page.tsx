// /os/market/[mentorId] = 마켓 봇 소개(프로필) 화면.
// 대표 흐름: 마켓 카드 → 소개(큰 사진, 한 줄, 예시 질문, 대화 CTA) → 그다음 팀에 추가.
// 옛 /mentors/[mentorId] 패턴을 큐리AI 뼈대 안에서 다시 쓴다. 대화는 /os/chat 으로만 보낸다.
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicMentorById, MENTOR_IMAGES } from '@/domains/mentor'
import { getLinkCounts, isInMyTeam } from '@/domains/os/team-link'
import MarketTeamActions from './MarketTeamActions'

export const dynamic = 'force-dynamic'

type Mentor = {
    id: string
    name: string
    title: string | null
    description: string | null
    avatar_url: string | null
    expertise: string[] | null
    greeting_message: string | null
    sample_questions: string[] | null
    creator_id: string | null
}

export async function generateMetadata({ params }: { params: Promise<{ mentorId: string }> }): Promise<Metadata> {
    const { mentorId } = await params
    const m = (await getPublicMentorById(mentorId)) as Mentor | null
    if (!m) return { title: '봇을 찾을 수 없어요' }
    return { title: `${m.name} | 큐리AI`, description: m.title || m.description || `${m.name} 봇과 대화해 보세요` }
}

export default async function OsMarketIntroPage({
    params,
    searchParams,
}: {
    params: Promise<{ mentorId: string }>
    searchParams: Promise<{ demo?: string }>
}) {
    const { mentorId } = await params
    const { demo } = await searchParams
    const tail = demo === '1' ? '?demo=1' : ''

    const mentor = (await getPublicMentorById(mentorId)) as Mentor | null
    if (!mentor) notFound()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let linkCount = 0
    let inTeam = false
    let isOwner = false
    try {
        const admin = createAdminClient()
        const counts = await getLinkCounts(admin, [mentor.id])
        linkCount = counts.get(mentor.id)?.linkCount ?? 0
        if (user) {
            const mine = await isInMyTeam(admin, user.id, mentor.id).catch(() => ({ inTeam: false }))
            inTeam = !!mine.inTeam
            if (mentor.creator_id) {
                const { data: cp } = await admin.from('creator_profiles').select('user_id').eq('id', mentor.creator_id).maybeSingle()
                isOwner = (cp as { user_id: string } | null)?.user_id === user.id
            }
        }
    } catch (e) {
        console.error('[os/market/[id]]', e instanceof Error ? e.message : e)
    }

    const avatarUrl = mentor.avatar_url || MENTOR_IMAGES[mentor.name] || null
    const questions = Array.isArray(mentor.sample_questions) ? mentor.sample_questions.slice(0, 3) : []
    const expertise = Array.isArray(mentor.expertise) ? mentor.expertise.slice(0, 6) : []
    const oneLiner = mentor.title || (mentor.description ?? '').slice(0, 80) || null
    const chatHref = `/os/chat/${mentor.id}${tail}`

    return (
        <div className="os-market-intro">
            <Link href={`/os/market${tail}`} className="os-market-intro-back">← 봇 마켓</Link>

            <section className="os-market-intro-hero">
                <div className="os-market-intro-photo">
                    {avatarUrl ? (
                        <Image src={avatarUrl} alt={mentor.name} fill sizes="200px" style={{ objectFit: 'cover' }} />
                    ) : (
                        <span className="os-market-intro-initial" aria-hidden>{mentor.name.slice(0, 1)}</span>
                    )}
                </div>
                <div className="os-market-intro-meta">
                    <h1>{mentor.name}</h1>
                    {oneLiner && <p className="os-market-intro-line">{oneLiner}</p>}
                    {expertise.length > 0 && (
                        <div className="os-market-intro-tags">
                            {expertise.map(t => <span key={t}>{t}</span>)}
                        </div>
                    )}
                    <MarketTeamActions
                        mentorId={mentor.id}
                        mentorName={mentor.name}
                        initialInTeam={inTeam}
                        initialCount={linkCount}
                        guest={!user}
                        isOwner={isOwner}
                        chatHref={chatHref}
                    />
                </div>
            </section>

            {mentor.description && (
                <section className="os-market-intro-block">
                    <h2>이 봇은</h2>
                    <p className="os-market-intro-desc">{mentor.description}</p>
                </section>
            )}

            <section className="os-market-intro-block">
                <h2>이렇게 물어보세요</h2>
                <div className="os-market-intro-qs">
                    {(questions.length > 0 ? questions : [`${mentor.name}에게 뭐부터 물어보면 좋아요?`]).map((q, i) => (
                        <Link key={i} href={chatHref} className="os-market-intro-q">
                            <span>{q}</span>
                            <span aria-hidden>→</span>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    )
}
