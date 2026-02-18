/**
 * Extract the most vibrant / dominant colour from a YouTube thumbnail.
 * Returns [r, g, b]. Falls back to white on any error or CORS issue.
 */
export async function extractVibrantColor(
  imageUrl: string,
): Promise<[number, number, number]> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve([255, 255, 255])
          return
        }

        // Down-sample for speed
        const S = 30
        canvas.width = S
        canvas.height = S
        ctx.drawImage(img, 0, 0, S, S)
        const { data } = ctx.getImageData(0, 0, S, S)

        interface Pixel {
          r: number
          g: number
          b: number
          score: number
        }
        const vibrant: Pixel[] = []

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2]
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const l = (max + min) / 510 // 0-1
          const d = max - min
          const denom = 255 - Math.abs(max + min - 255)
          const s = denom === 0 ? 0 : d / denom // 0-1

          // Skip very dark, very light, or dull
          if (l < 0.12 || l > 0.88 || s < 0.2) continue

          const lFactor = 1 - Math.abs(l - 0.5) * 2
          vibrant.push({ r, g, b, score: s * (0.4 + lFactor * 0.6) })
        }

        if (vibrant.length === 0) {
          resolve([255, 255, 255])
          return
        }

        // Take the top 20 % most vibrant and average them
        vibrant.sort((a, b) => b.score - a.score)
        const topN = Math.max(1, Math.floor(vibrant.length * 0.2))
        let rS = 0,
          gS = 0,
          bS = 0
        for (let j = 0; j < topN; j++) {
          rS += vibrant[j].r
          gS += vibrant[j].g
          bS += vibrant[j].b
        }

        // Boost saturation slightly for a vivid glow
        let rr = rS / topN,
          gg = gS / topN,
          bb = bS / topN
        const avg = (rr + gg + bb) / 3
        const boost = 1.3
        rr = Math.min(255, avg + (rr - avg) * boost)
        gg = Math.min(255, avg + (gg - avg) * boost)
        bb = Math.min(255, avg + (bb - avg) * boost)

        resolve([Math.round(rr), Math.round(gg), Math.round(bb)])
      } catch {
        resolve([255, 255, 255])
      }
    }

    img.onerror = () => resolve([255, 255, 255])
    img.src = imageUrl
  })
}
