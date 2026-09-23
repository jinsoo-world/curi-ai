# 큐리AI 를 「앱처럼 설치」하기 (PWA) — 2026-09-23

앱스토어 없이, 지금 사이트(https://www.curi-ai.com/os)를 아이폰·맥에 앱처럼 깔아 쓰는 방법과 코드 위치.

## 대표가 하는 것 (그대로 따라 하면 됨)

**아이폰** (사파리로 열어야 함. 크롬 앱은 안 됨)
1. 사파리에서 https://www.curi-ai.com/os 를 열고 로그인한다.
2. 화면 아래 **공유 단추**(네모에서 화살표가 위로 나가는 모양)를 누른다 → 목록을 내려 **「홈 화면에 추가」**를 누른다.
3. 오른쪽 위 **「추가」**. 홈 화면에 초록 네잎클로버 「큐리AI」가 생긴다. 이걸로 열면 주소창 없이 앱처럼 뜬다.

**맥**
- 크롬: https://www.curi-ai.com/os 를 열면 주소창 오른쪽 끝에 **설치 아이콘**(모니터에 화살표)이 뜬다 → 누르고 **「설치」**. 독(Dock)에 큐리AI가 생긴다.
- 사파리: 위 메뉴 **파일 → Dock에 추가…** → **「추가」**.
- 화면 왼쪽 명단 아래 **「📱 앱으로 설치」** 줄을 눌러도 같은 안내가 나온다.

## 코드 위치

| 파일 | 하는 일 |
|---|---|
| `public/manifest.json` | 앱 이름 「큐리AI」·시작 화면 `/os`·바탕색 `#0B0B0C`·아이콘 4개·바로가기 2개(내 팀 `/os`, 새 봇 `/os?new=1`) |
| `public/sw.js` | 서비스 워커. `=== 캐시·오프라인 (설치형 앱) ===` 블록 = 껍데기 저장 + 인터넷 끊기면 `offline.html`. API(`/api/`)는 절대 저장 안 함. 파일 끝 `=== push (메시징) ===` 블록은 알림 담당 자리 |
| `public/offline.html` | 인터넷 끊겼을 때 화면(다크·쉬운 말·「다시 열기」). 인터넷 돌아오면 저절로 다시 연다 |
| `public/icons/curi-*.png`, `apple-touch-icon-180.png` | 새 아이콘(초록 바탕·하얀 네잎클로버·봇 눈). 옛 `icon-192x192.png`·`icon-512x512.png` 는 홈 화면 사진이 찍힌 시안이라 안 쓴다(파일은 남겨 둠) |
| `src/components/pwa/RegisterSW.tsx` | 배포(프로덕션)에서만 서비스 워커 등록. 루트 `layout.tsx` 에 한 줄 |
| `src/components/pwa/InstallPrompt.tsx` + `pwa.css` | 「📱 앱으로 설치」 줄. 크롬=단추 한 번 / 아이폰 사파리=3걸음 안내 / 맥 사파리=한 줄. 이미 앱으로 열려 있으면 안 보임. 폰에서는 아래 띠, × 누르면 7일 숨김 |
| `src/app/os/layout.tsx` | `/os` 만 themeColor `#0B0B0C` + `viewport-fit=cover` |
| `src/components/os/os.css` 좁은 화면 규칙 끝 | 노치·홈 표시줄만큼 띄우기(`env(safe-area-inset-*)`) |

## 설치 가능 조건 체크리스트 (배포 뒤 한 번 확인)

- [ ] https 로 열림 (Vercel 은 기본)
- [ ] `curl -sI https://www.curi-ai.com/manifest.json` → 200
- [ ] `curl -sI https://www.curi-ai.com/sw.js` → 200
- [ ] `curl -sI https://www.curi-ai.com/offline.html` → 200
- [ ] `curl -sI https://www.curi-ai.com/icons/curi-512.png` → 200
- [ ] 크롬 → 개발자도구 → Application → Manifest 에 「큐리AI」·아이콘이 보이고 「Installability」 경고 0
- [ ] 아이폰 사파리에서 홈 화면 추가 → 아이콘이 네잎클로버, 열면 주소창 없음, 상태바 검정
- [ ] 비행기 모드로 앱 열기 → 「인터넷이 끊겼어요」 화면

로컬 확인 = `npm run build && npx next start -p 3030` 뒤 위 curl 을 `http://localhost:3030` 으로.

## 주의

- 서비스 워커는 개발(`npm run dev`)에서는 등록하지 않는다. 옛 파일이 저장돼 화면이 안 바뀌는 것처럼 보이기 때문.
- 껍데기 파일(offline·아이콘)을 바꾸면 `sw.js` 의 `SHELL_CACHE` 끝 숫자를 올린다.
- 아이폰은 「웹 푸시 알림」도 홈 화면에 추가한 뒤에만 된다(iOS 16.4+). 알림은 `sw.js` push 블록 담당.
