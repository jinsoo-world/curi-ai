/**
 * 리더 개인 링크 아이콘 — 대표 지시 2026-09-16 (대표가 보낸 화면 = 둥근 아이콘이 나란히)
 *
 * 브랜드 로고를 그대로 쓰지 않는다. 각 채널의 색과 한 글자로 알아보게 한다.
 * 인스타·유튜브만 모양으로 그린다 — 글자로는 알아보기 어려운 둘이다.
 */
import { getLinkKind } from '@/domains/creator/links'

export default function LinkIcon({ kind, size = 34 }: { kind: string; size?: number }) {
    const k = getLinkKind(kind)
    const 색 = k?.color ?? '#52525b'
    // 노란 카카오 바탕엔 검은 글자라야 읽힌다
    const 글자색 = kind === 'kakao' ? '#3C1E1E' : '#fff'

    return (
        <span
            aria-hidden
            style={{
                width: size, height: size, borderRadius: '50%', background: 색,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
            }}
        >
            {kind === 'instagram' ? (
                <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
                    <circle cx="12" cy="12" r="4.2" />
                    <circle cx="17.6" cy="6.4" r="1.2" fill="#fff" stroke="none" />
                </svg>
            ) : kind === 'youtube' ? (
                <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="#fff">
                    <path d="M8.5 6.2 19 12 8.5 17.8z" />
                </svg>
            ) : (
                <span style={{
                    color: 글자색,
                    fontSize: size * ((k?.text?.length ?? 1) >= 3 ? 0.3 : 0.42),
                    fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1,
                }}>
                    {k?.text ?? '↗'}
                </span>
            )}
        </span>
    )
}
