// 브라우저 전용: 사진을 긴 변 1280px JPEG 로 줄여 data URL 로 (서버 4.5MB 벽 아래로, SNS 캡처 올리기에 쓴다)
export async function shrinkImage(file: File, maxSide = 1280, quality = 0.82): Promise<string> {
    const url = URL.createObjectURL(file)
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image()
            i.onload = () => resolve(i)
            i.onerror = () => reject(new Error('사진을 못 열었어요'))
            i.src = url
        })
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('사진을 못 열었어요')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL('image/jpeg', quality)
    } finally {
        URL.revokeObjectURL(url)
    }
}
