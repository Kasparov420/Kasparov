import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';

interface Props {
  gameId: string;
  myColor: 'white' | 'black';
  walletAddress: string;
}

export default function SimpleChess({ gameId, myColor, walletAddress }: Props) {
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());

  // Fetch game state from server
  useEffect(() => {
    const fetchGame = async () => {
      try {
        const host = window.location.hostname;
        let apiBase = '/api';
        if (host.includes('.app.github.dev')) {
          apiBase = window.location.origin.replace(/-\d+\./, '-8787.') + '/api';
        }
        
        const res = await fetch(`${apiBase}/games/${gameId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.game?.fen && data.game.fen !== fen) {
            const newGame = new Chess(data.game.fen);
            setGame(newGame);
            setFen(data.game.fen);
          }
        }
      } catch (e) {
        console.error('Fetch error:', e);
      }
    };

    fetchGame();
    const interval = setInterval(fetchGame, 1500);
    return () => clearInterval(interval);
  }, [gameId, fen]);

  function onDrop(sourceSquare: string, targetSquare: string) {
    try {
      const move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });

      if (move === null) return false;

      setFen(game.fen());

      // Send move to server
      const host = window.location.hostname;
      let apiBase = '/api';
      if (host.includes('.app.github.dev')) {
        apiBase = window.location.origin.replace(/-\d+\./, '-8787.') + '/api';
      }

      fetch(`${apiBase}/games/${gameId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          address: walletAddress, 
          uci: sourceSquare + targetSquare + (move.promotion || '')
        }),
      });

      return true;
    } catch (e) {
      console.error('Move error:', e);
      return false;
    }
  }

  const turn = game.turn() === 'w' ? 'white' : 'black';
  const isMyTurn = turn === myColor;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div style={{ color: '#49eacb', fontSize: 18 }}>
        Game: {gameId} | You: {myColor} | Turn: {turn}
        {isMyTurn ? ' ✅ Your move!' : ' ⏳ Waiting...'}
      </div>
      <Chessboard
        id="BasicBoard"
        position={fen}
        onPieceDrop={onDrop}
        boardOrientation={myColor}
        boardWidth={560}
        arePiecesDraggable={true}
      />
    </div>
  );
}
