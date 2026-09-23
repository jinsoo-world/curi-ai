# 큐리AI 맥 앱 — 2026-09-23

**당장의 방법(오늘 바로 됨) = 맥 크롬·사파리 「독에 추가」.** 설치 프로그램(.dmg)은 아직 만들지 않았다(아래 이유).

## 대표가 하는 것
- **크롬**: https://www.curi-ai.com/os 를 열면 주소창 오른쪽 끝에 **설치 아이콘**(모니터에 화살표) → **「설치」**. 독(Dock)에 큐리AI 가 생기고 따로 창으로 열린다.
- **사파리**: 위 메뉴 **파일 → Dock에 추가…** → **「추가」**.
- 화면 왼쪽 명단 아래 **「📱 앱으로 설치」** 를 눌러도 같은 안내가 뜬다.

## .dmg 설치 프로그램(Tauri)을 안 만든 이유
- 이 컴퓨터에 **Rust 가 없다**(`cargo` 없음). Tauri 는 Rust 로 껍데기를 굽는다.
- Rust 설치 = 무료, 한 줄, 약 5분:
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  source ~/.cargo/env && cargo --version
  ```
- 그 뒤 만드는 순서(다음 세션):
  ```bash
  npm i -D @tauri-apps/cli@^2      # 무료
  npx tauri init                   # src-tauri/ 생성. 창 제목 「큐리AI」, url https://www.curi-ai.com/os
  npm run tauri build              # src-tauri/target/release/bundle/dmg/큐리AI_*.dmg
  ```
  `src-tauri/tauri.conf.json` 의 `app.windows[0].url` 을 `https://www.curi-ai.com/os` 로 두면 웹 배포가 곧 앱 갱신이다(아이폰 껍데기와 같은 방식).

## ⚠️ 돈·승인이 필요한 것 (대표 사전승인 전 진행 안 함)
| 항목 | 내용 |
|---|---|
| 코드 서명·공증 | 서명 안 한 .dmg 는 맥이 「확인되지 않은 개발자」라며 막는다(우클릭 → 열기로 우회 가능). 제대로 하려면 애플 개발자 계정 **연 129,000원**(아이폰과 같은 계정 하나면 됨) + 공증(notarize) 절차 |
| 맥 앱스토어 | 같은 계정. 심사 1~3일. 첫 목표 아님 |

## 정리
| 방법 | 오늘 됨? | 돈 | 갱신 |
|---|---|---|---|
| 크롬·사파리 독에 추가 (PWA) | **됨** | 0 | 웹 배포 즉시 |
| Tauri .dmg (서명 없음) | Rust 설치 뒤 | 0 | 웹 배포 즉시 |
| Tauri .dmg 서명·공증 | 계정 뒤 | 연 129,000원 | 웹 배포 즉시 |
