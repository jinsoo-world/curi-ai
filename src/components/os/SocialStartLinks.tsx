// 「카카오로 시작」「구글로 시작」 두 단추 (공식 로고 포함). 막힌 답 아래, 연결/스킬 화면의 로그인 안내에서 같이 쓴다 (대표 0928).
// 색: 카카오 = #FEE500 바탕 + 검정 말풍선, 구글 = 흰 바탕 + 테두리 + 네 색 G (os.css .os-login-gate-btn).
import Link from 'next/link'
import { KakaoMark, GoogleMark } from '@/components/brand/SocialMarks'
import { loginHref } from '@/domains/os/audience'

export default function SocialStartLinks({ next, className = '' }: { next: string; className?: string }) {
    return (
        <div className={`os-social-start ${className}`.trim()}>
            <Link className="os-login-gate-btn kakao" href={loginHref(next, 'kakao')} prefetch={false}>
                <KakaoMark /><span>카카오로 시작</span>
            </Link>
            <Link className="os-login-gate-btn google" href={loginHref(next, 'google')} prefetch={false}>
                <GoogleMark /><span>구글로 시작</span>
            </Link>
        </div>
    )
}
