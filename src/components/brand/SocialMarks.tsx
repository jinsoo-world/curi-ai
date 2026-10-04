// 카카오, 구글 공식 로고 (인라인 SVG, 그림 파일 없음). 「카카오로 시작」「구글로 시작」 단추 옆에 붙인다 (대표 0928).
// 카카오 = 노랑(#FEE500) 바탕 위 검정 말풍선, 구글 = 흰 바탕 + 테두리 위 네 색 G. 바탕과 테두리는 단추 쪽이 맡는다.
// 로그인 화면(/login)에 있던 모양 그대로를 여기로 옮겨 모든 단추가 같은 로고를 쓴다.

interface MarkProps { size?: number; className?: string }

/** 카카오 말풍선 (검정 #191919) */
export function KakaoMark({ size = 20, className }: MarkProps) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false" style={{ flex: 'none', display: 'block' }}>
            <path d="M10 1C4.93 1 0.833 4.213 0.833 8.167c0 2.544 1.697 4.78 4.25 6.04-.149.533-.96 3.427-.992 3.64 0 0-.02.165.088.228.107.063.234.014.234.014.309-.043 3.578-2.34 4.145-2.739.464.066.94.1 1.442.1 5.07 0 9.167-3.213 9.167-7.283C19.167 4.213 15.07 1 10 1z" fill="#191919" />
        </svg>
    )
}

/** 구글 G (파랑, 초록, 노랑, 빨강) */
export function GoogleMark({ size = 20, className }: MarkProps) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false" style={{ flex: 'none', display: 'block' }}>
            <path d="M19.6 10.23c0-.68-.06-1.36-.17-2.02H10v3.83h5.38a4.6 4.6 0 01-2 3.02v2.5h3.24c1.89-1.74 2.98-4.3 2.98-7.33z" fill="#4285F4" />
            <path d="M10 20c2.7 0 4.96-.9 6.62-2.44l-3.24-2.5c-.89.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.58-4.12H1.08v2.58A9.99 9.99 0 0010 20z" fill="#34A853" />
            <path d="M4.42 11.9A6.01 6.01 0 014.1 10c0-.66.11-1.3.32-1.9V5.52H1.08A9.99 9.99 0 000 10c0 1.61.39 3.14 1.08 4.48l3.34-2.58z" fill="#FBBC05" />
            <path d="M10 3.98c1.47 0 2.78.5 3.82 1.5l2.86-2.86A9.96 9.96 0 0010 0 9.99 9.99 0 001.08 5.52l3.34 2.58C5.2 5.74 7.4 3.98 10 3.98z" fill="#EA4335" />
        </svg>
    )
}

/** 애플 로고 (흰색). 검정 바탕 단추 위에 쓴다 (애플 로그인 단추 규정: 검정 또는 흰 바탕) */
export function AppleMark({ size = 20, className }: MarkProps) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 384 512" fill="#fff" aria-hidden="true" focusable="false" style={{ flex: 'none', display: 'block' }}>
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
        </svg>
    )
}

/** 카카오 단추 색 (공식) */
export const KAKAO_YELLOW = '#FEE500'
export const KAKAO_INK = '#191919'
