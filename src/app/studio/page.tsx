'use client'

// 큐리AI 첫 화면 — 「오늘 뭘 만들까요?」
// 대표 확정 2026-09-14. 지금까지의 「누구와 대화할래」(AI 목록)를 대신한다.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { STUDIO_ITEMS, GUIDE_ITEM, type StudioItem } from '@/domains/studio/catalog'
import { CLOVER_UNIT_WON } from '@/domains/credit/packs'
import AppSidebar from '@/components/AppSidebar'
import CloverIcon from '@/components/ui/CloverIcon'
import Image from 'next/image'

function ItemCard({ item, onGo }: { item: StudioItem; onGo: (href: string) => void }) {
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
                    position: 'relative', width: '100%', aspectRatio: '4 / 3',
                    borderRadius: 12, overflow: 'hidden', background: '#f4f4f5', marginBottom: 4,
                }}>
                    <Image src={item.img} alt="" fill sizes="(max-width: 700px) 45vw, 320px"
                        style={{ objectFit: 'cover', objectPosition: 'center 20%' }} />
                </div>
            ) : (
                <div style={{ fontSize: 28, lineHeight: 1 }}>{item.emoji}</div>
            )}
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
    const [name, setName] = useState<string | null>(null)
    const [balance, setBalance] = useState<number | null>(null)

    useEffect(() => {
        const supabase = createClient()
        supabase.auth.getUser().then(async ({ data }) => {
            const uid = data.user?.id
            if (!uid) return
            const { data: row } = await supabase.from('users').select('name, clovers').eq('id', uid).single()
            setName(row?.name ?? null)
            setBalance(row?.clovers ?? 0)
        })
    }, [])

    const 만들기 = STUDIO_ITEMS.filter(i => i.group === '만들기')
    const 배우기 = STUDIO_ITEMS.filter(i => i.group === '배우기')

    return (
        <main style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />
            <div style={{ maxWidth: 1000, margin: '0 auto', padding: '36px 18px 90px' }}>
                {/* 인사 + 잔액 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 22 }}>
                    <div>
                        <h1 style={{
                            fontSize: 26, fontWeight: 800, color: '#18181b',
                            margin: '0 0 6px', lineHeight: 1.35, wordBreak: 'keep-all',
                        }}>
                            {name ? `${name}님, 오늘 뭘 만들까요?` : '오늘 뭘 만들까요?'}
                        </h1>
                        <p style={{ fontSize: 14, color: '#71717a', margin: 0, lineHeight: 1.6, wordBreak: 'keep-all' }}>
                            하고 싶은 것을 고르면 바로 시작합니다.
                        </p>
                    </div>

                </div>

                {/* 만들기 */}
                <div className="studio-grid" style={{ marginBottom: 28 }}>
                    {만들기.map(i => <ItemCard key={i.id} item={i} onGo={router.push} />)}
                </div>

                {/* 배우기는 「대화하기」가 맡는다 — 대표 지적 0914 「만들기인데 왜 대화처럼 보이냐」 */}
                <button
                    onClick={() => router.push('/mentors')}
                    style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                        padding: '16px 18px', borderRadius: 16,
                        border: '1px solid var(--선)', background: '#fff',
                        cursor: 'pointer', textAlign: 'left',
                    }}
                >
                    <span>
                        <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#18181b' }}>
                            뭘 만들지 모르겠어요
                        </span>
                        <span style={{ display: 'block', fontSize: 13, color: '#71717a', marginTop: 2 }}>
                            코치에게 물어보면 맞는 곳으로 안내해드려요
                        </span>
                    </span>
                    <span style={{ marginLeft: 'auto', color: 'var(--먹연)', fontSize: 20 }} aria-hidden>›</span>
                </button>
            </div>
        </main>
    )
}
