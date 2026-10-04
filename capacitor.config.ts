// 큐리AI 아이폰 껍데기(Capacitor) 설정.
// 방식 = 「서버 URL」: 앱 안에 코드를 넣지 않고, 앱을 열면 우리 사이트(/os)를 그대로 보여준다.
// 그래서 웹을 배포하면 앱도 같이 새로워진다. 앱스토어 재심사 없이 화면을 바꿀 수 있다.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
    appId: 'com.missiondriven.curiai',
    appName: '큐리AI',
    // 서버 URL 방식이라 실제로는 안 쓰지만 Capacitor 가 폴더 하나를 요구한다. public/ 을 가리킨다
    webDir: 'public',
    server: {
        url: 'https://www.curi-ai.com/os',
        cleartext: false,          // http(암호화 안 된 주소) 금지
        // 애플 로그인(웹 방식)이 앱 안 화면에서 돌게 허용한다. 목록에 없는 다른 사이트 주소는 사파리로 넘어가 로그인이 끊긴다
        allowNavigation: ['appleid.apple.com', 'idmsa.apple.com', '*.supabase.co'],
    },
    // 서버가 「아이폰 앱에서 온 요청」을 알아보는 표시. 앱 안에서는 웹 카드결제와 가격 안내를 숨긴다(앱스토어 3.1.1, src/lib/app-shell.ts)
    // 새로 빌드한 앱부터 붙는다. 화면 쪽은 window.Capacitor 로도 알아본다.
    appendUserAgent: 'CuriAIApp/ios',
    ios: {
        contentInset: 'automatic', // 노치·홈 표시줄만큼 알아서 띄운다
        backgroundColor: '#0B0B0C',
        // 화면 안 링크가 다른 사이트로 가면 앱 안에서 열지 않고 사파리로 넘긴다
        allowsLinkPreview: false,
    },
}

export default config
