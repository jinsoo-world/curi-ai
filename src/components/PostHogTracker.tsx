'use client'

/**
 * PostHog — 사람이 화면에서 무엇을 하는지 본다
 *
 * 대표 지시 2026-09-15 = 「응 posthog도 넣어」
 * 회사 규칙(0906) = 행동 데이터를 말할 때 Clarity 와 PostHog 두 개를 반드시 직접 연다.
 *
 * GA 는 「몇 명이 왔나」를 세고, PostHog 는 「그 사람이 어디서 막혔나」를 본다.
 * 사진을 올리고 나서 만들기를 안 누른 사람이 몇 명인지는 GA 로 못 센다.
 */
import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

export default function PostHogTracker() {
    const pathname = usePathname()
    const searchParams = useSearchParams()

    useEffect(() => {
        if (!KEY || posthog.__loaded) return
        posthog.init(KEY, {
            api_host: HOST,
            capture_pageview: false,       // 아래에서 직접 보낸다(화면 이동을 놓치지 않게)
            capture_pageleave: true,
            autocapture: true,
            person_profiles: 'identified_only',
        })
    }, [])

    useEffect(() => {
        if (!KEY || !posthog.__loaded) return
        const q = searchParams?.toString()
        posthog.capture('$pageview', {
            $current_url: window.location.origin + pathname + (q ? `?${q}` : ''),
        })
    }, [pathname, searchParams])

    return null
}
