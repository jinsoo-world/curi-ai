'use client'

// 큐리AI 첫 화면 — 「오늘 뭘 만들까요?」
// 대표 확정 2026-09-14. 지금까지의 「누구와 대화할래」(AI 목록)를 대신한다.
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TOOLS, type ToolItem } from '@/domains/studio/tools'
import AppSidebar from '@/components/AppSidebar'
import WelcomeGift from '@/components/WelcomeGift'
import CloverIcon from '@/components/ui/CloverIcon'
import Image from 'next/image'
import AdSlot from '@/components/AdSlot'
import ClaimPhoto from '@/components/studio/ClaimPhoto'
import UploadedPeek from '@/components/studio/UploadedPeek'
import InstallModal from '@/components/pwa/InstallModal'

function ItemCard({ item, onGo }: { item: ToolItem; onGo: (href: string) => void }) {
    return (
        <button
            onClick={() => onGo(item.href)}
            style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                gap: 6, padding: 14,
                borderRadius: 16,
                border: '1px solid #e4e4e7',
                background: '#fff',
                cursor: 'pointer', textAlign: 'left', width: '100%', height: '100%',
            }}
        >
            {item.img ? (
                <div style={{
                    position: 'relative', width: '100%', aspectRatio: '4 / 5',
                    borderRadius: 12, overflow: 'hidden', background: '#f4f4f5', marginBottom: 4,
                }}>
                    <Image src={item.img} alt="" fill sizes="(max-width: 700px) 45vw, 320px"
                        style={{ objectFit: 'cover', objectPosition: 'center 28%' }} />
                </div>
            ) : null}
            <div style={{ fontSize: 16, fontWeight: 700, color: '#18181b', wordBreak: 'keep-all' }}>
                {item.title}
            </div>
            <div style={{ fontSize: 13, color: '#71717a', lineHeight: 1.6, wordBreak: 'keep-all', flex: 1 }}>
                {item.desc}
            </div>
            <div style={{ marginTop: 4 }}>
                {item.cost === 'free' ? (
                    <span style={{
                        fontSize: 12, fontWeight: 700, color: '#166534',
                        background: '#dcfce7', padding: '4px 10px', borderRadius: 8,
                    }}>무료</span>
                ) : (
                    <span style={{
                        fontSize: 12, fontWeight: 700, color: '#3f3f46',
                        background: '#f4f4f5', padding: '4px 10px', borderRadius: 8,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                        <CloverIcon size={13} color="#3f3f46" /> {item.cost}개
                    </span>
                )}
            </div>
        </button>
    )
}

export default function StudioPage() {
    const router = useRouter()
    // 첫 화면에서 사진을 올리고 왔으면 주소에 표가 붙어 온다 (PhotoHero 가 붙인다)
    const 사진들고옴 = useSearchParams()?.get('사진') === '올림'
    const [name, setName] = useState<string | null>(null)
    const [balance, setBalance] = useState<number | null>(null)
    // 로그인 여부. 「내 봇 팀 열기」가 로그인 전이면 /os/welcome 으로 보낸다
    const [로그인함, set로그인함] = useState<boolean | null>(null)

    useEffect(() => {
        const supabase = createClient()
        supabase.auth.getSession().then(async ({ data }) => {
            const uid = data.session?.user?.id
            set로그인함(!!uid)
            if (!uid) return
            // 한 번에 여러 칸을 물으면 그중 하나만 없어도 통째로 실패한다(0915 잔액 0 사고)
            const { data: row } = await supabase.from('users').select('display_name, clovers').eq('id', uid).maybeSingle()
            setName(row?.display_name ?? null)
            setBalance(row?.clovers ?? 0)
        })
    }, [])


    return (
        <main style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />
            <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 18px" }}><ClaimPhoto /></div>
            <WelcomeGift />
            <InstallModal />
            <div style={{ maxWidth: 1000, margin: '0 auto', padding: '36px 18px 90px' }}>
                {/* 홈 → 대화 진입. 대표 지시 0923 「홈페이지에서 채팅 쪽으로 들어갈 루트가 없어」 */}
                <button
                    type="button"
                    onClick={() => router.push(로그인함 ? '/os' : '/os/welcome')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 14, width: '100%', marginBottom: 26,
                        padding: '18px 20px', borderRadius: 20, border: 'none', cursor: 'pointer', textAlign: 'left',
                        background: '#0B0B0C', color: '#fff',
                    }}
                >
                    <Image src="/icons/curi-192.png" alt="" width={48} height={48} style={{ borderRadius: 14, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.3 }}>내 봇 팀 열기</span>
                        <span style={{ display: 'block', fontSize: 14.5, color: 'rgba(255,255,255,0.72)', marginTop: 3, lineHeight: 1.5, wordBreak: 'keep-all' }}>
                            이름 있는 AI 봇들이 내 자료로 답하고 초안을 만들어요. 무료로 시작해요.
                        </span>
                    </span>
                    <span aria-hidden style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>→</span>
                </button>

                {/* 인사 + 잔액 */}
                {사진들고옴 && <UploadedPeek />}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 22 }}>
                    <div>
                        <h1 style={{
                            fontSize: 26, fontWeight: 800, color: '#18181b',
                            margin: '0 0 6px', lineHeight: 1.35, wordBreak: 'keep-all',
                        }}>
                            {사진들고옴
                                ? '올리신 사진으로 뭘 만들까요?'
                                : name ? `${name}님, 오늘 뭘 만들까요?` : '오늘 뭘 만들까요?'}
                        </h1>
                        <p style={{ fontSize: 15, color: '#71717a', margin: 0, lineHeight: 1.6, wordBreak: 'keep-all' }}>
                            {사진들고옴
                                ? '고르시면 그 사진이 그대로 넘어갑니다. 다시 올리지 않으셔도 돼요.'
                                : '하고 싶은 것을 고르면 바로 시작합니다.'}
                        </p>
                    </div>

                </div>

                {/* 만들기 */}
                <div className="studio-grid" style={{ marginBottom: 28 }}>
                    {TOOLS.map(i => <ItemCard key={i.id} item={i} onGo={router.push} />)}
                </div>

                {/* 광고(애드센스) — 무료 화면에만, 본문 끝난 뒤 */}
                <AdSlot />

            </div>
        </main>
    )
}
