# 애플로 로그인 (2026-10-05)

앱스토어 심사 4.8: 카카오, 구글 같은 다른 소셜 로그인이 있으면 「Apple로 로그인」도 같이 있어야 한다.

## 지금 코드가 하는 일
- 웹 로그인 화면(/login)에 **Apple로 시작하기** 단추가 있다. 단, **Supabase 쪽 애플 설정이 끝나 실제로 열려 있을 때만** 보인다.
  `/api/auth/apple-ready` 가 5분마다 Supabase 에 물어 확인한다. 열리지 않았으면 단추는 숨고, 카카오, 구글 로그인은 그대로다.
  대표가 설정을 마치면 **다시 배포하지 않아도** 단추가 저절로 나타난다. 긴급히 끄려면 환경변수 `APPLE_LOGIN_DISABLED=1`.
- 로그인이 끝나면 카카오, 구글과 같은 길(`/auth/callback` → 가입 선물, 약관 시각, 회원 행)을 탄다.
- 애플이 첫 로그인 때 한 번만 주는 refresh token 을 잠가서(`apple_login_tokens`, AES-256-GCM) 보관한다. 탈퇴할 때 애플 쪽 연결을 끊는 데 쓰고 바로 지운다.
- 회원 탈퇴(`/api/account/delete`)는 애플 사용자면 애플 토큰을 끊는다(앱스토어 5.1.1(v)). 순서: ①웹 로그인 때 보관한 열쇠가 있으면 그걸로 ②없으면 앱이 보낸 `appleAuthorizationCode` 로. 끊기가 실패해도 탈퇴는 계속된다.

## 대표가 준비할 것 (애플 개발자 사이트 + Supabase). 빠지면 단추는 안 보인다
서버에는 이미 `APPLE_SIWA_KEY_ID`, `APPLE_SIWA_TEAM_ID`(2NS5S224QL), `APPLE_SIWA_CLIENT_ID`(com.missiondriven.curiai), `APPLE_SIWA_PRIVATE_KEY`(.p8)가 있다. 이 4개는 **앱(번들 ID)용**이다. 웹 로그인에는 하나가 더 필요하다.
1. **Services ID 만들기**: developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → `+` → Services IDs. 예: `com.missiondriven.curiai.web`.
   - Sign in with Apple 켜고 Configure: Primary App ID = com.missiondriven.curiai
   - Domains: `ueemicebrauwddtzvuyb.supabase.co`
   - Return URLs: `https://ueemicebrauwddtzvuyb.supabase.co/auth/v1/callback`
2. **키**: 이미 있는 Sign in with Apple 키(Key ID 가 APPLE_SIWA_KEY_ID)를 그대로 써도 된다. 그 키의 Primary App ID 가 com.missiondriven.curiai 여야 한다.
3. **Supabase 설정**: 대시보드 → Authentication → Providers → Apple
   - Enabled: 켜짐(이미 켜져 있음)
   - Client IDs: `com.missiondriven.curiai.web,com.missiondriven.curiai` (웹 Services ID 를 맨 앞에, 앱 번들 ID 를 뒤에)
   - Secret Key (for OAuth): `node scripts/apple-client-secret.mjs` 로 만든 JWT 한 줄 (6개월마다 새로 만들어 교체)
4. **Vercel 환경변수 추가**: `APPLE_SIWA_WEB_CLIENT_ID` = 위 Services ID (탈퇴 때 웹 로그인 연결을 끊는 데 쓴다)
5. Supabase → Authentication → URL Configuration 의 Redirect URLs 에 `https://www.curi-ai.com/auth/callback` 이 있어야 한다(카카오, 구글이 이미 쓰는 값).

## 아이폰 앱 (Capacitor 껍데기, ios/)
- 앱은 https://www.curi-ai.com/os 를 그대로 보여 주므로 위 웹 단추가 앱 안에서도 그대로 나온다.
- `capacitor.config.ts` 의 `server.allowNavigation` 에 애플, Supabase 주소를 넣었다. 없으면 애플 로그인 화면이 앱이 아니라 사파리로 넘어가 로그인이 앱으로 돌아오지 않는다.
- `npx cap sync ios` 후 Xcode 에서 다시 빌드해야 반영된다(새 심사 빌드에 포함).
- 앱 안에서는 웹 카드결제(토스)와 가격 안내가 숨는다(앱스토어 3.1.1). 요금제 화면에는 「요금제는 웹사이트에서 확인할 수 있어요」 한 줄만 나온다. 앱 표시: 화면 쪽 `window.Capacitor`, 서버 쪽 User-Agent 의 `CuriAIApp/ios`(앱을 새로 빌드해야 붙음).

## 네이티브 앱(SwiftUI, curi-ai-ios)이 애플 로그인을 붙일 때 (Bearer 방식, #23)
1. `ASAuthorizationAppleIDProvider` 로 로그인 요청. 요청마다 무작위 `nonce` 를 만들고, 애플에는 `sha256(nonce)` 를, 아래 Supabase 에는 원문 `nonce` 를 보낸다. scopes: `.fullName, .email`.
2. 받은 `identityToken`(JWT 문자열)을 Supabase 에 교환:
   `POST https://ueemicebrauwddtzvuyb.supabase.co/auth/v1/token?grant_type=id_token`
   헤더 `apikey: <publishable key>`, 본문 `{ "provider": "apple", "id_token": "<identityToken>", "nonce": "<원문 nonce>" }`
   → 응답의 `access_token` 이 앱의 로그인 표시. (이 길은 Supabase 의 Client IDs 에 앱 번들 ID `com.missiondriven.curiai` 만 있으면 되고, Secret Key 는 필요 없다)
3. 이후 모든 요청에 `Authorization: Bearer <access_token>`. 로그인 직후 한 번 `POST /api/auth/app-login` (본문 `{ termsAt?, displayName?, refCode? }`). **애플은 이름을 첫 로그인 때 한 번만** 주므로 `fullName` 을 `displayName` 으로 같이 보낸다.
4. 탈퇴 때는 로그인 때 받은 `authorizationCode`(`ASAuthorizationAppleIDCredential.authorizationCode`)를 `POST /api/account/delete` 본문 `{ "confirm": "탈퇴", "appleAuthorizationCode": "<코드>" }` 로 같이 보낸다. 서버가 애플 토큰을 끊는다. 코드는 몇 분만 유효하니 탈퇴 화면에서 애플 재인증으로 새로 받는다.
5. Xcode: Signing & Capabilities 에 **Sign in with Apple** 추가(App ID 에도 켜져 있어야 함).
