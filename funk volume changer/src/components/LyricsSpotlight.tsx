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
}: LyricsSpotlightProps) {
  const hasLyrics = syncedLines.length > 0 || lyrics
  if (!hasLyrics && !lyricsLoading && !lyricsError) return null

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
            {syncedLines.map((line, i) => {
              const posClass = getLineClass(i, activeLyricIdx)
              const isActive = posClass === 'active'

              return (
                <p
                  key={i}
                  className={`spotlight-line ${posClass ?? 'hidden'} ${isActive ? 'glow-sweep' : ''}`}
                  style={isActive ? {
                    '--line-duration': `${activeLyricDuration}s`,
                    // Force animation restart when active line changes
                    animationName: 'sweep',
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
