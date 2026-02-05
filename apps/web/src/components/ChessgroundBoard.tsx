import React, { useEffect, useRef } from 'react';
import { Chessground as ChessgroundNative } from 'chessground';
import { Api } from 'chessground/api';
import { Config } from 'chessground/config';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

interface Props {
  fen: string;
  orientation: 'white' | 'black';
  onMove: (from: string, to: string) => void;
  width?: number;
  height?: number;
}

export const ChessgroundBoard: React.FC<Props> = ({ fen, orientation, onMove, width = 500, height = 500 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);

  useEffect(() => {
    if (ref.current && !api.current) {
      const config: Config = {
        fen,
        orientation,
        events: {
          move: (orig, dest) => {
            onMove(orig, dest);
          },
        },
        highlight: {
          lastMove: true,
          check: true,
        },
        movable: {
          free: false,
          color: 'both', // Let both move for debugging
          dests: undefined, // Allow all moves for now, validated by chess.js later
          showDests: true,
        },
        draggable: {
          showGhost: true,
        }
      };
      api.current = ChessgroundNative(ref.current, config);
    } else if (api.current) {
      api.current.set({
        fen,
        orientation,
        movable: {
          color: 'both', // Allow both to move, validation happens in logic
          free: false,
          dests: undefined // Revert to letting chessground allow general moves, constrained by server
        } 
      });
    }
  }, [fen, orientation]); // Re-run when FEN or orientation changes

  // Update orientation specifically if it changes
  useEffect(() => {
    if (api.current) {
        api.current.set({ orientation });
    }
  }, [orientation]);

  return (
    <div 
      ref={ref} 
      style={{ 
        width: width, 
        height: height,
        border: '5px solid #4a4a4a', // Add border to visualize dimensions
      }} 
    />
  );
};
