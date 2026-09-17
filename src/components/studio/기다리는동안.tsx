'use client'

/**
 * 사진 만드는 동안 딱 하나만 여쭙는다 — 대표 지시 2026-09-18
 * 「사진 받을 때, 로딩중일 때 그때 받는건 어때?」
 *
 * 왜 여기냐 =  가입할 때 물으면 가입을 그만둔다. 만드는 30초는 어차피 기다리는 시간이라
 *             여기서 한 가지만 여쭈면 마찰이 거의 없다.
 *
 * 규칙 =  ① 로그인한 분에게만(저장할 곳이 있어야 한다)
 *        ② 비어 있는 것 **하나만** 묻는다. 세 개를 한꺼번에 묻지 않는다
 *        ③ 왜 묻는지 적는다. 성별·태어난 해는 실제로 사진을 만들 때 쓰는 값이라 그대로 적으면 된다
 *        ④ 건너뛸 수 있다. 한 번 건너뛰면 그 창에서는 다시 안 묻는다
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type 물을것 = 'phone' | 'gender' | 'birth_year' | null

const 올해 = new Date().getFullYear()

export default function 기다리는동안() {
    const [무엇, set무엇] = useState<물을것>(null)
    const [값, set값] = useState('')
    const [보내는중, set보내는중] = useState(false)
    const [끝, set끝] = useState(false)

    useEffect(() => {
        let 살아있음 = true
        void (async () => {
            try {
                if (sessionStorage.getItem('curi:더묻지마')) return
            } catch { /* 저장이 막혔으면 그냥 묻는다 */ }
            try {
                const { data: { session } } = await createClient().auth.getSession()
                if (!session?.user) return               // 손님에게는 안 묻는다
                const r = await fetch('/api/profile')
                const d = await r.json()
                const p = d?.profile
                if (!살아있음 || !p) return
                if (!p.phone) set무엇('phone')
                else if (!p.gender) set무엇('gender')
                else if (!p.birth_year) set무엇('birth_year')
            } catch { /* 못 불러오면 안 묻는다 */ }
        })()
        return () => { 살아있음 = false }
    }, [])

    if (!무엇 || 끝) return null

    const 물음 = {
        phone: { 제목: '연락받으실 번호를 알려주세요', 이유: '계정을 찾거나 꼭 필요한 안내를 드릴 때만 씁니다.', 안내: '010으로 시작하는 번호' },
        gender: { 제목: '남성이신가요, 여성이신가요', 이유: '다음부터 이 칸을 고르지 않으셔도 사진이 만들어집니다.', 안내: '' },
        birth_year: { 제목: '태어난 해를 알려주세요', 이유: '나이대에 맞게 사진을 만들어 드릴 때 씁니다.', 안내: '예: 1968' },
    }[무엇]

    const 저장 = async (보낼값: string) => {
        if (!보낼값 || 보내는중) return
        set보내는중(true)
        try {
            const 몸통: Record<string, string | number> =
                무엇 === 'birth_year' ? { birth_year: Number(보낼값) } : { [무엇]: 보낼값 }
            await fetch('/api/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(몸통),
            })
            set끝(true)
        } catch { set끝(true) }
    }

    const 건너뛰기 = () => {
        try { sessionStorage.setItem('curi:더묻지마', '1') } catch { /* 못 적으면 그냥 닫는다 */ }
        set끝(true)
    }

    return (
        <div style={{
            marginTop: 16, padding: '18px 18px 16px', borderRadius: 16,
            background: '#fff', border: '1px solid var(--선, #E5E7EB)',
            maxWidth: 420, marginLeft: 'auto', marginRight: 'auto',
        }}>
            <p style={{ fontSize: 16, fontWeight: 800, margin: '0 0 5px', letterSpacing: '-0.03em' }}>{물음.제목}</p>
            <p style={{ fontSize: 13.5, color: 'var(--먹연, #5C6660)', margin: '0 0 14px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                만드는 동안 하나만 여쭤요. {물음.이유}
            </p>

            {무엇 === 'gender' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                    {['남성', '여성'].map((g) => (
                        <button key={g} type="button" onClick={() => void 저장(g)} disabled={보내는중}
                            style={{
                                flex: 1, height: 48, borderRadius: 12, cursor: 'pointer',
                                border: '1px solid var(--선, #E5E7EB)', background: '#fff',
                                fontSize: 16, fontWeight: 700, color: 'var(--먹, #111813)',
                            }}>
                            {g}
                        </button>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                    <input
                        value={값}
                        onChange={(e) => set값(e.target.value.replace(/[^0-9-]/g, ''))}
                        inputMode="numeric"
                        placeholder={물음.안내}
                        style={{
                            flex: 1, height: 48, borderRadius: 12, padding: '0 14px',
                            border: '1px solid var(--선, #E5E7EB)', fontSize: 16, minWidth: 0,
                        }}
                    />
                    <button type="button" onClick={() => void 저장(값)} disabled={보내는중 || !값}
                        style={{
                            height: 48, padding: '0 20px', borderRadius: 12, border: 0, cursor: 'pointer',
                            background: 값 ? 'var(--먹, #111813)' : '#E5E7EB',
                            color: 값 ? '#fff' : '#9AA3A0', fontSize: 15.5, fontWeight: 800, flexShrink: 0,
                        }}>
                        {보내는중 ? '보내는 중' : '보내기'}
                    </button>
                </div>
            )}

            <button type="button" onClick={건너뛰기}
                style={{
                    marginTop: 10, border: 0, background: 'transparent', cursor: 'pointer',
                    fontSize: 13.5, color: '#9AA3A0', fontWeight: 600, padding: '4px 0',
                }}>
                다음에 할게요
            </button>
        </div>
    )
}
