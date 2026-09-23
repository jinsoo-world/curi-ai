// domains/os/feeds — 「계정 연결」 바깥 입구 (서버 전용. 화면은 ./types 만 가져간다)
export * from './types'
export { syncFeed, FETCHERS, FEED_CAP_FULL_NOTE, SYNC_LOOKBACK_MS, loadExistingSources } from './sync'
export type { SyncResult, SyncOptions } from './sync'
export { listFeeds, getFeed, listDueFeeds, createFeed, deleteFeed, validateHandle, FeedTableMissing, MAX_FEEDS_PER_BOT } from './store'
export { SOCIAL_STUB_NOTE } from './social-stub'
