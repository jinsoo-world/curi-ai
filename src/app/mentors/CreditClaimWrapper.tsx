'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import CreditClaimModal from '@/components/CreditClaimModal'

export default function CreditClaimWrapper() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [showModal, setShowModal] = useState(false)

    useEffect(() => {
        if (searchParams.get('claim_credit') === 'true') {
            setShowModal(true)
        }
    }, [searchParams])

    const handleClose = () => {
        setShowModal(false)
        // URL에서 쿼리 파라미터 제거
        router.replace('/mentors')
    }

    const handleComplete = () => {
        setShowModal(false)
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
