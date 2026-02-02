import React, { useEffect, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { Square } from "chess.js";
import ChessGame, { type GameState } from "./game/ChessGame";
import { randomTheme, themeFromSeed, type Theme } from "./game/theme";
import { kaspaService } from "./kaspa/kaspaService";
import { indexerService } from "./indexer/indexerService";
import { setWrpcEndpoint, getConfiguredEndpoint } from "./kaspa/wallet";
import "./App.css";

type Screen = "wallet-setup" | "welcome" | "lobby" | "playing";

// Helper to derive private key hex from mnemonic
async function derivePrivateKeyHex(mnemonic: string): Promise<string> {
  const { mnemonicToSeed } = await import('@scure/bip39')
  const { HDKey } = await import('@scure/bip32')
  
  const seed = await mnemonicToSeed(mnemonic)
  const hdKey = HDKey.fromMasterSeed(seed)
  const derived = hdKey.derive("m/44'/111111'/0'/0/0")
  
  if (!derived.privateKey) throw new Error('Derivation failed')
  
  return Array.from(derived.privateKey)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("wallet-setup");
  const [game, setGame] = useState<ChessGame | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [theme, setTheme] = useState<Theme>(randomTheme());
  const [showPromotion, setShowPromotion] = useState(false);
  const [promotionMove, setPromotionMove] = useState<{ from: Square; to: Square } | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [showMnemonic, setShowMnemonic] = useState<string | null>(null);
  const [showPrivateKeyHex, setShowPrivateKeyHex] = useState<string | null>(null);
  const [privateKeyRevealed, setPrivateKeyRevealed] = useState(false);
  const [wordCountChoice, setWordCountChoice] = useState<12 | 24 | 'hex'>(12);
  const [showWordCountPicker, setShowWordCountPicker] = useState(false);
  const [importMode, setImportMode] = useState<'mnemonic' | 'privateKey' | 'nodeConfig' | false>(false);
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [privateKeyInput, setPrivateKeyInput] = useState("");
  const [nodeEndpoint, setNodeEndpoint] = useState(getConfiguredEndpoint());

  // DON'T auto-connect from localStorage - user must explicitly import their wallet
  // The stored address is just a hint, not a real connection
  // useEffect(() => {
  //   const existing = kaspaService.checkExistingWallet();
  //   if (existing) {
  //     setWalletAddress(existing);
  //     setScreen("welcome");
  //   }
  // }, []);

  // Random theme cycling in lobby
  useEffect(() => {
    if (screen === "lobby" && gameState?.status === "lobby") {
      const interval = setInterval(() => {
        setTheme(randomTheme());
      }, 800);
      return () => clearInterval(interval);
    } else if (gameState?.status === "active" && gameState.themeSeed) {
      // Lock theme when game starts
      setTheme(themeFromSeed(gameState.themeSeed));
    }
  }, [screen, gameState?.status, gameState?.themeSeed]);

  const handleCreateGame = async () => {
    const myColor = Math.random() > 0.5 ? "w" : "b";
    const newGame = new ChessGame({
      myColor,
      whitePub: myColor === "w" ? (walletAddress || "") : "",
      status: "lobby",
    });
    
    const state = newGame.getState();
    setGame(newGame);
    setGameState(state);
    setScreen("lobby");

    // Publish game-init to DAG
    const result = await kaspaService.publishGameInit(state.gameId);
    if (result.success) {
      console.log("Game published to DAG:", result.txId);
      
      // Mock: index our own event
      await indexerService.mockIndexEvent({
        type: "game-init",
        gameId: state.gameId,
        timestamp: Date.now(),
        data: { whitePub: state.whitePub },
      });
    }
  };

  const handleJoinGame = async (gameId: string) => {
    // Fetch game from indexer
    const indexedGame = await indexerService.getGame(gameId);
    if (!indexedGame) {
      alert("Game not found");
      return;
    }

    const myColor = "b"; // Opposite of creator
    const newGame = new ChessGame({
      gameId,
      myColor,
      blackPub: walletAddress || "",
      whitePub: indexedGame.whitePub,
      status: "lobby",
    });
    
    const state = newGame.getState();
    setGame(newGame);
    setGameState(state);
    setScreen("lobby");

    // Publish game-join to DAG
    const result = await kaspaService.publishGameJoin(gameId);
    if (result.success) {
      console.log("Join published to DAG:", result.txId);
      
      // Mock: index our own event
      await indexerService.mockIndexEvent({
        type: "game-join",
        gameId,
        timestamp: Date.now(),
        data: { blackPub: walletAddress },
      });
    }

    // Start polling for updates
    indexerService.startPolling(gameId, (indexedGame) => {
      if (indexedGame.status === "active" && screen !== "playing") {
        handleStartGame();
      }
    });
  };

  const handleStartGame = () => {
    if (!game || !gameState) return;
    
    game.updateState({ status: "active" });
    setGameState(game.getState());
    setScreen("playing");
  };

  const handleSquareClick = async (square: Square) => {
    if (!game || !gameState) return;

    const result = game.handleSquareClick(square);
    
    if (result.action === "move" && result.updatedState && result.move) {
      game.updateState(result.updatedState);
      const newState = game.getState();
      setGameState(newState);

      // Publish move to DAG
      const uci = newState.moves[newState.moves.length - 1];
      const publishResult = await kaspaService.publishMove(
        newState.gameId,
        uci,
        newState.moves.length
      );
      
      if (publishResult.success) {
        console.log("Move published to DAG:", publishResult.txId);
        
        // Mock: index our own event
        await indexerService.mockIndexEvent({
          type: "move",
          gameId: newState.gameId,
          timestamp: Date.now(),
          data: { uci, plyNumber: newState.moves.length },
        });
      }
      
      // Check if game over
      const gameOver = game.isGameOver();
      if (gameOver.over) {
        console.log("Game over:", gameOver.result);
        game.updateState({ status: "ended" });
        setGameState(game.getState());
      }
    } else if (result.updatedState) {
      game.updateState(result.updatedState);
      setGameState(game.getState());
    }
  };

  const handlePromotion = async (piece: "q" | "r" | "b" | "n") => {
    if (!game || !promotionMove) return;
    
    const move = game.handlePromotion(promotionMove.from, promotionMove.to, piece);
    if (move) {
      const newState = game.getState();
      setGameState(newState);
      
      // Publish move to DAG
      const uci = newState.moves[newState.moves.length - 1];
      const result = await kaspaService.publishMove(
        newState.gameId,
        uci,
        newState.moves.length
      );
      
      if (result.success) {
        console.log("Promotion published to DAG:", result.txId);
      }
    }
    
    setShowPromotion(false);
    setPromotionMove(null);
  };

  const getSquareStyles = () => {
    if (!gameState) return {};
    
    const styles: Record<string, React.CSSProperties> = {};
    
    // Highlight selected square
    if (gameState.selectedSquare) {
      styles[gameState.selectedSquare] = {
        backgroundColor: theme.selectedSquare,
      };
    }
    
    // Highlight legal move destinations
    gameState.legalMoves.forEach((move) => {
      styles[move.to] = {
        background: `radial-gradient(circle, ${theme.legalMoveIndicator} 25%, transparent 25%)`,
        borderRadius: "50%",
      };
    });
    
    // Highlight last move
    if (gameState.lastMove) {
      styles[gameState.lastMove.from] = {
        backgroundColor: "rgba(255, 255, 0, 0.4)",
      };
      styles[gameState.lastMove.to] = {
        backgroundColor: "rgba(255, 255, 0, 0.4)",
      };
    }
    
    return styles;
  };

  const handleCreateWallet = async () => {
    try {
      if (wordCountChoice === 'hex') {
        // Generate raw 256-bit private key (no mnemonic)
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        const hexKey = Array.from(randomBytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        
        await kaspaService.initializeWithPrivateKey(hexKey);
        const address = kaspaService.getAddress();
        setWalletAddress(address);
        setShowMnemonic(null);
        setShowPrivateKeyHex(hexKey);
        setPrivateKeyRevealed(false);
        setShowWordCountPicker(false);
      } else {
        const mnemonic = await kaspaService.generateNewMnemonic(wordCountChoice);
        await kaspaService.initialize(mnemonic);
        const address = kaspaService.getAddress();
        setWalletAddress(address);
        setShowMnemonic(mnemonic);
        
        // Derive and show private key
        const privKey = await derivePrivateKeyHex(mnemonic);
        setShowPrivateKeyHex(privKey);
        setPrivateKeyRevealed(false);
        setShowWordCountPicker(false);
      }
    } catch (error) {
      console.error('Failed to create wallet:', error);
      alert('Failed to create wallet: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleImportWallet = async () => {
    if (!mnemonicInput.trim()) {
      alert("Please enter a mnemonic phrase");
      return;
    }
    const words = mnemonicInput.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      alert("Mnemonic must be 12 or 24 words");
      return;
    }
    try {
      await kaspaService.initialize(mnemonicInput.trim());
      const address = kaspaService.getAddress();
      setWalletAddress(address);
      setScreen("welcome");
    } catch (error) {
      alert("Invalid mnemonic phrase - check spelling");
    }
  };

  const handleImportPrivateKey = async () => {
    if (!privateKeyInput.trim()) {
      alert("Please enter a private key");
      return;
    }
    try {
      await kaspaService.initializeWithPrivateKey(privateKeyInput.trim());
      const address = kaspaService.getAddress();
      setWalletAddress(address);
      setScreen("welcome");
    } catch (error) {
      alert("Invalid private key: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem('kasparov-wallet-address');
    setWalletAddress(null);
    setScreen('wallet-setup');
  };

  const handleContinueAfterBackup = () => {
    setShowMnemonic(null);
    setShowPrivateKeyHex(null);
    setPrivateKeyRevealed(false);
    setScreen("welcome");
  };

  const handleCopyMnemonic = async () => {
    if (showMnemonic) {
      await navigator.clipboard.writeText(showMnemonic);
      alert('Recovery phrase copied to clipboard!');
    }
  };

  const handleCopyAddress = async () => {
    if (walletAddress) {
      await navigator.clipboard.writeText(walletAddress);
      alert('Address copied!');
    }
  };

  if (screen === "wallet-setup") {
    // Show mnemonic backup screen
    if (showMnemonic) {
      const wordCount = showMnemonic.split(" ").length;
      return (
        <div className="app">
          <div className="wallet-setup chess-theme">
            <div className="chess-header">
              <span className="chess-piece">♜</span>
              <h2>Secure Your Kingdom</h2>
              <span className="chess-piece">♜</span>
            </div>
            <div className="warning-box">
              <span className="warning-icon">⚠️</span>
              <div>
                <strong>Write these down NOW!</strong>
                <p>This is your ONLY way to recover funds. We never store your keys.</p>
              </div>
            </div>
            <div className="key-section">
              <div className="key-header">
                <span>📝 Recovery Phrase</span>
                <span className="key-badge">{wordCount} words</span>
              </div>
              <div className="mnemonic-display">
                {showMnemonic.split(" ").map((word, i) => (
                  <div key={i} className="mnemonic-word">
                    <span className="word-number">{i + 1}</span>
                    <span className="word-text">{word}</span>
                  </div>
                ))}
              </div>
              <button onClick={handleCopyMnemonic} className="btn btn-ghost" style={{ marginTop: '12px' }}>
                📋 Copy Phrase
              </button>
            </div>
            
            {showPrivateKeyHex && (
              <div className="key-section">
                <div className="key-header">
                  <span>🔑 Private Key</span>
                  <span className="key-badge">64 hex</span>
                </div>
                <div className="private-key-display">
                  <code className={privateKeyRevealed ? 'revealed' : 'blurred'}>
                    {privateKeyRevealed ? showPrivateKeyHex : '●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●'}
                  </code>
                  <div className="key-actions">
                    <button onClick={() => setPrivateKeyRevealed(!privateKeyRevealed)} className="btn btn-small">
                      {privateKeyRevealed ? '🙈 Hide' : '👁 Show'}
                    </button>
                    {privateKeyRevealed && (
                      <button 
                        onClick={() => { navigator.clipboard.writeText(showPrivateKeyHex); alert('Private key copied!'); }}
                        className="btn btn-small"
                      >
                        📋 Copy
                      </button>
                    )}
                  </div>
                </div>
                <p className="key-hint">💡 Works with Kasware, Kastle & other Kaspa wallets</p>
              </div>
            )}
            
            <div className="wallet-info">
              <p className="wallet-label">Your Address</p>
              <code className="wallet-address" onClick={handleCopyAddress} title="Click to copy">
                {walletAddress}
              </code>
            </div>
            <button onClick={handleContinueAfterBackup} className="btn btn-primary btn-large">
              ♔ Enter the Arena
            </button>
          </div>
        </div>
      );
    }

    // Show hex-only backup screen
    if (showPrivateKeyHex && !showMnemonic) {
      return (
        <div className="app">
          <div className="wallet-setup chess-theme">
            <div className="chess-header">
              <span className="chess-piece">♝</span>
              <h2>Your Secret Key</h2>
              <span className="chess-piece">♝</span>
            </div>
            <div className="warning-box">
              <span className="warning-icon">⚠️</span>
              <div>
                <strong>Store this safely!</strong>
                <p>This 64-character key is your only access. Never share it.</p>
              </div>
            </div>
            
            <div className="key-section large">
              <div className="key-header">
                <span>🔐 Private Key</span>
                <span className="key-badge">256-bit hex</span>
              </div>
              <div className="private-key-display large">
                <code className={privateKeyRevealed ? 'revealed' : 'blurred'}>
                  {privateKeyRevealed ? showPrivateKeyHex : '●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●'}
                </code>
                <div className="key-actions">
                  <button onClick={() => setPrivateKeyRevealed(!privateKeyRevealed)} className="btn btn-small">
                    {privateKeyRevealed ? '🙈 Hide' : '👁 Show'}
                  </button>
                  {privateKeyRevealed && (
                    <button 
                      onClick={() => { navigator.clipboard.writeText(showPrivateKeyHex); alert('Private key copied!'); }}
                      className="btn btn-small"
                    >
                      📋 Copy
                    </button>
                  )}
                </div>
              </div>
              <p className="key-hint">💡 Import directly into Kasware, Kastle, or any Kaspa wallet</p>
            </div>
            
            <div className="wallet-info">
              <p className="wallet-label">Your Address</p>
              <code className="wallet-address" onClick={handleCopyAddress} title="Click to copy">
                {walletAddress}
              </code>
            </div>
            <button onClick={handleContinueAfterBackup} className="btn btn-primary btn-large">
              ♔ Enter the Arena
            </button>
          </div>
        </div>
      );
    }

    // Word count picker
    if (showWordCountPicker) {
      return (
        <div className="app">
          <div className="wallet-setup chess-theme">
            <div className="chess-header">
              <span className="chess-piece">♛</span>
              <h2>Choose Your Key</h2>
              <span className="chess-piece">♛</span>
            </div>
            <p className="subtitle">Select the format for your new wallet</p>
            
            <div className="type-grid">
              <button 
                onClick={() => setWordCountChoice(12)}
                className={`type-card ${wordCountChoice === 12 ? 'selected' : ''}`}
              >
                <span className="type-icon">📝</span>
                <span className="type-value">12</span>
                <span className="type-label">Words</span>
                <span className="type-desc">Standard</span>
                <span className="type-bits">128-bit</span>
              </button>
              
              <button 
                onClick={() => setWordCountChoice(24)}
                className={`type-card ${wordCountChoice === 24 ? 'selected' : ''}`}
              >
                <span className="type-icon">📜</span>
                <span className="type-value">24</span>
                <span className="type-label">Words</span>
                <span className="type-desc">Maximum</span>
                <span className="type-bits">256-bit</span>
              </button>
              
              <button 
                onClick={() => setWordCountChoice('hex')}
                className={`type-card ${wordCountChoice === 'hex' ? 'selected' : ''}`}
              >
                <span className="type-icon">🔐</span>
                <span className="type-value">64</span>
                <span className="type-label">Hex Key</span>
                <span className="type-desc">Raw Key</span>
                <span className="type-bits">256-bit</span>
              </button>
            </div>
            
            <button onClick={handleCreateWallet} className="btn btn-primary btn-large" style={{ width: '100%' }}>
              ⚡ {wordCountChoice === 'hex' ? 'Generate Hex Key' : `Generate ${wordCountChoice}-Word Phrase`}
            </button>
            <button onClick={() => setShowWordCountPicker(false)} className="btn btn-ghost" style={{ width: '100%', marginTop: '10px' }}>
              ← Back to options
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="app">
        <div className="wallet-setup chess-theme">
          <div className="chess-header main">
            <span className="chess-piece large">♔</span>
            <div>
              <h1>Kasparov</h1>
              <p className="tagline">On-chain chess • Powered by Kaspa</p>
            </div>
            <span className="chess-piece large">♚</span>
          </div>
          
          <div className="chess-board-decoration" />
          
          {!importMode ? (
            <div className="wallet-options">
              <div className="section-label">
                <span>♟</span> Get Started <span>♟</span>
              </div>
              <button onClick={() => setShowWordCountPicker(true)} className="btn btn-primary btn-large">
                <span className="btn-icon">♕</span> Create New Wallet
              </button>
              
              <div className="divider">
                <span>or import existing</span>
              </div>
              
              <button onClick={() => setImportMode('mnemonic')} className="btn btn-secondary btn-large">
                Import Seed Phrase
              </button>
              <button onClick={() => setImportMode('privateKey')} className="btn btn-secondary btn-large">
                Import Private Key
              </button>
              
              <div className="config-section">
                <button onClick={() => setImportMode('nodeConfig')} className="btn btn-ghost btn-small">
                  ⚙️ Configure Node
                </button>
                <p className="node-info">
                  {nodeEndpoint.replace('wss://', '').replace('ws://', '').slice(0, 30)}...
                </p>
              </div>
            </div>
          ) : importMode === 'mnemonic' ? (
            <div className="wallet-import">
              <div className="chess-header small">
                <span className="chess-piece">♞</span>
                <h3>Import Wallet</h3>
                <span className="chess-piece">♞</span>
              </div>
              <p className="subtitle">Enter your 12 or 24-word recovery phrase</p>
              <textarea
                value={mnemonicInput}
                onChange={(e) => setMnemonicInput(e.target.value)}
                placeholder="Enter your seed phrase, words separated by spaces..."
                className="mnemonic-input"
                rows={4}
              />
              <div className="wallet-import-buttons">
                <button onClick={handleImportWallet} className="btn btn-primary">
                  ♜ Restore Wallet
                </button>
                <button onClick={() => setImportMode(false)} className="btn btn-ghost">
                  ← Back
                </button>
              </div>
            </div>
          ) : importMode === 'privateKey' ? (
            <div className="wallet-import">
              <div className="chess-header small">
                <span className="chess-piece">♝</span>
                <h3>Import Key</h3>
                <span className="chess-piece">♝</span>
              </div>
              <p className="subtitle">Enter your 64-character hex private key</p>
              <input
                type="password"
                value={privateKeyInput}
                onChange={(e) => setPrivateKeyInput(e.target.value)}
                placeholder="64-character hexadecimal private key"
                className="mnemonic-input mono"
              />
              <p className="input-hint">Export from Kasware/Kastle: Settings → Export Private Key</p>
              <div className="wallet-import-buttons">
                <button onClick={handleImportPrivateKey} className="btn btn-primary">
                  ♝ Restore Wallet
                </button>
                <button onClick={() => setImportMode(false)} className="btn btn-ghost">
                  ← Back
                </button>
              </div>
            </div>
          ) : importMode === 'nodeConfig' ? (
            <div className="wallet-import">
              <div className="chess-header small">
                <span className="chess-piece">⚙️</span>
                <h3>Node Config</h3>
                <span className="chess-piece">⚙️</span>
              </div>
              <p className="subtitle">Connect to your local node or public endpoint</p>
              <input
                type="text"
                value={nodeEndpoint}
                onChange={(e) => setNodeEndpoint(e.target.value)}
                placeholder="ws://localhost:17110"
                className="mnemonic-input mono"
              />
              <div className="endpoint-hints">
                <strong>Common endpoints:</strong>
                <code>ws://localhost:17110</code> Local mainnet
                <code>ws://localhost:17210</code> Local testnet
                <code>wss://kaspa.aspectron.com/mainnet</code> Public
              </div>
              <div className="wallet-import-buttons">
                <button 
                  onClick={() => {
                    setWrpcEndpoint(nodeEndpoint);
                    alert('Node endpoint saved!');
                    setImportMode(false);
                  }} 
                  className="btn btn-primary"
                >
                  Save Configuration
                </button>
                <button onClick={() => setImportMode(false)} className="btn btn-secondary">
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div className="wallet-import">
              <h3>Import with Private Key</h3>
              <p>Enter your 64-character hex private key</p>
              <input
                type="password"
                value={privateKeyInput}
                onChange={(e) => setPrivateKeyInput(e.target.value)}
                placeholder="64-character hex private key"
                className="mnemonic-input"
                style={{ fontFamily: 'monospace', height: 'auto', padding: '12px' }}
              />
              <div className="wallet-import-buttons">
                <button onClick={handleImportPrivateKey} className="btn btn-primary">
                  Import Wallet
                </button>
                <button onClick={() => setImportMode(false)} className="btn btn-secondary">
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === "welcome") {
    return (
      <div className="app">
        <div className="welcome">
          <h1>Kasparov Chess</h1>
          <p>On-chain chess powered by Kaspa</p>
          
          {walletAddress && (
            <div className="wallet-info">
              <p className="wallet-label">Connected Wallet:</p>
              <code className="wallet-address">{walletAddress}</code>
              <button onClick={handleDisconnect} className="btn btn-small btn-secondary" style={{ marginTop: '8px' }}>
                Disconnect
              </button>
            </div>
          )}
          
          <div className="welcome-buttons">
            <button onClick={handleCreateGame} className="btn btn-primary">
              Create Game
            </button>
            <button
              onClick={() => {
                const gameId = prompt("Enter game ID:");
                if (gameId) handleJoinGame(gameId);
              }}
              className="btn btn-secondary"
            >
              Join Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "lobby" && gameState) {
    return (
      <div className="app">
        <div className="lobby">
          <h2>Game Lobby</h2>
          <p>Game ID: <code>{gameState.gameId}</code></p>
          <p>Your color: {gameState.myColor === "w" ? "White" : "Black"}</p>
          
          <div className="board-preview">
            <Chessboard
              position={gameState.fen}
              boardOrientation={game?.getBoardOrientation()}
              customDarkSquareStyle={{ backgroundColor: theme.darkSquare }}
              customLightSquareStyle={{ backgroundColor: theme.lightSquare }}
              arePiecesDraggable={false}
            />
          </div>
          
          {!gameState.blackPub ? (
            <p>Waiting for opponent to join...</p>
          ) : (
            <button onClick={handleStartGame} className="btn btn-primary">
              Start Game
            </button>
          )}
        </div>
      </div>
    );
  }

  if (screen === "playing" && gameState && game) {
    return (
      <div className="app">
        <div className="game-container">
          <div className="game-header">
            <h3>Game: {gameState.gameId}</h3>
            <p>
              Turn: {gameState.turn === "w" ? "White" : "Black"}
              {gameState.turn === gameState.myColor && " (You)"}
            </p>
          </div>

          <div className="board-container">
            <Chessboard
              position={gameState.fen}
              boardOrientation={game.getBoardOrientation()}
              onSquareClick={handleSquareClick}
              customDarkSquareStyle={{ backgroundColor: theme.darkSquare }}
              customLightSquareStyle={{ backgroundColor: theme.lightSquare }}
              customSquareStyles={getSquareStyles()}
              arePiecesDraggable={false}
            />
          </div>

          <div className="game-info">
            <h4>Moves</h4>
            <div className="moves-list">
              {gameState.moves.map((move, i) => (
                <span key={i} className="move">
                  {Math.floor(i / 2) + 1}.{i % 2 === 0 ? "" : ".."} {move}
                </span>
              ))}
            </div>
          </div>

          {gameState.status === "ended" && (
            <div className="game-over">
              <h3>Game Over</h3>
              <p>{game.isGameOver().result}</p>
            </div>
          )}
        </div>

        {showPromotion && (
          <div className="promotion-modal">
            <div className="promotion-content">
              <h3>Choose Promotion</h3>
              <div className="promotion-pieces">
                <button onClick={() => handlePromotion("q")}>Queen</button>
                <button onClick={() => handlePromotion("r")}>Rook</button>
                <button onClick={() => handlePromotion("b")}>Bishop</button>
                <button onClick={() => handlePromotion("n")}>Knight</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
