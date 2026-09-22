// 웹푸시 열쇠(VAPID) 한 쌍을 만든다. 출력만 하고 어디에도 저장하지 않는다.
//   node scripts/webpush-keys.mjs
// 나온 두 줄을 Vercel 환경변수(Sensitive)에 넣는다. 비밀 열쇠는 코드·문서·슬랙 어디에도 적지 않는다.
import webpush from 'web-push'

const { publicKey, privateKey } = webpush.generateVAPIDKeys()
console.log('# Vercel 환경변수에 그대로 넣으세요 (비밀 열쇠는 Sensitive 로)')
console.log(`WEBPUSH_VAPID_PUBLIC=${publicKey}`)
console.log(`WEBPUSH_VAPID_PRIVATE=${privateKey}`)
console.log('WEBPUSH_SUBJECT=mailto:연락받을주소@도메인')
