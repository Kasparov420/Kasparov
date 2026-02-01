import React from 'react'
import { Wallet, LogOut, Crown } from 'lucide-react'

export default function TopBar({ session, onConnect, onDisconnect }: {
  session: any
  onConnect: () => void
  onDisconnect: () => void
}) {
  const short = session?.address ? `${session.address.slice(0, 6)}...${session.address.slice(-4)}` : null
  
  return (
    <header className="topbar">
      <div className="tb-left">
        <div className="brand">
          <div className="king">♛</div>
          <div className="wordmark">KASPAR<span className="kaspa-highlight">O</span>V</div>
        </div>
      </div>
      
      <div className="tb-right">
        {session ? (
          <div className="pill connected">
            <div className="status-indicator" />
            <span className="addr">{short}</span>
            <button 
              className="iconBtn" 
              onClick={onDisconnect} 
              aria-label="Disconnect wallet"
              title="Disconnect"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button className="walletBtn" onClick={onConnect}>
            <Wallet size={18} />
            <span>Connect Wallet</span>
          </button>
        )}
      </div>
    </header>
  )
}
