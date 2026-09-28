/**
 * 가입·첫 설정을 마치고 /os 에 온 분께 한 번만 — 「내 SNS 주소로 나를 닮은 봇 만들기」 카드.
 * 직접 만든 봇이 아직 없고, /home 에서 넣어 둔 주소(초안)도 없을 때만 띄운다.
 */
export const TWIN_START_CARD_KEY = 'curi_twin_start_card_done'

export const TWIN_START_COPY = {
    title: '내 SNS 주소로 나를 닮은 봇 만들기',
    body: '블로그·인스타 주소만 넣으면 내 말투를 닮은 봇을 만들어 드려요',
    cta: '주소 넣고 만들기',
    close: '다음에 할게요',
} as const

export function shouldShowTwinStartCard(o: { guest: boolean; demo: boolean; hasHomeDraft: boolean; hasOwnBot: boolean; done: boolean }): boolean {
    return !o.guest && !o.demo && !o.hasHomeDraft && !o.hasOwnBot && !o.done
}
