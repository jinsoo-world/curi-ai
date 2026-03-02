// 큐리 AI — Service Worker
// 오프라인 폴백 + 정적 자산 캐싱

const CACHE_NAME = 'curi-ai-v1'
const OFFLINE_URL = '/offline.html'

// 캐시할 정적 자산
const PRECACHE_URLS = [
    '/',
    '/offline.html',
    '/manifest.json',
]

// Service Worker 설치
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_URLS)
        })
    )
    self.skipWaiting()
})

// 활성화 — 이전 캐시 정리
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        })
    )
    self.clients.claim()
})

// 네트워크 요청 처리 — 네트워크 우선, 실패 시 캐시 → 오프라인 페이지
self.addEventListener('fetch', (event) => {
    // API 요청은 캐시하지 않음
    if (event.request.url.includes('/api/')) return

    // 네비게이션 요청 (페이지 이동)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(OFFLINE_URL)
            })
        )
        return
    }

    // 일반 자산 — 네트워크 우선, 캐시 폴백
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 성공한 응답 캐시
                if (response.ok) {
                    const clone = response.clone()
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone)
                    })
                }
                return response
            })
            .catch(() => {
                return caches.match(event.request)
            })
    )
})
