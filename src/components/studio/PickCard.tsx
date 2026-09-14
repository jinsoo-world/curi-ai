'use client'

// 사진 만들기에서 무엇을 고를지 보여주는 카드.
// 글자만 있으면 무엇이 다른지 안 보인다. 색과 모양으로 먼저 보이게 한다.

export interface PickOption {
    id: string
    label: string
    swatch: string
    bg?: string
    /** 실제로 만들어본 예시 사진. 있으면 이걸 먼저 보여준다 */
    sample?: string
}

/** 옷 모양 — 어깨선과 깃으로 차림새를 구분해 보여준다 */
function OutfitShape({ color }: { color: string }) {
    return (
        <svg viewBox="0 0 64 48" width="100%" height="100%" aria-hidden="true">
            <rect width="64" height="48" fill="#f4f4f5" />
            <circle cx="32" cy="15" r="9" fill="#d4d4d8" />
            <path d="M12 48 Q12 30 24 26 L32 34 L40 26 Q52 30 52 48 Z" fill={color} />
            <path d="M24 26 L32 34 L40 26 L36 24 L32 30 L28 24 Z" fill="#fff" opacity="0.9" />
        </svg>
    )
}

/** 배경 — 인물 실루엣 뒤에 그 배경을 깔아 보여준다 */
function BackdropShape({ bg }: { bg: string }) {
    return (
        <div style={{ width: '100%', height: '100%', background: bg, position: 'relative' }}>
            <svg viewBox="0 0 64 48" width="100%" height="100%" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
                <circle cx="32" cy="17" r="9" fill="#ffffff" opacity="0.75" />
                <path d="M14 48 Q14 30 32 30 Q50 30 50 48 Z" fill="#ffffff" opacity="0.75" />
            </svg>
        </div>
    )
}

export function PickCard({
    option, selected, onSelect, kind,
}: {
    option: PickOption
    selected: boolean
    onSelect: (id: string) => void
    kind: 'outfit' | 'backdrop'
}) {
    return (
        <button
            onClick={() => onSelect(option.id)}
            style={{
                padding: 0, borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
                border: selected ? '2.5px solid #22c55e' : '1.5px solid #e4e4e7',
                background: '#fff', textAlign: 'left',
                boxShadow: selected ? '0 0 0 3px rgba(34,197,94,0.12)' : 'none',
            }}
        >
            <div style={{ width: '100%', aspectRatio: '4 / 5', overflow: 'hidden', background: '#f4f4f5' }}>
                {option.sample ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={option.sample} alt={option.label} loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : kind === 'outfit' ? (
                    <OutfitShape color={option.swatch} />
                ) : (
                    <BackdropShape bg={option.bg || option.swatch} />
                )}
            </div>
            <div style={{
                padding: '9px 10px', fontSize: 15, fontWeight: 700,
                color: selected ? '#166534' : '#18181b', textAlign: 'center', wordBreak: 'keep-all',
            }}>
                {option.label}
            </div>
        </button>
    )
}
