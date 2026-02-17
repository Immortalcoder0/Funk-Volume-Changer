import { useState, useRef, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward, Music, Loader2, Shuffle, Repeat } from 'lucide-react'
import ElasticVolumeSlider from './components/ElasticVolumeSlider'
import LyricsSpotlight from './components/LyricsSpotlight'
import './App.css'

// ─── Lyrics Types ─────────────────────────────────
interface LrcLine {
  time: number // seconds
  text: string
}


// ─── Helpers ──────────────────────────────────────
function cleanTitle(raw: string): string {
  return raw
    .replace(/\(.*?(official|video|audio|lyric|hd|4k|full|song|mv).*?\)/gi, '')
    .replace(/\[.*?(official|video|audio|lyric|hd|4k|full|song|mv).*?\]/gi, '')
    .replace(/\|.*/g, '')
    .replace(/official\s*(music)?\s*video/gi, '')
    .replace(/\blyrics?\b/gi, '')
    .replace(/\bhd\b|\b4k\b|\bfull\s*video\b/gi, '')
    .replace(/\bft\.?\s*/gi, '')
    .replace(/\bfeat\.?\s*/gi, '')
    .replace(/[\-–—]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function parseSyncedLyrics(raw: string): LrcLine[] {
  const lines: LrcLine[] = []
  for (const line of raw.split('\n')) {
    const match = line.match(/^\[(\d{2}):(\d{2}\.\d{2})\]\s*(.*)/)
    if (match) {
      const mins = parseInt(match[1], 10)
      const secs = parseFloat(match[2])
      const text = match[3].trim()
      if (text) lines.push({ time: mins * 60 + secs, text })
    }
  }
  return lines
}

const extractVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /youtube\.com\/watch\?.*v=([^&\s]+)/
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) return match[1]
  }
  return null
}

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady?: () => void
  }
}

