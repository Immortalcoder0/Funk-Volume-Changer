import './LyricsSpotlight.css'

interface LrcLine {
  time: number
  text: string
}

interface LyricsSpotlightProps {
  syncedLines: LrcLine[]
  activeLyricIdx: number
  lyricsLoading: boolean
  lyricsError: string
  lyrics: string | null
  activeLyricDuration: number
  glowColor?: [number, number, number]
}

function getLineClass(idx: number, activeIdx: number): string | null {
  const diff = idx - activeIdx
  if (diff === -2) return 'past-2'
  if (diff === -1) return 'past-1'
  if (diff === 0) return 'active'
  if (diff === 1) return 'next-1'
  if (diff === 2) return 'next-2'
  return null
}

export default function LyricsSpotlight({
  syncedLines,
  activeLyricIdx,
  lyricsLoading,
  lyricsError,
  lyrics,
  activeLyricDuration,
  glowColor = [255, 255, 255],
}: LyricsSpotlightProps) {
  const hasLyrics = syncedLines.length > 0 || lyrics
  if (!hasLyrics && !lyricsLoading && !lyricsError) return null

  const [gr, gg, gb] = glowColor

  // Blend 60% white + 40% artwork color for the karaoke fill
  const mix = (white: number, color: number, t: number) => Math.round(white * (1 - t) + color * t)
  const t = 0.4 // blend ratio (0 = pure white, 1 = pure artwork color)
  const fillR = mix(255, gr, t)
  const fillG = mix(255, gg, t)
  const fillB = mix(255, gb, t)

  const sweepFill = `rgb(${fillR}, ${fillG}, ${fillB})`
  const sweepDim = `rgba(${fillR}, ${fillG}, ${fillB}, 0.3)`

  const glowFilter = [
    `drop-shadow(0 0 8px rgba(${gr}, ${gg}, ${gb}, 0.55))`,
    `drop-shadow(0 0 22px rgba(${gr}, ${gg}, ${gb}, 0.25))`,
    `drop-shadow(0 0 40px rgba(${gr}, ${gg}, ${gb}, 0.1))`,
  ].join(' ')

  return (
    <div className="lyrics-spotlight">
      <div className="lyrics-spotlight__inner">
        {lyricsLoading && (
          <p className="lyrics-spotlight__status">Searching for lyrics…</p>
        )}

        {lyricsError && (
          <p className="lyrics-spotlight__status">{lyricsError}</p>
        )}

        {!lyricsLoading && !lyricsError && syncedLines.length > 0 && (
          <div className="lyrics-spotlight__lines">
            {[-2, -1, 0, 1, 2].map(offset => {
              const i = activeLyricIdx + offset
              if (i < 0 || i >= syncedLines.length) return null

              const line = syncedLines[i]
              const posClass = getLineClass(i, activeLyricIdx)!
              const isActive = offset === 0

              return (
                <p
                  // Use actual line index as key so React tracks each line
                  // through its position transitions (next→active→past)
                  key={i}
                  className={`spotlight-line ${posClass} ${isActive ? 'glow-sweep' : ''}`}
                  style={isActive ? {
                    '--line-duration': `${activeLyricDuration}s`,
                    '--sweep-fill': sweepFill,
                    '--sweep-dim': sweepDim,
                    filter: glowFilter,
                  } as React.CSSProperties : undefined}
                >
                  {line.text}
                </p>
              )
            })}
          </div>
        )}

        {!lyricsLoading && !lyricsError && syncedLines.length === 0 && lyrics && (
          <div className="lyrics-spotlight__lines lyrics-spotlight__plain">
            {lyrics.split('\n').slice(0, 5).map((line, i) => (
              <p key={i} className="spotlight-line plain">
                {line || '\u00A0'}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
