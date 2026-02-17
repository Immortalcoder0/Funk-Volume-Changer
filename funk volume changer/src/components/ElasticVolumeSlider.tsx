import { useState, useRef, useCallback, useEffect } from 'react'
import { useSpring, animated } from '@react-spring/web'
import './ElasticVolumeSlider.css'

// ─── Types ───────────────────────────────────────────
interface ElasticVolumeSliderProps {
  volume: number        // 0–100
  onChange: (v: number) => void
  disabled?: boolean
}

// ─── Helpers ─────────────────────────────────────────
const PADDING = 8
const THUMB_R = 8
const MAX_BEND = 24
const SPRING_CONFIG = { tension: 340, friction: 8, mass: 0.6 }
const IMPACT_SPRING = { tension: 280, friction: 6, mass: 0.8 }
const CHARGE_INTERVAL_MS = 55   // ~5.5 seconds to full charge (1.1x speed)
const SHOOT_DURATION_MS = 600

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

// ─── Component ───────────────────────────────────────
export default function ElasticVolumeSlider({
  volume,
  onChange,
  disabled = false,
}: ElasticVolumeSliderProps) {
  const trackRef = useRef<SVGSVGElement>(null)
  const cannonRef = useRef<HTMLDivElement>(null)
  const trackWrapRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  // ── Cannon charge state ──
  const [charging, setCharging] = useState(false)
  const [chargeLevel, setChargeLevel] = useState(0)
  const chargeRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Cannonball flight state ──
  const [isShooting, setIsShooting] = useState(false)
  const [ballPos, setBallPos] = useState({ x: 0, y: 0 })
  const shootRaf = useRef<number | null>(null)

  // ── Impact point for localized bend ──
  const [impactBendX, setImpactBendX] = useState<number | null>(null)

  // Spring for the vertical bend (control-point Y offset)
  const [bendSpring, bendApi] = useSpring(() => ({
    y: 0,
    config: SPRING_CONFIG,
  }))



  // ── Get track pixel dimensions ──
  const getTrackBounds = useCallback(() => {
    if (!trackRef.current) return { left: 0, width: 1, top: 0, height: 48 }
    const rect = trackRef.current.getBoundingClientRect()
    return {
      left: rect.left + PADDING,
      width: rect.width - PADDING * 2,
      top: rect.top,
      height: rect.height,
    }
  }, [])

  // ── Pointer → volume value ──
  const pointerToVolume = useCallback(
    (clientX: number) => {
      const { left, width } = getTrackBounds()
      return clamp(Math.round(((clientX - left) / width) * 100), 0, 100)
    },
    [getTrackBounds],
  )

  // ── Pointer → vertical bend ──
  const pointerToBend = useCallback(
    (clientY: number) => {
      const { top, height } = getTrackBounds()
      const centerY = top + height / 2
      const offset = clientY - centerY
      return clamp(offset, -MAX_BEND, MAX_BEND)
    },
    [getTrackBounds],
  )

  // ══════════════════════════════════════════════════
  //  DRAG HANDLERS (unchanged)
  // ══════════════════════════════════════════════════
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || isShooting) return
      e.preventDefault()
        ; (e.target as Element).setPointerCapture(e.pointerId)
      dragging.current = true
      setIsDragging(true)
      const newVol = pointerToVolume(e.clientX)
      onChange(newVol)
      const bend = pointerToBend(e.clientY)
      bendApi.start({ y: bend, immediate: true })
    },
    [disabled, isShooting, onChange, pointerToVolume, pointerToBend, bendApi],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return
      const newVol = pointerToVolume(e.clientX)
      onChange(newVol)
      const bend = pointerToBend(e.clientY)
      bendApi.start({ y: bend, immediate: true })
    },
    [onChange, pointerToVolume, pointerToBend, bendApi],
  )

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    setIsDragging(false)
    bendApi.start({ y: 0, immediate: false, config: SPRING_CONFIG })
  }, [bendApi])

  // ── Click on track (pluck) ──
  const onTrackClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (disabled || dragging.current || isShooting) return
      const newVol = pointerToVolume(e.clientX)
      onChange(newVol)
      bendApi.start({ y: -12, immediate: true })
      requestAnimationFrame(() => {
        bendApi.start({ y: 0, immediate: false, config: SPRING_CONFIG })
      })
    },
    [disabled, isShooting, onChange, pointerToVolume, bendApi],
  )

  // Safety: release on window pointer-up
  useEffect(() => {
    const handleUp = () => {
      if (dragging.current) {
        dragging.current = false
        setIsDragging(false)
        bendApi.start({ y: 0, immediate: false, config: SPRING_CONFIG })
      }
    }
    window.addEventListener('pointerup', handleUp)
    return () => window.removeEventListener('pointerup', handleUp)
  }, [bendApi])

  // ══════════════════════════════════════════════════
  //  CANNON CHARGE HANDLERS
  // ══════════════════════════════════════════════════
  const handleChargeStart = useCallback(() => {
    if (disabled || isShooting) return
    setCharging(true)
    setChargeLevel(0)
    chargeRef.current = setInterval(() => {
      setChargeLevel(prev => (prev >= 100 ? 100 : prev + 1))
    }, CHARGE_INTERVAL_MS)
  }, [disabled, isShooting])

  const handleChargeEnd = useCallback(() => {
    if (!charging) return
    if (chargeRef.current) clearInterval(chargeRef.current)
    chargeRef.current = null
    setCharging(false)

    const target = chargeLevel
    if (target === 0) return  // didn't charge at all

    setIsShooting(true)
    setBallPos({ x: 0, y: 0 })

    // Animate flight with requestAnimationFrame
    const startTime = performance.now()
    const duration = SHOOT_DURATION_MS

    // Compute actual launch pixel position from cannon tip
    const sliderEl = cannonRef.current?.closest('.elastic-slider') as HTMLElement | null
    const sliderRect = sliderEl?.getBoundingClientRect()
    const cannonRect = cannonRef.current?.getBoundingClientRect()
    const trackRect = trackWrapRef.current?.getBoundingClientRect()

    // Default fallback positions
    let launchPxX = 0
    let launchPxY = 0
    let trackW = 200

    if (sliderRect && cannonRect && trackRect) {
      // Cannon tip = right-center of cannon, relative to slider
      launchPxX = cannonRect.right - sliderRect.left
      launchPxY = cannonRect.top + cannonRect.height / 2 - sliderRect.top
      trackW = trackRect.width
    }

    // Target landing position in px (relative to slider left)
    const trackLeft = trackRect ? trackRect.left - (sliderRect?.left ?? 0) : 66
    const landPxX = trackLeft + (target / 100) * trackW
    const landPxY = sliderRect ? sliderRect.height / 2 : 26  // vertical center

    const height = 4 + target * 0.4

    function animateFlight(now: number) {
      const elapsed = now - startTime
      const t = Math.min(elapsed / duration, 1)

      // X: linear from cannon tip to target
      const x = launchPxX + (landPxX - launchPxX) * t

      // Y: parabola from cannon tip to track center
      const baseY = launchPxY + (landPxY - launchPxY) * t  // linear baseline
      const arcOffset = -4 * height * t * (1 - t)            // arc above baseline
      const y = baseY + arcOffset

      setBallPos({ x, y })

      if (t < 1) {
        shootRaf.current = requestAnimationFrame(animateFlight)
      } else {
        // Impact!
        onChange(target)
        setIsShooting(false)

        const W = 300
        const sX = PADDING
        const eX = W - PADDING
        const tLen = eX - sX
        const impactSvgX = sX + (target / 100) * tLen
        setImpactBendX(impactSvgX)

        bendApi.start({ y: 20, immediate: true })
        requestAnimationFrame(() => {
          bendApi.start({ y: 0, immediate: false, config: IMPACT_SPRING })
        })
        setTimeout(() => setImpactBendX(null), 800)
      }
    }

    shootRaf.current = requestAnimationFrame(animateFlight)
  }, [charging, chargeLevel, onChange, bendApi])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chargeRef.current) clearInterval(chargeRef.current)
      if (shootRaf.current) cancelAnimationFrame(shootRaf.current)
    }
  }, [])

  // ══════════════════════════════════════════════════
  //  SVG COORDINATE SYSTEM
  // ══════════════════════════════════════════════════
  const W = 300
  const H = 48
  const midY = H / 2
  const startX = PADDING
  const endX = W - PADDING
  const trackLen = endX - startX
  const thumbX = startX + (volume / 100) * trackLen

  // Choose control-point X: impact point or track center
  const controlX = impactBendX ?? (startX + endX) / 2

  return (
    <div className={`elastic-slider ${disabled ? 'elastic-slider--disabled' : ''}`}>

      {/* ── Cannon Button (Speaker Icon) ── */}
      <div
        className="cannon-wrapper"
        ref={cannonRef}
        style={{
          transform: charging
            ? `rotate(${-chargeLevel * 0.35}deg)`
            : undefined,
          transition: 'transform 0.1s linear',
        }}
      >
        <button
          className={`cannon-btn ${charging ? 'cannon-btn--charging' : ''} ${isShooting ? 'cannon-btn--shooting' : ''}`}
          onPointerDown={handleChargeStart}
          onPointerUp={handleChargeEnd}
          onPointerLeave={handleChargeEnd}
          disabled={disabled}
          type="button"
          aria-label="Volume cannon"
        >
          {/* Grey base icon (always visible) */}
          <svg className="cannon-icon cannon-icon--base" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>

          {/* Purple fill icon (clipped by charge level) */}
          <svg
            className="cannon-icon cannon-icon--fill"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
            style={{ clipPath: `inset(${100 - (charging ? chargeLevel : (volume > 0 ? 100 : 0))}% 0 0 0)` }}
          >
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Charge level label */}
        {charging && (
          <span className="cannon-charge-label">{chargeLevel}%</span>
        )}
      </div>

      {/* Cannonball in flight — positioned relative to slider */}
      {isShooting && (
        <div
          className="cannonball"
          style={{
            left: `${ballPos.x}px`,
            top: `${ballPos.y}px`,
          }}
        />
      )}

      {/* ── Track Container ── */}
      <div className="elastic-slider__track-wrap" ref={trackWrapRef}>
        {/* SVG Track */}
        <animated.svg
          ref={trackRef}
          className="elastic-slider__svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={onTrackClick}
        >

          {/* Background track */}
          <animated.path
            className="elastic-slider__track-bg"
            d={bendSpring.y.to((bend: number) => {
              const cpY = midY + bend
              return `M ${startX} ${midY} Q ${controlX} ${cpY} ${endX} ${midY}`
            })}
          />

          {/* Active fill track */}
          {isDragging || impactBendX !== null ? (
            <animated.path
              className="elastic-slider__track-active"
              d={bendSpring.y.to((bend: number) => {
                const activeCpX = (startX + thumbX) / 2
                const ratio = volume / 100
                const cpY = midY + bend * ratio
                return `M ${startX} ${midY} Q ${activeCpX} ${cpY} ${thumbX} ${midY + bend * ratio * 0.3}`
              })}
            />
          ) : (
            <path
              className="elastic-slider__track-active"
              d={`M ${startX} ${midY} Q ${(startX + thumbX) / 2} ${midY} ${thumbX} ${midY}`}
            />
          )}

          {/* Thumb glow ring */}
          {isDragging && (
            <animated.circle
              className="elastic-slider__thumb-glow"
              cx={thumbX}
              cy={bendSpring.y.to((bend: number) => {
                const ratio = volume / 100
                return midY + bend * ratio * 0.3
              })}
              r={14}
            />
          )}

          {/* Thumb */}
          <animated.circle
            className={`elastic-slider__thumb ${isDragging ? 'elastic-slider__thumb--dragging' : ''}`}
            cx={thumbX}
            cy={bendSpring.y.to((bend: number) => {
              const ratio = volume / 100
              return midY + bend * ratio * 0.3
            })}
            r={THUMB_R}
          />
        </animated.svg>

        {/* Target indicator during charge */}
        {charging && (
          <div
            className="cannon-target-line"
            style={{ left: `${chargeLevel}%` }}
          >
            <span className="cannon-target-txt">{chargeLevel}%</span>
          </div>
        )}
      </div>

      {/* Volume label */}
      <span className="elastic-slider__label">{volume}%</span>
    </div>
  )
}
