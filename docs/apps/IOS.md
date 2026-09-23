# 큐리AI 아이폰 앱 뼈대 (Capacitor) — 2026-09-23

`ios/` 폴더 = 아이폰 앱 껍데기. 앱을 열면 https://www.curi-ai.com/os 를 그대로 보여준다(서버 URL 방식).
그래서 **웹을 배포하면 앱도 같이 새로워진다.** 앱 안에 코드가 없어 앱스토어 재심사 없이 화면을 바꿀 수 있다.

## 지금 상태 (2026-09-23 08:50)
- 만든 것: `capacitor.config.ts`(앱 이름 큐리AI · 아이디 `com.missiondriven.curiai` · 주소 `/os`), `ios/`(Xcode 프로젝트, 아이콘 = 네잎클로버 1024).
- **이 컴퓨터(맥북)에는 Xcode 가 없다**(커맨드라인 도구만). 그래서 시뮬레이터는 아직 안 띄웠다. 아래 1번을 하면 바로 뜬다.
- 의존성 = `@capacitor/core`·`@capacitor/cli`·`@capacitor/ios` (전부 무료). CocoaPods 없이 Swift 패키지(SPM) 방식.

## 1. Xcode 설치 (한 번, 무료, 약 12GB·30분)
앱스토어에서 **Xcode** 검색 → 받기. 끝나면 터미널에서
```bash
sudo xcode-select -s /Applications/Xcode.app
sudo xcodebuild -license accept
xcodebuild -runFirstLaunch
```

## 2. 열기·빌드·시뮬레이터
```bash
cd ~/dev/curi-ai            # (이 저장소)
npx cap sync ios            # 설정을 ios/ 에 반영
npx cap open ios            # Xcode 가 열린다
```
Xcode 위쪽에서 기기를 **iPhone 16(시뮬레이터)** 로 고르고 ▶ 를 누른다. 아이폰 화면이 뜨고 큐리AI 가 열린다.
터미널로 하려면 `npx cap run ios` (기기 목록에서 고르기).

## 3. 내 아이폰에 직접 넣기 (무료, 7일마다 다시 서명)
1. 아이폰을 맥에 케이블로 연결 → 아이폰에서 「이 컴퓨터를 신뢰」.
2. Xcode → 왼쪽 **App** → **Signing & Capabilities** → Team 에 **본인 애플 계정(무료 Personal Team)** 선택.
3. 위 기기를 내 아이폰으로 고르고 ▶. 처음엔 아이폰 **설정 → 일반 → VPN 및 기기 관리** 에서 개발자 앱 신뢰.
- 무료 계정은 7일 뒤 앱이 안 열린다 → Xcode 에서 다시 ▶. 오래 쓰려면 아래 유료 계정.

## 4. 앱스토어 제출 준비물 (⚠️ 돈 드는 것 = 대표 사전승인)
| 항목 | 내용 |
|---|---|
| 애플 개발자 계정 | **연 129,000원**(개인 또는 회사. 회사면 D-U-N-S 번호 필요, 발급 1~2주) — 승인 전엔 진행 안 함 |
| 심사 | 보통 1~3일. 「웹사이트를 감싼 앱」은 거절 사유(4.2 최소 기능)가 될 수 있어 알림·홈 화면 바로가기·오프라인 화면처럼 **앱만의 기능**을 같이 보여준다 |
| 개인정보 | 개인정보처리방침 주소(https://www.curi-ai.com/privacy) · 앱 개인정보 라벨(수집: 이메일·대화·결제기록) · 계정 삭제 길(앱 안에서) |
| 그림 | 아이콘 1024(있음) · 스크린샷 6.7형·6.1형 각 3장 이상 |
| 결제 | 앱 안에서 클로버(선불) 결제는 애플 인앱결제(수수료 30%) 대상. 첫 제출은 결제 화면을 웹으로 넘기거나 숨긴다 |

## 5. 손대는 곳
- 앱 이름·주소 = `capacitor.config.ts` → `npx cap sync ios`
- 아이콘 = `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`(1024×1024)
- 커밋에서 뺀 것(`ios/.gitignore`) = `App/App/public`(웹 복사본 18MB)·`App/Pods`·`App/build`·`DerivedData`·생성 설정 2개
