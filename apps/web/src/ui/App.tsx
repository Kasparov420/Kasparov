import React, { useEffect, useRef, useState } from 'react'
import BoardStage from './components/BoardStage'
import TopBar from './components/TopBar'
import RightPanel from './components/RightPanel'
import WalletModal from './components/WalletModal'
import KaspaStatsBar from './components/KaspaStatsBar'
import { detectWallets, connectKasware, connectKastle, type WalletSession } from '../wallet/wallet'
import DonateKasparov from './components/DonateKasparov'
import { themeFromSeed, randomTheme, type Theme } from '../theme'
import kaspaService from '../kaspa/kaspaService'

type Game = {
  id: string
  createdAt: number
  white: { address: string }
  black?: { address: string }
  fen: string
  turn: 'w' | 'b'
  status: 'waiting' | 'active' | 'ended'
  themeSeed: string
  lastMoveUci?: string
  moveCount: number
}

export default function App() {
  const [session, setSession] = useState<WalletSession | null>(null)
  const [wallets, setWallets] = useState(() => detectWallets())
  const [game, setGame] = useState<Game | null>(null)
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => randomTheme())
  const [screen, setScreen] = useState<'lobby' | 'playing'>('lobby')
  const [balance, setBalance] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Check for existing internal wallet on mount
  useEffect(() => {
    const addr = localStorage.getItem("kasparov-wallet-address")
    if (addr && !session) {
      // Address exists but no active session - user needs to re-import
      // We don't store mnemonic/private key for security
    }
  }, [])

  // Update theme when game becomes active
  useEffect(() => {
    if (game?.status === 'active' && game?.themeSeed) {
      setTheme(themeFromSeed(game.themeSeed))
    }
  }, [game?.status, game?.themeSeed])

  // Fetch balance when session changes
  useEffect(() => {
    const fetchBalance = async () => {
      if (!session) {
        setBalance(null)
        return
      }
      try {
        const bal = await kaspaService.getBalance()
        const kasBalance = Number(bal) / 100000000
        setBalance(kasBalance.toFixed(2))
      } catch (e) {
        console.error('Failed to fetch balance:', e)
        setBalance(null)
      }
    }
    fetchBalance()
  }, [session])

  // Poll for game updates (Vercel doesn't support WebSocket)
  useEffect(() => {
    if (!game?.id) return
    
    const pollGame = async () => {
      try {
        const res = await fetch(`/api/games/${game.id}`)
        if (res.ok) {
          const data = await res.json()
          if (data.game) {
            // Only update if something changed
            if (JSON.stringify(data.game) !== JSON.stringify(game)) {
              setGame(data.game)
              if (data.game.status === 'active' && screen !== 'playing') {
                setScreen('playing')
              }
            }
          }
        }
      } catch {
        // ignore - will retry next interval
      }
    }
    
    // Poll every 1.5 seconds
    const pollInterval = setInterval(pollGame, 1500)
    
    // Also poll immediately on mount
    pollGame()
    
    return () => clearInterval(pollInterval)
  }, [game?.id, screen])

  async function onConnectKasware() {
    const s = await connectKasware('kaspa_mainnet')
    setSession(s)
    return s
  }

  async function onConnectKastle() {
    const s = await connectKastle('kaspa_mainnet')
    setSession(s)
    return s
  }

  function onDisconnect() {
    setSession(null)
  }

  async function onCreate() {
    if (!session) {
      setShowWalletModal(true)
      return
    }
    try {
      // First create the game on server
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: session.address })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      
      // For internal wallets, publish on-chain event (MANDATORY)
      if (session.kind === 'internal') {
        const txResult = await kaspaService.publishGameInit(data.game.id)
        if (!txResult.success) {
          console.error('On-chain publish failed:', txResult.error)
          alert('Failed to create game on-chain: ' + (txResult.error || 'Transaction failed'))
          return
        } else {
          console.log('Game init published on-chain:', txResult.txId)
        }
      }
      
      setGame(data.game)
      setScreen('lobby')
    } catch (e) {
      alert('Error creating game: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function onJoin(gameId: string) {
    if (!session) {
      setShowWalletModal(true)
      return
    }
    try {
      const res = await fetch(`/api/games/${gameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: session.address })
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to join game')
      }
      const data = await res.json()
      
      // For internal wallets, publish on-chain event (MANDATORY)
      if (session.kind === 'internal') {
        const txResult = await kaspaService.publishGameJoin(gameId)
        if (!txResult.success) {
          console.error('On-chain join publish failed:', txResult.error)
          alert('Failed to join game on-chain: ' + (txResult.error || 'Transaction failed'))
          return
        } else {
          console.log('Game join published on-chain:', txResult.txId)
        }
      }
      
      setGame(data.game)
      setScreen('playing')
    } catch (e) {
      alert('Game not found')
    }
  }

  async function onMove(from: string, to: string) {
    if (!game || !session) return false
    const uci = from + to
    try {
      // For internal wallets, publish move on-chain FIRST (MANDATORY)
      if (session.kind === 'internal') {
        const txResult = await kaspaService.publishMove(game.id, uci, game.moveCount + 1)
        if (!txResult.success) {
          console.error('On-chain move publish failed:', txResult.error)
          alert('Failed to publish move on-chain: ' + (txResult.error || 'Transaction failed'))
          return false
        } else {
          console.log('Move published on-chain:', txResult.txId)
          // Now update server with txid
          const res = await fetch(`/api/games/${game.id}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: session.address, uci, txid: txResult.txId })
          })
          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error || 'move failed')
          }
          const data = await res.json()
          setGame(data.game)
          return true
        }
      } else {
        // For external wallets, just do server move
        const res = await fetch(`/api/games/${game.id}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: session.address, uci })
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'move failed')
        }
        const data = await res.json()
        setGame(data.game)
        return true
      }
    } catch (e) {
      alert('Move failed: ' + (e instanceof Error ? e.message : String(e)))
      return false
    }
  }

  async function onImportInternal(mnemonic: string) {
    await kaspaService.initialize(mnemonic)
    const address = kaspaService.getAddress()
    if (address) {
      setSession({
        kind: 'internal',
        address,
        network: 'kaspa_mainnet'
      })
      return true
    }
    return false
  }

  async function onImportPrivateKey(privateKey: string) {
    await kaspaService.initializeWithPrivateKey(privateKey)
    const address = kaspaService.getAddress()
    if (address) {
      setSession({
        kind: 'internal',
        address,
        network: 'kaspa_mainnet'
      })
      return true
    }
    return false
  }

  async function onGenerateMnemonic(wordCount: 12 | 24 = 12) {
    return await kaspaService.generateNewMnemonic(wordCount)
  }

  const myColor = game
    ? session?.address === game.white.address
      ? 'white'
      : session?.address === game.black?.address
        ? 'black'
        : null
    : null

  const myTurn = game
    ? game.status === 'active' &&
      ((game.turn === 'w' && myColor === 'white') ||
       (game.turn === 'b' && myColor === 'black'))
    : false

  const orientation = myColor === 'black' ? 'black' : 'white'

  return (
    <div className="app">
      <KaspaStatsBar />
      <TopBar session={session} balance={balance} onConnect={() => setShowWalletModal(true)} onDisconnect={onDisconnect} />
      <main className="mainLayout">
        <div className="leftCol">
          {game ? (
            <div style={{
              ['--sqLight' as any]: theme.light,
              ['--sqDark' as any]: theme.dark,
              ['--accent' as any]: theme.accent,
            } as React.CSSProperties}>
              <BoardStage
                fen={game.fen}
                onMove={myTurn ? onMove : undefined}
                orientation={orientation}
              />
            </div>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: '#ccc' }}>
              Select or create a game
            </div>
          )}
        </div>
        <div className="rightCol">
          <RightPanel
            game={game}
            myColor={myColor}
            myTurn={myTurn}
            session={session}
            onCreate={onCreate}
            onJoin={onJoin}
            onOpenWalletModal={() => setShowWalletModal(true)}
            screen={screen}
          />
        </div>
      </main>
      <WalletModal
        open={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onConnectKasware={onConnectKasware}
        onConnectKastle={onConnectKastle}
        onImportInternal={onImportInternal}
        onImportPrivateKey={onImportPrivateKey}
        onGenerateMnemonic={onGenerateMnemonic}
        wallets={wallets}
      />
      <DonateKasparov />
    </div>
  )
}
