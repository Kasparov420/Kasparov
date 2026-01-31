import React from 'react'

export default function MoveTicker({ moves }: any) {
  const last = (moves || []).slice(-8).reverse()
  return (
    <div className="moveTicker">
      {last.map((m: any, i: number) => (
        <div key={i} className="moveItem">
          <div style={{fontFamily:'monospace'}}>{m.uci}</div>
          {m.txid && <a href="#" className="txLink">tx</a>}
        </div>
      ))}
    </div>
  )
}
