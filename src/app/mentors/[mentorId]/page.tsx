// /mentors/[mentorId] — 봇 상세. 마켓 카드의 「자세히」로 들어온다.
// 「내 팀에 추가」 단추, 「N명이 팀에 넣었어요」 배지, 대화 시작 링크.
// 내가 만든 봇이면 「연동 N건 = 정산 예정」과 「정산 정보 넣기」 링크가 더 보인다(산식은 아직 없다).
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicMentorById, MENTOR_IMAGES } from '@/domains/mentor'
import { getLinkCounts, isInMyTeam } from '@/domains/os/team-link'
import { hasPayoutProfile } from '@/domains/os/payout'
import LinkToTeamButton from '../LinkToTeamButton'

export const dynamic = 'force-dynamic'

type Mentor = {
    id: string; name: string; title: string | null; description: string | null; avatar_url: string | null
    expertise: string[] | null; greeting_message: string | null; sample_questions: string[] | null; creator_id: string | null
}

export async function generateMetadata({ params }: { params: Promise<{ mentorId: string }> }): Promise<Metadata> {
    const { mentorId } = await params
    const m = (await getPublicMentorById(mentorId)) as Mentor | null
    if (!m) return { title: '봇을 찾을 수 없어요' }
    return { title: `${m.name} | 큐리AI`, description: m.title || m.description || `${m.name} 봇과 대화해 보세요` }
}

export default async function MentorDetailPage({ params }: { params: Promise<{ mentorId: string }> }) {
    const { mentorId } = await params
    const mentor = (await getPublicMentorById(mentorId)) as Mentor | null
    if (!mentor) notFound()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let linkCount = 0
    let monthNew = 0
    let inTeam = false
    let isOwner = false
    let payoutReady = false
    try {
        const admin = createAdminClient()
        const counts = await getLinkCounts(admin, [mentor.id])
        linkCount = counts.get(mentor.id)?.linkCount ?? 0
        monthNew = counts.get(mentor.id)?.monthNew ?? 0
        if (user) {
            const mine = await isInMyTeam(admin, user.id, mentor.id).catch(() => ({ inTeam: false }))
            inTeam = mine.inTeam
            if (mentor.creator_id) {
                const { data: cp } = await admin.from('creator_profiles').select('user_id').eq('id', mentor.creator_id).maybeSingle()
                isOwner = (cp as { user_id: string } | null)?.user_id === user.id
            }
            if (isOwner) payoutReady = await hasPayoutProfile(admin, user.id).catch(() => false)
        }
    } catch (e) {
        console.error('[mentors/[id]]', e instanceof Error ? e.message : e)
    }

    const avatarUrl = mentor.avatar_url || MENTOR_IMAGES[mentor.name] || null
    const questions = Array.isArray(mentor.sample_questions) ? mentor.sample_questions.slice(0, 3) : []
    const expertise = Array.isArray(mentor.expertise) ? mentor.expertise.slice(0, 6) : []

    return (
        <div style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <main style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px 60px' }}>
                <Link href="/mentors" style={{ fontSize: 14, color: 'var(--먹연)', textDecoration: 'none' }}>← 발견하기로</Link>

                <section style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginTop: 16, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', width: 140, height: 140, borderRadius: 24, overflow: 'hidden', flexShrink: 0, background: 'linear-gradient(135deg, #E8F2EC 0%, #C7E4D3 100%)' }}>
                        {avatarUrl ? (
                            <Image src={avatarUrl} alt={mentor.name} fill sizes="140px" style={{ objectFit: 'cover' }} />
                        ) : (
                            <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 56, fontWeight: 900, color: 'var(--먹)' }}>
                                {mentor.name.slice(0, 1)}
                            </div>
                        )}
                    </div>
                    <div style={{ flex: 1, minWidth: 240 }}>
                        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--먹)', margin: '0 0 6px', lineHeight: 1.25 }}>{mentor.name}</h1>
                        {mentor.title && <p style={{ fontSize: 16, color: 'var(--먹연)', margin: '0 0 12px', lineHeight: 1.5 }}>{mentor.title}</p>}
                        {expertise.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                                {expertise.map(t => (
                                    <span key={t} style={{ fontSize: 13, padding: '4px 10px', borderRadius: 999, background: '#FFFFFF', border: '1px solid var(--선)', color: 'var(--먹)' }}>{t}</span>
                                ))}
                            </div>
                        )}
                        <LinkToTeamButton mentorId={mentor.id} initialInTeam={inTeam} initialCount={linkCount} guest={!user} isOwner={isOwner} />
                    </div>
                </section>

                {mentor.description && (
                    <section style={{ marginTop: 28 }}>
                        <h2 style={h2}>이 봇은</h2>
                        <p style={{ fontSize: 16, color: 'var(--먹)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' }}>{mentor.description}</p>
                    </section>
                )}

                <section style={{ marginTop: 28 }}>
                    <h2 style={h2}>바로 대화하기</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {(questions.length > 0 ? questions : [`${mentor.name}에게 뭐부터 물어보면 좋아요?`]).map((q, i) => (
                            <Link key={i} href={`/chat/${mentor.id}`} style={row}>
                                <span style={{ flex: 1 }}>{q}</span>
                                <span aria-hidden style={{ color: 'var(--먹연)' }}>→</span>
                            </Link>
                        ))}
                    </div>
                </section>

                {isOwner && (
                    <section style={{ marginTop: 32, padding: 18, borderRadius: 18, background: '#FFFFFF', border: '1px solid var(--선)' }}>
                        <h2 style={{ ...h2, marginBottom: 8 }}>내 봇 정산</h2>
                        <p style={{ fontSize: 16, color: 'var(--먹)', margin: '0 0 6px', lineHeight: 1.6 }}>
                            연동 {linkCount}건 = 정산 예정{monthNew > 0 ? ` (이번 달 새로 ${monthNew}건)` : ''}
                        </p>
                        <p style={{ fontSize: 14, color: 'var(--먹연)', margin: '0 0 14px', lineHeight: 1.6 }}>
                            정산 기준은 준비 중이에요. 정산 정보를 먼저 넣어 두면 기준이 정해지는 대로 바로 받을 수 있어요.
                        </p>
                        <Link href="/os/payout" style={{ display: 'inline-block', minHeight: 44, padding: '11px 18px', borderRadius: 12, background: payoutReady ? '#FFFFFF' : 'var(--먹)', color: payoutReady ? 'var(--먹)' : '#FFFFFF', border: payoutReady ? '1px solid var(--선)' : 0, fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>
                            {payoutReady ? '정산 정보 고치기' : '정산 정보 넣기'}
                        </Link>
                    </section>
                )}
            </main>
        </div>
    )
}

const h2: React.CSSProperties = { fontSize: 17, fontWeight: 700, color: 'var(--먹)', margin: '0 0 10px' }
const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#FFFFFF',
    border: '1px solid var(--선)', borderRadius: 14, textDecoration: 'none', color: 'var(--먹)', fontSize: 15, lineHeight: 1.4,
}
