'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import CreditClaimModal from '@/components/CreditClaimModal'

export default function CreditClaimWrapper() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [showModal, setShowModal] = useState(false)

    useEffect(() => {
        // 기존: 배너 클릭으로 열기
        if (searchParams.get('claim_credit') === 'true') {
            setShowModal(true)
            return
        }

        // 신규 유저: 1.5초 후 자동 팝업
        if (searchParams.get('new_user') === 'true') {
            const timer = setTimeout(() => {
                setShowModal(true)
            }, 1500)

            // 🔗 비회원→회원 전환 트래킹: visitor_id 연결
            try {
                const visitorId = localStorage.getItem('curi_visitor_id')
                if (visitorId) {
                    fetch('/api/user/link-visitor', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ visitorId }),
                    }).catch(() => {})
                }
            } catch {}

            return () => clearTimeout(timer)
        }
    }, [searchParams])

    const handleClose = () => {
        setShowModal(false)
        // URL에서 쿼리 파라미터 제거
        router.replace('/mentors')
    }

    const handleComplete = () => {
        setShowModal(false)
        // sessionStorage 캐시 무효화 (사이드바 프로필 갱신용)
        try { sessionStorage.removeItem('sidebar_profile') } catch {}
        window.dispatchEvent(new Event('profile_updated'))
        router.replace('/mentors')
    }

    return (
        <CreditClaimModal
            isOpen={showModal}
            onClose={handleClose}
            onComplete={handleComplete}
        />
    )
}
