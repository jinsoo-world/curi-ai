// /home 첫 화면 (대표 지시 0928 23:53). 첫 주소(/)가 여기로 온다. 로그인 뒤 첫 화면은 그대로 /os.
// 광고 칸 없음. 활동 줄과 누적 숫자는 실제 기록만, 기준보다 적으면 숨긴다.
// 예시 데이터는 NEXT_PUBLIC_HOME_FEED_DUMMY 를 켰을 때만. 그때는 「예시 데이터」 표시가 항상 붙는다.
// 모양은 탈잉(taling.me) 첫 화면 구성을 따른다 (대표 지시 0929 01:07, home.css): 흰 바탕, 굵은 구역 제목과 오른쪽 「보기」 글자 단추, 좁은 화면은 구역 사이 회색 띠.

import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadHomeActivity, type HomeActivity } from '@/domains/home/feed'
import { HOME_DUMMY_LABEL, HOME_FEED_DUMMY, HOME_STATS_DUMMY, homeFeedDummyOn } from '@/domains/home/feed-dummy'
import { HOME_COPY, homeStatsLine, homeStatsParts } from '@/domains/home/copy'
import { JOBS } from '@/domains/os/presets'
import { PLANS, planPriceText } from '@/domains/os/plan'
import HomeTopBar from '@/components/home/HomeTopBar'
import HomeMake from '@/components/home/HomeMake'
import HomeStickyCta from '@/components/home/HomeStickyCta'
import HomeJobCard from '@/components/home/HomeJobCard'
import './home.css'

export const revalidate = 300

const DESC = '내 SNS 주소만 넣으면 나처럼 말하는 AI가 생겨요. 무료로 시작하세요.'
export const metadata: Metadata = {
    title: '나처럼 말하는 AI 만들기',
    description: DESC,
    openGraph: {
        title: '나처럼 말하는 AI 만들기 | 큐리AI',
        description: DESC,
        type: 'website',
        url: 'https://www.curi-ai.com/home',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '큐리AI' }],
    },
    twitter: { card: 'summary_large_image', title: '나처럼 말하는 AI 만들기 | 큐리AI', description: DESC, images: ['/og-image.png'] },
    alternates: { canonical: 'https://www.curi-ai.com/home' },
    robots: { index: true, follow: true },
}

async function activity(): Promise<HomeActivity & { dummy: boolean }> {
    if (homeFeedDummyOn()) return { feed: HOME_FEED_DUMMY, stats: HOME_STATS_DUMMY, dummy: true }
    try {
        return { ...(await loadHomeActivity(createAdminClient())), dummy: false }
    } catch {
        return { feed: [], stats: { bots: null, chats: null }, dummy: false }
    }
}

export default async function HomePage() {
    const c = HOME_COPY
    const { feed, stats, dummy } = await activity()
    const statsLine = homeStatsLine(stats)
    const statsParts = homeStatsParts(stats)
    const jobs = JOBS.filter(j => j.id !== 'custom' && j.oneLiner)
    const Chevron = () => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M6 3.5l4.5 4.5L6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>

    return (
        <div className="hm">
            <HomeTopBar />
            <main className="hm-main">
                <HomeMake />

                {(feed.length > 0 || statsLine) && (
                    <section className="hm-sec hm-live" aria-label={c.feedTitle}>
                        {feed.length > 0 && (
                            <div className="hm-sec-head">
                                <div>
                                    <h2>{c.feedTitle}{dummy && <span className="hm-dummy">{HOME_DUMMY_LABEL}</span>}</h2>
                                    {!dummy && <p className="hm-sec-sub">{c.feedNote}</p>}
                                </div>
                            </div>
                        )}
                        {statsLine && (
                            <div className="hm-stats" aria-label={statsLine}>
                                <span className="hm-stats-lead">{statsParts.lead}{dummy && feed.length === 0 && <span className="hm-dummy">{HOME_DUMMY_LABEL}</span>}</span>
                                <div className="hm-stats-nums">
                                    {statsParts.parts.map(p => (
                                        <span key={p.label} className="hm-stat"><span className="hm-stat-l">{p.label}</span><strong>{p.value}</strong></span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {feed.length > 0 && (
                            <ul className="hm-feed-list">
                                {feed.map(f => (
                                    <li key={f.key}>
                                        <span className="hm-feed-ico" aria-hidden><Image src="/icons/curi-192.png" alt="" width={22} height={22} /></span>
                                        <span className="hm-feed-txt">{f.text}<span className="hm-ago">{f.ago}</span></span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}

                <section className="hm-sec">
                    <div className="hm-sec-head"><h2>{c.stepsTitle}</h2></div>
                    <ol className="hm-steps">
                        {c.steps.map((s, i) => (
                            <li key={s.t}><span className="hm-step-n">{i + 1}</span><strong>{s.t}</strong><span>{s.d}</span></li>
                        ))}
                    </ol>
                </section>

                <section className="hm-sec">
                    <div className="hm-sec-head"><h2>{c.jobsTitle}</h2></div>
                    <div className="hm-jobs">
                        {jobs.map(j => <HomeJobCard key={j.id} label={j.label} oneLiner={j.oneLiner} />)}
                    </div>
                </section>

                <section className="hm-sec hm-market">
                    <div className="hm-sec-head">
                        <h2>{c.marketTitle}</h2>
                        <Link href="/mentors" className="hm-more-link">{c.marketBtn}<Chevron /></Link>
                    </div>
                    <p className="hm-sec-sub">{c.marketBody}</p>
                </section>

                <section className="hm-sec" id="faq">
                    <div className="hm-sec-head"><h2>{c.faqTitle}</h2></div>
                    <div className="hm-faq">
                        {c.faq.map(f => (
                            <details key={f.q}>
                                <summary>{f.q}</summary>
                                <p>{f.a}</p>
                            </details>
                        ))}
                    </div>
                </section>

                <section className="hm-sec">
                    <div className="hm-sec-head">
                        <h2>{c.priceTitle}</h2>
                        <Link href="/os/charge" className="hm-more-link">{c.priceBtn}<Chevron /></Link>
                    </div>
                    <p className="hm-sec-sub">{c.priceBody}</p>
                    <div className="hm-plans">
                        {PLANS.map(p => (
                            <div key={p.id} className={`hm-plan ${p.recommended ? 'rec' : ''}`}>
                                <strong>{p.name}</strong>
                                <span className="hm-plan-price">{planPriceText(p)}</span>
                                <span className="hm-plan-perk">{p.perks.find(x => !/\d/.test(x)) ?? ''}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
            <HomeStickyCta />
        </div>
    )
}
