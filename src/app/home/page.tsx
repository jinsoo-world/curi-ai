// /home 첫 화면 (대표 지시 0928 23:53). 첫 주소(/)가 여기로 온다. 로그인 뒤 첫 화면은 그대로 /os.
// 광고 칸 없음. 활동 줄과 누적 숫자는 실제 기록만, 기준보다 적으면 숨긴다.
// 예시 데이터는 NEXT_PUBLIC_HOME_FEED_DUMMY 를 켰을 때만. 그때는 「예시 데이터」 표시가 항상 붙는다.

import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadHomeActivity, type HomeActivity } from '@/domains/home/feed'
import { HOME_DUMMY_LABEL, HOME_FEED_DUMMY, HOME_STATS_DUMMY, homeFeedDummyOn } from '@/domains/home/feed-dummy'
import { HOME_COPY, homeStatsLine } from '@/domains/home/copy'
import { JOBS } from '@/domains/os/presets'
import { PLANS } from '@/domains/os/plan'
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
    const jobs = JOBS.filter(j => j.id !== 'custom' && j.oneLiner)

    return (
        <div className="hm">
            <HomeTopBar />
            <main className="hm-main">
                <HomeMake />

                {feed.length > 0 && (
                    <section className="hm-feed" aria-label={c.feedTitle}>
                        <div className="hm-feed-head">
                            <span className="hm-feed-title">{c.feedTitle}</span>
                            {dummy ? <span className="hm-dummy">{HOME_DUMMY_LABEL}</span> : <span className="hm-feed-note">{c.feedNote}</span>}
                        </div>
                        <ul className="hm-feed-list">
                            {feed.map(f => <li key={f.key}>{f.text} ({f.ago})</li>)}
                        </ul>
                    </section>
                )}

                {statsLine && (
                    <p className="hm-stats">
                        {statsLine}
                        {dummy && <span className="hm-dummy">{HOME_DUMMY_LABEL}</span>}
                    </p>
                )}

                <section className="hm-sec">
                    <h2>{c.stepsTitle}</h2>
                    <ol className="hm-steps">
                        {c.steps.map((s, i) => (
                            <li key={s.t}><span className="hm-step-n">{i + 1}</span><strong>{s.t}</strong><span>{s.d}</span></li>
                        ))}
                    </ol>
                </section>

                <section className="hm-sec">
                    <h2>{c.jobsTitle}</h2>
                    <div className="hm-jobs">
                        {jobs.map(j => <HomeJobCard key={j.id} label={j.label} oneLiner={j.oneLiner} />)}
                    </div>
                </section>

                <section className="hm-sec hm-market">
                    <h2>{c.marketTitle}</h2>
                    <p>{c.marketBody}</p>
                    <Link href="/mentors" className="hm-btn ghost">{c.marketBtn}</Link>
                </section>

                <section className="hm-sec" id="faq">
                    <h2>{c.faqTitle}</h2>
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
                    <h2>{c.priceTitle}</h2>
                    <p>{c.priceBody}</p>
                    <div className="hm-plans">
                        {PLANS.map(p => (
                            <div key={p.id} className={`hm-plan ${p.recommended ? 'rec' : ''}`}>
                                <strong>{p.name}</strong>
                                <span className="hm-plan-price">{p.price === 0 ? '0원' : `월 ${p.price.toLocaleString('ko-KR')}원`}</span>
                                <span className="hm-plan-perk">{p.perks.find(x => !/\d/.test(x)) ?? ''}</span>
                            </div>
                        ))}
                    </div>
                    <Link href="/os/charge" className="hm-btn ghost">{c.priceBtn}</Link>
                </section>
            </main>
            <HomeStickyCta />
        </div>
    )
}
