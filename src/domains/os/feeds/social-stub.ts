// domains/os/feeds/social-stub — X, Instagram, TikTok 자리.
//
// 이 세 곳은 공식 열쇠(유료, 심사)가 있어야 글을 정당하게 가져올 수 있다.
// 몰래 긁거나 우회하지 않는다. 연결 줄, 목록, 끊기는 되지만 가져오기는 「준비 중」을 돌려준다.
// 켜는 데 필요한 것 = docs/feeds/공식_API_열쇠.md

import type { FetchNewItems } from './types'

export const SOCIAL_STUB_NOTE = '준비 중(관리자가 열쇠를 등록해야 해요)'

export const fetchSocialStubItems: FetchNewItems = async () => ({ items: [], note: SOCIAL_STUB_NOTE })
