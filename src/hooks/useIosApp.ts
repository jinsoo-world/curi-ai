'use client'
import { useSyncExternalStore } from 'react'
import { isIosAppClient } from '@/lib/app-shell'

const subscribe = () => () => {}

/**
 * 아이폰 앱 안이면 true, 웹이면 false. 서버 그림과 처음 맞출 때만 null (아직 모름).
 * 결제처럼 앱에서 보이면 안 되는 것은 「false 일 때만」 그려서, 앱에서 한 순간도 안 보이게 한다.
 */
export function useIosApp(): boolean | null {
    return useSyncExternalStore<boolean | null>(subscribe, () => isIosAppClient(), () => null)
}
