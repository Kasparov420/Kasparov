import React, { useState, useMemo } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'

export default function BoardStage({
  fen,
  onMove,
  orientation = 'white'
}: {
  fen: string
  onMove?: (from: string, to: string) => boolean | Promise<boolean>
  orientation?: 'white' | 'black'
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [targets, setTargets] = useState<string[]>([])

  const chess = useMemo(() => {
    const c = new Chess()
    try {
      c.load(fen)
    } catch {}
    return c
  }, [fen])

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {}
    if (selected) {
      styles[selected] = {
        boxShadow: 'inset 0 0 0 3px var(--accent)'
      }
    }
    for (const sq of targets) {
      styles[sq] = {
        boxShadow: 'inset 0 0 0 2px rgba(34,197,94,0.6)',
        background: 'radial-gradient(circle, rgba(34,197,94,0.4) 20%, transparent 22%)'
      }
    }
    return styles
  }, [selected, targets])

  const handleSquareClick = ({ square }: { piece: any; square: string }) => {
    if (!onMove) return

    const piece = chess.get(square as any)

    if (!selected) {
      if (!piece) return
      const moves = chess.moves({ square: square as any, verbose: true })
      if (!moves.length) return
      setSelected(square)
      setTargets(moves.map(m => m.to))
    } else if (square === selected) {
      setSelected(null)
      setTargets([])
    } else if (targets.includes(square)) {
      const from = selected
      const to = square
      const uci = from + to
      onMove(from, to)
      setSelected(null)
      setTargets([])
    } else {
      const moves = chess.moves({ square: square as any, verbose: true })
      if (!moves.length) {
        setSelected(null)
        setTargets([])
        return
      }
      setSelected(square)
      setTargets(moves.map(m => m.to))
    }
  }

  return (
    <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
      <Chessboard
        options={{
          position: fen,
          onSquareClick: onMove ? handleSquareClick : undefined,
          boardOrientation: orientation,
          squareStyles: customSquareStyles,
          boardStyle: { width: Math.min(720, window.innerWidth - 400) }
        }}
      />
    </div>
  )
}
