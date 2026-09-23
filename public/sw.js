// 큐리AI 서비스 워커 = 브라우저 뒤에서 조용히 돌며 「앱 껍데기」를 저장해 두고, 인터넷이 끊기면 안내 화면을 보여준다.
// 파일은 블록 2개로 나눈다. 각 블록은 서로 다른 사람이 손대도 부딪히지 않게 표식 안에만 쓴다.
//   1) === 캐시·오프라인 (설치형 앱) ===   ← 이 파일의 지금 내용
//   2) === push (메시징) ===               ← 파일 끝. 알림(푸시) 담당이 채운다

// === 캐시·오프라인 (설치형 앱) ===

// 껍데기 저장소 이름. 껍데기 파일을 바꾸면 끝 숫자를 올린다 → 옛 저장소는 아래 activate 에서 지워진다.
const SHELL_CACHE = 'curi-ai-shell-v3'
const OFFLINE_URL = '/offline.html'

// 설치할 때 미리 저장하는 것 = 인터넷 없이도 보여야 하는 최소한
const SHELL_URLS = [
    OFFLINE_URL,
    '/manifest.json',
    '/icons/curi-192.png',
    '/icons/curi-512.png',
]

// 설치 = 껍데기 저장 + 바로 새 워커로 교체
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)),
    )
    self.skipWaiting()
})

// 켜질 때 = 이름이 다른(옛) 저장소는 전부 지운다
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names
                    .filter((name) => name.startsWith('curi-ai-') && name !== SHELL_CACHE)
                    .map((name) => caches.delete(name)),
            ),
        ),
    )
    self.clients.claim()
})

// 요청 처리 규칙
//  - API(/api/…)·다른 사이트 요청·GET 아닌 것 = 손대지 않는다 (대화·결제·로그인은 절대 저장 금지)
//  - 화면 이동(navigate) = 인터넷 먼저 → 안 되면 오프라인 안내
//  - /_next/static/… (이름에 지문이 박힌 파일) = 저장한 게 있으면 그걸 먼저, 없으면 받아서 저장
//  - 아이콘·매니페스트·이미지 = 저장한 걸 보여주고 뒤에서 새로 받아 둔다
self.addEventListener('fetch', (event) => {
    const req = event.request
    if (req.method !== 'GET') return

    const url = new URL(req.url)
    if (url.origin !== self.location.origin) return          // 다른 사이트(글꼴 CDN·저장소)는 브라우저가 알아서
    if (url.pathname.startsWith('/api/')) return              // API 는 저장 금지
    if (url.pathname.startsWith('/sw.js')) return

    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).catch(async () => {
                const cache = await caches.open(SHELL_CACHE)
                return (await cache.match(OFFLINE_URL)) || Response.error()
            }),
        )
        return
    }

    if (url.pathname.startsWith('/_next/static/')) {
        event.respondWith(cacheFirst(req))
        return
    }

    if (
        url.pathname.startsWith('/icons/') ||
        url.pathname === '/manifest.json' ||
        req.destination === 'image' ||
        req.destination === 'font'
    ) {
        event.respondWith(staleWhileRevalidate(req))
        return
    }
    // 나머지(RSC 데이터 등)는 평소처럼 인터넷으로
})

async function cacheFirst(req) {
    const cache = await caches.open(SHELL_CACHE)
    const hit = await cache.match(req)
    if (hit) return hit
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
}

async function staleWhileRevalidate(req) {
    const cache = await caches.open(SHELL_CACHE)
    const hit = await cache.match(req)
    const refresh = fetch(req)
        .then((res) => {
            if (res.ok) cache.put(req, res.clone())
            return res
        })
        .catch(() => hit)
    return hit || refresh
}

// 화면에서 「지금 바로 새 버전으로」 라고 하면 기다리지 않고 교체
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

// === 캐시·오프라인 끝 ===


// === push (메시징) ===
// 서버(web-push)가 보낸 알림을 화면에 띄우고, 누르면 /os 로 간다.
// 이 블록만 메시징 담당. 캐시·오프라인 블록은 위에 따로 있다.
self.addEventListener('push', (event) => {
    let data = { title: '큐리AI', body: '', url: '/os' }
    try { data = { ...data, ...event.data.json() } } catch { if (event.data) data.body = event.data.text() }
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            data: { url: data.url },
            tag: data.tag || undefined,
        })
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = (event.notification.data && event.notification.data.url) || '/os'
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const c of list) {
                if ('focus' in c) { c.navigate(url); return c.focus() }
            }
            return self.clients.openWindow(url)
        })
    )
})
// === /push (메시징) ===
