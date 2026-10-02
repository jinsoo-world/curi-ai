// 클래스 이름 합치기. 빈 값·false 는 빠진다. (큐리어스 본체는 tailwind-merge 를 쓰지만 여기선 의존성을 늘리지 않는다)
export function cn(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ')
}
