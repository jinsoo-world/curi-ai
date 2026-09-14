'use client'

// 큐리AI 첫 화면 — 「오늘 뭘 만들까요?」
// 대표 확정 2026-09-14. 지금까지의 「누구와 대화할래」(AI 목록)를 대신한다.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { STUDIO_ITEMS, GUIDE_ITEM, type StudioItem } from '@/domains/studio/catalog'
import { CLOVER_UNIT_WON } from '@/domains/credit/packs'
import AppSidebar from '@/components/AppSidebar'
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
                    }}>
                        {(item.cost * CLOVER_UNIT_WON).toLocaleString()}원
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
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', margin: '0 0 10px' }}>만들기</h2>
                <div className="studio-grid" style={{ marginBottom: 28 }}>
                    {만들기.map(i => <ItemCard key={i.id} item={i} onGo={router.push} />)}
                </div>

                {/* 배우기 */}
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', margin: '0 0 10px' }}>배우기</h2>
                <div className="studio-grid" style={{ marginBottom: 28 }}>
                    {배우기.map(i => <ItemCard key={i.id} item={i} onGo={router.push} />)}
                </div>

                {/* 길잡이 */}
                <button
                    onClick={() => router.push(GUIDE_ITEM.href)}
                    style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                        padding: '16px 18px', borderRadius: 16,
                        border: '1.5px dashed #d4d4d8', background: '#fff',
                        cursor: 'pointer', textAlign: 'left',
                    }}
                >
                    <span style={{ fontSize: 24 }}>{GUIDE_ITEM.emoji}</span>
                    <span>
                        <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#18181b' }}>
                            {GUIDE_ITEM.title}
                        </span>
                        <span style={{ display: 'block', fontSize: 13, color: '#71717a', marginTop: 2 }}>
                            {GUIDE_ITEM.desc}
                        </span>
                    </span>
                </button>
            </div>
        </main>
    )
}