function App() {
  const [inputUrl, setInputUrl] = useState('')
  const [videoId, setVideoId] = useState('')
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(50)
  const [played, setPlayed] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isApiLoaded, setIsApiLoaded] = useState(false)
  const [mode, setMode] = useState<'video' | 'audio'>('video')
  const [videoTitle, setVideoTitle] = useState('')
  const [lyrics, setLyrics] = useState<string | null>(null)
  const [syncedLines, setSyncedLines] = useState<LrcLine[]>([])
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [lyricsError, setLyricsError] = useState('')
  const [activeLyricIdx, setActiveLyricIdx] = useState(-1)
  const [activeLyricDuration, setActiveLyricDuration] = useState(3)


  const playerRef = useRef<any>(null)
  const ambientPlayerRef = useRef<any>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (window.YT) {
      setIsApiLoaded(true)
      return
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const firstScriptTag = document.getElementsByTagName('script')[0]
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)
    window.onYouTubeIframeAPIReady = () => setIsApiLoaded(true)
  }, [])

  const volumeRef = useRef(volume)

  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  useEffect(() => {
    if (!videoId || !isApiLoaded) return
    setIsLoading(true)

    // Main Player
    playerRef.current = new window.YT.Player('youtube-player', {
      videoId: videoId,
      playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, mute: 0 },
      events: {
        onReady: (event: any) => {
          setIsReady(true)
          setIsLoading(false)
          setDuration(event.target.getDuration())
          event.target.setVolume(volumeRef.current)
          setPlaying(true)
          // Get video title for lyrics
          const data = event.target.getVideoData()
          if (data?.title) setVideoTitle(data.title)
          // Sync ambient player start
          if (ambientPlayerRef.current?.playVideo) ambientPlayerRef.current.playVideo()
        },
        onStateChange: (event: any) => {
          const isPlaying = event.data === window.YT.PlayerState.PLAYING
          setPlaying(isPlaying)
          // Sync ambient player state
          if (ambientPlayerRef.current) {
            if (isPlaying) ambientPlayerRef.current.playVideo()
            else ambientPlayerRef.current.pauseVideo()
          }
        },
      },
    })

    // Ambient Player (Muted, Background)
    ambientPlayerRef.current = new window.YT.Player('ambient-player', {
      videoId: videoId,
      playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, mute: 1, loop: 1, playlist: videoId },
      events: {
        onReady: (event: any) => {
          event.target.mute()
          if (playing) event.target.playVideo()
        }
      }
    })

    return () => {
      if (playerRef.current) playerRef.current.destroy()
      if (ambientPlayerRef.current) ambientPlayerRef.current.destroy()
    }
  }, [videoId, isApiLoaded])

  useEffect(() => {
    if (playing && isReady) {
      // Main progress update (1s for UI)
      progressIntervalRef.current = setInterval(() => {
        if (playerRef.current?.getCurrentTime) {
          const time = playerRef.current.getCurrentTime()
          setCurrentTime(time)
          setDuration(playerRef.current.getDuration())
          setPlayed(time / playerRef.current.getDuration())
        }
      }, 500)

      // Dedicated Sync check for ambient player (faster: 200ms)
      const syncInterval = setInterval(() => {
        if (playerRef.current?.getCurrentTime && ambientPlayerRef.current?.getCurrentTime) {
          const time = playerRef.current.getCurrentTime()
          const ambientTime = ambientPlayerRef.current.getCurrentTime()
          const diff = time - ambientTime

          // Tight sync: if off by more than 0.5s, seek
          if (Math.abs(diff) > 0.5) {
            // Seek slightly ahead to compensate for lag
            ambientPlayerRef.current.seekTo(time + 0.1, true)
          }
        }
      }, 200)

      return () => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
        clearInterval(syncInterval)
      }
    } else {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
    return () => { if (progressIntervalRef.current) clearInterval(progressIntervalRef.current) }
  }, [playing, isReady])

  // ── Fetch lyrics when video title changes ──
  useEffect(() => {
    if (!videoTitle) return
    const query = cleanTitle(videoTitle)
    if (!query) return

    let cancelled = false
    setLyricsLoading(true)
    setLyricsError('')
    setLyrics(null)
    setSyncedLines([])
    setActiveLyricIdx(-1)

    fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'FunkVolumeChanger/1.0 (https://github.com)' }
    })
      .then(res => res.json())
      .then((results: any[]) => {
        if (cancelled) return
        // Pick the first non-instrumental result with lyrics
        const best = results.find((r: any) => !r.instrumental && (r.syncedLyrics || r.plainLyrics))
        if (best) {
          setLyrics(best.plainLyrics || null)
          if (best.syncedLyrics) {
            setSyncedLines(parseSyncedLyrics(best.syncedLyrics))
          }
        } else {
          setLyricsError('No lyrics found for this track')
        }
        setLyricsLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setLyricsError('Failed to fetch lyrics')
          setLyricsLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [videoTitle])

  // ── Sync active lyrics line with playback time ──
  useEffect(() => {
    if (syncedLines.length === 0) return
    let idx = -1
    for (let i = syncedLines.length - 1; i >= 0; i--) {
      if (currentTime >= syncedLines[i].time) {
        idx = i
        break
      }
    }
    setActiveLyricIdx(idx)

    // Compute duration of the active line for CSS animation
    if (idx >= 0) {
      const lineStart = syncedLines[idx].time
      const lineEnd = idx + 1 < syncedLines.length ? syncedLines[idx + 1].time : lineStart + 4
      setActiveLyricDuration(Math.max(0.5, lineEnd - lineStart))
    }

  }, [currentTime, syncedLines])

  const handlePlayPause = () => {
    if (!playerRef.current || !isReady) return
    if (playing) {
      playerRef.current.pauseVideo()
      ambientPlayerRef.current?.pauseVideo()
    } else {
      playerRef.current.playVideo()
      ambientPlayerRef.current?.playVideo()
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTo = parseFloat(e.target.value) / 100
    const newTime = seekTo * duration
    setPlayed(seekTo)
    setCurrentTime(newTime)
    if (playerRef.current?.seekTo) {
      playerRef.current.seekTo(newTime, true)
      ambientPlayerRef.current?.seekTo(newTime, true)
    }
  }

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedUrl = inputUrl.trim()
    if (!trimmedUrl) { setError('Please enter a URL'); return }
    const extractedId = extractVideoId(trimmedUrl)
    if (!extractedId) { setError('Invalid URL'); return }
    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null }
    if (ambientPlayerRef.current) { ambientPlayerRef.current.destroy(); ambientPlayerRef.current = null }
    setError('')
    setVideoId(extractedId)
    setPlayed(0); setCurrentTime(0); setDuration(0)
    setIsReady(false); setIsLoading(true)
  }

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume)
    if (playerRef.current?.setVolume) playerRef.current.setVolume(newVolume)
  }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === 0) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          handlePlayPause()
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (playerRef.current?.getCurrentTime) {
            const t = Math.max(0, playerRef.current.getCurrentTime() - 5)
            playerRef.current.seekTo(t, true)
            ambientPlayerRef.current?.seekTo(t, true)
            setCurrentTime(t)
            setPlayed(t / duration)
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (playerRef.current?.getCurrentTime) {
            const t = Math.min(duration, playerRef.current.getCurrentTime() + 5)
            playerRef.current.seekTo(t, true)
            ambientPlayerRef.current?.seekTo(t, true)
            setCurrentTime(t)
            setPlayed(t / duration)
          }
          break
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playing, isReady, duration])

  return (
    <div className="app-container">
      {/* Floating Lyrics Spotlight — visible in both modes */}
      <LyricsSpotlight
        syncedLines={syncedLines}
        activeLyricIdx={activeLyricIdx}
        lyricsLoading={lyricsLoading}
        lyricsError={lyricsError}
        lyrics={lyrics}
        activeLyricDuration={activeLyricDuration}
      />

      {/* Ambient Background */}
      <div className="ambient-bg">
        {videoId ? (
          <div className="ambient-player-wrapper">
            <div id="ambient-player"></div>
            <div className="ambient-overlay"></div>
          </div>
        ) : (
          <>
            <div className="ambient-gradient"></div>
            <div className="ambient-overlay"></div>
          </>
        )}
      </div>

      {/* Main Content */}
      <div className="main-layout">
        {/* Top Section - Video Area (70%) */}
        <div className="video-section">
          {/* URL Input - Top Left */}
          <div className="input-area">
            <form onSubmit={handleUrlSubmit} className="url-form-inline">
              <input type="text" placeholder="Paste YouTube URL..." value={inputUrl} onChange={(e) => setInputUrl(e.target.value)} className="url-input-inline" />
              <button type="submit" className="load-btn-inline" disabled={isLoading || !isApiLoaded}>
                {isLoading ? <Loader2 size={16} className="spin" /> : <Music size={16} />}
              </button>
            </form>
            {error && <div className="error-float">{error}</div>}
          </div>

          {/* Mode Toggle - Top Center */}
          <div className="mode-toggle">
            <button
              className={`mode-btn ${mode === 'video' ? 'active' : ''}`}
              onClick={() => setMode('video')}
            >
              Video
            </button>
            <button
              className={`mode-btn ${mode === 'audio' ? 'active' : ''}`}
              onClick={() => setMode('audio')}
            >
              Audio
            </button>
          </div>

          {/* Center Content: Video or Audio Layout */}
          <div className={`center-content ${mode}`}>

            {/* Video Wrapper (always rendered to keep player active, hidden in audio mode) */}
            <div className="video-wrapper" style={{ display: mode === 'video' ? 'flex' : 'none' }}>
              {!videoId && !isLoading && (
                <div className="placeholder-card">
                  <Music size={60} className="placeholder-icon" />
                  <p>Paste a YouTube URL</p>
                </div>
              )}
              {videoId && (
                <div className="video-frame">
                  <div id="youtube-player"></div>
                  {isLoading && (
                    <div className="video-loading">
                      <Loader2 size={40} className="spin" />
                      <span>Loading...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Audio Wrapper (visible only in audio mode) */}
            {mode === 'audio' && videoId && (
              <div className="audio-wrapper">
                {/* Artwork only — lyrics are now in the floating spotlight */}
                <div className="audio-artwork">
                  <img
                    src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                    alt="Album Art"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
                    }}
                  />
                </div>
              </div>
            )}

            {/* Placeholder for Audio mode if no video */}
            {mode === 'audio' && !videoId && (
              <div className="placeholder-card">
                <Music size={60} className="placeholder-icon" />
                <p>Play a video to see artwork</p>
              </div>
            )}

          </div>

          {/* Status - Top Right */
            /* Removed Status Area as it's redundant with controls or can be added back if requested. Keeping consistent with previous edit where I saw status-area separate. */
          }
          <div className="status-area">
            {isReady && playing && <div className="status-badge playing">Playing</div>}
            {isReady && !playing && <div className="status-badge paused">Paused</div>}
          </div>
        </div>

        {/* Bottom Section - Controls (30%) */}
        <div className="controls-section">
          {/* Lower Row: Progress Bar (Moved to Top) */}
          <div className="progress-container fullscreen">
            <span className="time">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={played * 100}
              onChange={handleSeek}
              className="progress-bar"
              disabled={!videoId || !isReady}
              style={{
                background: `linear-gradient(to right, #fff ${played * 100}%, rgba(255, 255, 255, 0.15) ${played * 100}%)`
              }}
            />
            <span className="time">{formatTime(duration)}</span>
          </div>

          {/* Upper Row: Title - Controls - Volume (Moved to Bottom) */}
          <div className="controls-upper">
            {/* Left: Track Info */}
            <div className="track-info">
              <h1 className="main-title">Funk Volume Changer</h1>
              {videoId && <p className="video-id">ID: {videoId}</p>}
            </div>

            {/* Center: Playback Controls */}
            <div className="playback-controls">
              <button className="ctrl-btn sm" disabled><Shuffle size={20} /></button>
              <button className="ctrl-btn" disabled={!videoId || !isReady}><SkipBack size={22} /></button>
              <button className="ctrl-btn play" onClick={handlePlayPause} disabled={!videoId || !isReady}>
                {playing ? <Pause size={28} /> : <Play size={28} />}
              </button>
              <button className="ctrl-btn" disabled={!videoId || !isReady}><SkipForward size={22} /></button>
              <button className="ctrl-btn sm" disabled><Repeat size={20} /></button>
            </div>

            {/* Right: Volume */}
            <div className="volume-section">
              <ElasticVolumeSlider
                volume={volume}
                onChange={handleVolumeChange}
                disabled={!videoId || !isReady}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
