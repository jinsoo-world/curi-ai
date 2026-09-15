'use client'

/**
 * 증명사진 — 2026-09-15 내림
 *
 * 대표 확정 「증명사진 빼자 그럼」
 *
 * 왜 = 행정안전부가 「AI 프로필 사진은 주민등록증에 사용할 수 없습니다」라는 공문을
 * 전국 지자체에 두 차례(6/27 · 7/27) 보냈고, AI 사진앱에 「신분증 용도로 사용할 수 없다」는
 * 안내 문구를 넣는 방안을 협의 중이다(네이버 스노우는 이미 표출 중).
 * 신분증에 못 쓰는 증명사진을 팔면 고객이 주민센터에서 반려당한다.
 *
 * 주소는 죽이지 않는다. 카톡·검색으로 이미 나간 링크가 있다.
 * 들어온 분께 사정을 말하고 쓸 수 있는 도구로 안내한다.
 */
import Link from 'next/link'
import AppSidebar from '@/components/AppSidebar'

export default function Page() {
    return (
        <main style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />
            <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 18px 90px' }}>
                <h1 style={{ fontSize: 'var(--글자-대)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 14px', wordBreak: 'keep-all' }}>
                    증명사진은 지금 만들어 드리지 않습니다
                </h1>
                <p style={{ fontSize: 17, color: 'var(--먹연)', lineHeight: 1.7, margin: '0 0 12px', wordBreak: 'keep-all' }}>
                    행정안전부가 주민등록증·운전면허증 같은 신분증에는 AI로 만든 사진을 쓸 수 없다고 정했습니다.
                    만들어 드려도 주민센터에서 돌려보내기 때문에, 저희가 먼저 내렸습니다.
                </p>
                <p style={{ fontSize: 17, color: 'var(--먹연)', lineHeight: 1.7, margin: '0 0 26px', wordBreak: 'keep-all' }}>
                    신분증 사진은 사진관에서 찍으시는 것이 확실합니다.
                </p>

                <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 18, padding: '20px 18px' }}>
                    <div style={{ fontSize: 16.5, fontWeight: 800, marginBottom: 12 }}>이런 사진은 만들어 드려요</div>
                    <div style={{ display: 'grid', gap: 10 }}>
                        {[
                            { href: '/tools/teacher-photo', label: '강사 프로필 만들기', desc: '강의 소개에 거는 밝고 믿음직한 사진' },
                            { href: '/tools/actor-photo', label: '배우 프로필 만들기', desc: '캐스팅에 내는 사진, 사진관에서 찍은 것처럼' },
                            { href: '/tools/enhance', label: '사진 화질 개선하기', desc: '흐릿하거나 오래된 사진을 살려요' },
                        ].map(t => (
                            <Link key={t.href} href={t.href} style={{
                                display: 'block', padding: '15px 16px', borderRadius: 14,
                                border: '1px solid #e4e4e7', textDecoration: 'none', color: 'inherit',
                            }}>
                                <span style={{ display: 'block', fontSize: 16.5, fontWeight: 800 }}>{t.label}</span>
                                <span style={{ display: 'block', fontSize: 15, color: '#71717a', marginTop: 3 }}>{t.desc}</span>
                            </Link>
                        ))}
                    </div>
                    <Link href="/studio" style={{
                        display: 'block', marginTop: 14, padding: 15, borderRadius: 14,
                        background: '#1C2321', color: '#fff', fontSize: 16.5, fontWeight: 800,
                        textAlign: 'center', textDecoration: 'none',
                    }}>
                        전체 보기
                    </Link>
                </div>
            </div>
        </main>
    )
}
