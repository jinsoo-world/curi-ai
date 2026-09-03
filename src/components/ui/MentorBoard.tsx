'use client'

import { useMemo, useState } from 'react'
import CategoryTabs from './CategoryTabs'
import MentorBigCard from './MentorBigCard'

export interface BoardMentor {
    id: string
    name: string
    title: string
    image: string | null
    expertise: string[]
}

/** 관심사 묶음 — 멘토가 붙인 낱말로 나눈다 */
const 갈래 = [
    { key: 'all', label: '전체', 말: [] as string[] },
    { key: 'money', label: '돈 벌기', 말: ['수익', '돈', '블로그', '세일즈', '협상', '마케팅', '창업'] },
    { key: 'write', label: '글·책', 말: ['책', '출판', '글', '원고', '전자책', '콘텐츠'] },
    { key: 'tool', label: 'AI·도구', 말: ['AI', '구글', '문서', '도구', '자동화'] },
    { key: 'mind', label: '마음', 말: ['상담', '공감', '고민', '마음', '조언'] },
]

export default function MentorBoard({ mentors }: { mentors: BoardMentor[] }) {
    const [고른갈래, set고른갈래] = useState('all')

    const 보일멘토 = useMemo(() => {
        const g = 갈래.find((x) => x.key === 고른갈래)
        if (!g || g.말.length === 0) return mentors
        return mentors.filter((m) => {
            const 글 = `${m.name} ${m.title} ${m.expertise.join(' ')}`
            return g.말.some((w) => 글.includes(w))
        })
    }, [고른갈래, mentors])

    return (
        <>
            <CategoryTabs items={갈래.map(({ key, label }) => ({ key, label }))} active={고른갈래} onPick={set고른갈래} />

            <main style={{ padding: 'var(--틈-대) var(--틈) var(--틈-절)', maxWidth: 900, margin: '0 auto' }}>
                <p style={{ fontSize: 'var(--글자-본문)', color: 'var(--먹연)', marginBottom: 'var(--틈)' }}>
                    {보일멘토.length}명이 기다리고 있어요
                </p>

                {보일멘토.length === 0 ? (
                    <div
                        style={{
                            background: 'var(--흰)',
                            borderRadius: 'var(--둥근)',
                            padding: 'var(--틈-절) var(--틈-대)',
                            textAlign: 'center',
                            boxShadow: 'var(--그림자)',
                        }}
                    >
                        <p style={{ fontSize: 'var(--글자-중)', fontWeight: 700, marginBottom: 6 }}>
                            이 갈래에는 아직 멘토가 없어요
                        </p>
                        <p style={{ fontSize: 'var(--글자-본문)', color: 'var(--먹연)' }}>
                            위에서 다른 관심사를 눌러보세요
                        </p>
                    </div>
                ) : (
                    <div className="mentor-grid">
                        {보일멘토.map((m) => (
                            <MentorBigCard
                                key={m.id}
                                href={`/chat/${m.id}`}
                                name={m.name}
                                title={m.title}
                                imageSrc={m.image}
                                chips={m.expertise}
                            />
                        ))}
                    </div>
                )}
            </main>
        </>
    )
}
