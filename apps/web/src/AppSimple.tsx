import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import './App.css';

// Simple API helper
function getApiBase(): string {
  const host = window.location.hostname;
  if (host.includes('.app.github.dev')) {
    return window.location.origin.replace(/-\d+\./, '-8787.') + '/api';
  }
  return '/api';
}

type Screen = 'setup' | 'lobby' | 'playing';

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [walletAddress, setWalletAddress] = useState('');
  const [gameId, setGameId] = useState('');
  const [joinGameId, setJoinGameId] = useState('');
  const [myColor, setMyColor] = useState<'white' | 'black'>('white');
  const [game] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [status, setStatus] = useState('');

  // Poll for game updates
  useEffect(() => {
    if (!gameId || screen !== 'playing') return;

    const poll = async () => {
      try {
        const res = await fetch(`${getApiBase()}/games/${gameId}`);
        if (res.ok) {
          const data = await res.json();
          const serverFen = data.game?.fen;
          if (serverFen && serverFen !== fen) {
            game.load(serverFen);
            setFen(serverFen);
          }
          // Check if opponent joined
          if (data.game?.status === 'active' && status !== 'active') {
            setStatus('active');
          }
        }
      } catch (e) {
        console.error('Poll error:', e);
      }
    };

    poll();
    const interval = setInterval(poll, 1500);
    return () => clearInterval(interval);
  }, [gameId, fen, screen, game, status]);

  async function createGame() {
    if (!walletAddress) {
      alert('Enter a wallet address first');
      return;
    }
    try {
      const res = await fetch(`${getApiBase()}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      });
      const data = await res.json();
      const gid = data.game.id;
      setGameId(gid);
      
      // Determine color from server response
      const isWhite = data.game.white?.address === walletAddress;
      setMyColor(isWhite ? 'white' : 'black');
      setStatus('waiting');
      setScreen('lobby');
    } catch (e) {
      alert('Create game failed: ' + e);
    }
  }

  async function joinGame() {
    if (!walletAddress || !joinGameId) {
      alert('Enter wallet address and game ID');
      return;
    }
    try {
      const res = await fetch(`${getApiBase()}/games/${joinGameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setGameId(joinGameId);
      
      // Joiner gets opposite color
      const isWhite = data.game.white?.address === walletAddress;
      setMyColor(isWhite ? 'white' : 'black');
      setStatus('active');
      setScreen('playing');
    } catch (e) {
      alert('Join failed: ' + e);
    }
  }

  function onDrop(source: string, target: string): boolean {
    // Only allow moves on your turn
    const turn = game.turn() === 'w' ? 'white' : 'black';
    if (turn !== myColor) {
      console.log('Not your turn!');
      return false;
    }

    try {
      const move = game.move({ from: source, to: target, promotion: 'q' });
      if (!move) return false;

      setFen(game.fen());

      // Send to server
      fetch(`${getApiBase()}/games/${gameId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: walletAddress,
          uci: source + target + (move.promotion || ''),
        }),
      });

      return true;
    } catch {
      return false;
    }
  }

  // Setup screen
  if (screen === 'setup') {
    return (
      <div className="app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 20 }}>
        <h1 style={{ color: '#49eacb' }}>♔ Kasparov Chess ♚</h1>
        <input
          type="text"
          placeholder="Enter wallet address (any text works)"
          value={walletAddress}
          onChange={(e) => setWalletAddress(e.target.value)}
          style={{ padding: 12, width: 400, borderRadius: 8, border: '1px solid #49eacb', background: '#1a1a24', color: 'white' }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={createGame} style={{ padding: '12px 24px', background: '#49eacb', color: 'black', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
            Create Game
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Game ID to join"
            value={joinGameId}
            onChange={(e) => setJoinGameId(e.target.value)}
            style={{ padding: 12, width: 200, borderRadius: 8, border: '1px solid #666', background: '#1a1a24', color: 'white' }}
          />
          <button onClick={joinGame} style={{ padding: '12px 24px', background: '#666', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Join Game
          </button>
        </div>
      </div>
    );
  }

  // Lobby screen - waiting for opponent
  if (screen === 'lobby') {
    return (
      <div className="app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 20 }}>
        <h2 style={{ color: '#49eacb' }}>Game Created!</h2>
        <p style={{ color: 'white' }}>Game ID: <code style={{ color: '#49eacb', fontSize: 20 }}>{gameId}</code></p>
        <p style={{ color: 'white' }}>You are: <strong>{myColor.toUpperCase()}</strong></p>
        <p style={{ color: '#888' }}>Share the Game ID with a friend to start playing</p>
        <p style={{ color: '#ffaa00' }}>⏳ Waiting for opponent...</p>
        <Chessboard
          position={fen}
          boardOrientation={myColor}
          boardWidth={400}
          arePiecesDraggable={false}
        />
        <button onClick={() => { setStatus('active'); setScreen('playing'); }} style={{ padding: '12px 24px', background: '#49eacb', color: 'black', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Start Playing (Debug)
        </button>
      </div>
    );
  }

  // Playing screen
  const turn = game.turn() === 'w' ? 'white' : 'black';
  const isMyTurn = turn === myColor;

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20, minHeight: '100vh' }}>
      <h2 style={{ color: '#49eacb', marginBottom: 10 }}>Game: {gameId}</h2>
      <div style={{ color: 'white', marginBottom: 10 }}>
        You are: <strong style={{ color: myColor === 'white' ? '#fff' : '#888' }}>{myColor.toUpperCase()}</strong>
      </div>
      <div style={{ color: isMyTurn ? '#00ff88' : '#888', marginBottom: 20, fontSize: 18 }}>
        {isMyTurn ? '🟢 Your turn! Drag a piece.' : `⏳ Waiting for ${turn} to move...`}
      </div>
      <Chessboard
        position={fen}
        onPieceDrop={onDrop}
        boardOrientation={myColor}
        boardWidth={Math.min(600, window.innerWidth - 40)}
        arePiecesDraggable={isMyTurn}
      />
      <div style={{ marginTop: 20, color: '#888' }}>
        Moves: {game.history().join(', ') || 'None yet'}
      </div>
    </div>
  );
}
