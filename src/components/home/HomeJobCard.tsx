'use client'
// 「무엇을 맡길 수 있나요」 카드: 누르면 직접 설명해서 만들기로 이어진다 (그 일을 설명 칸에 넣어 둔다)

export default function HomeJobCard({ label, oneLiner }: { label: string; oneLiner: string }) {
    const go = () => {
        window.dispatchEvent(new CustomEvent('curi-home-direct', { detail: `${label}: ${oneLiner}` }))
    }
    return (
        <button type="button" className="hm-job" onClick={go}>
            <strong>{label}</strong>
            <span>{oneLiner}</span>
        </button>
    )
}
