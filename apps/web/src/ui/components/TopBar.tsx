import React from 'react'
import { Tooltip } from 'react-tooltip'
import { Wallet } from 'lucide-react'

export default function TopBar({ session, onConnectKasware, onConnectKastle, onDisconnect, onOpenWalletModal }: any) {
  const short = session?.address ? `${session.address.slice(0,8)}...` : null
  return (
    <header className="topbar">
      <div className="tb-left">
        <div className="brand">
          <div className="king">♔</div>
          <div className="wordmark">KASPAROV</div>
        </div>
      </div>
      <div className="tb-right">
        {session ? (
          <div className="pill connected">
            <div className="status-indicator"></div>
            <span className="addr">{short}</span>
            <button className="iconBtn" onClick={onDisconnect} aria-label="Disconnect" title="Disconnect Wallet">
              <svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </div>
        ) : (
          <button className="walletBtn" onClick={onOpenWalletModal} title="Connect Wallet">
            <Wallet size={20} />
          </button>
        )}
      </div>
    </header>
  )
}
