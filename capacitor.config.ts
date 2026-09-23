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
    },
    ios: {
        contentInset: 'automatic', // 노치·홈 표시줄만큼 알아서 띄운다
        backgroundColor: '#0B0B0C',
        // 화면 안 링크가 다른 사이트로 가면 앱 안에서 열지 않고 사파리로 넘긴다
        allowsLinkPreview: false,
    },
}

export default config
