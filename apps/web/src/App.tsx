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

// Kaspa network stats interface
interface KaspaNetworkStats {
  price: number;
  priceChange24h: number;
  hashrate: number;        // in TH/s from API
  blueScore: number;
  difficulty: number;
  marketCap: number;
  circulatingSupply: number;
  blockReward: number;
  dagTips: number;         // number of DAG tips
  daaScore: number;        // DAA score
}

// Side panel component for Kaspa stats
function KaspaSidePanel({ position }: { position: 'left' | 'right' }) {
  const [stats, setStats] = useState<KaspaNetworkStats | null>(null);
  
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch all Kaspa stats in parallel - using Kaspa API for price (more reliable)
        const [kasPriceRes, cgPriceRes, hashrateRes, blueScoreRes, supplyRes, rewardRes, networkRes] = await Promise.allSettled([
          fetch('https://api.kaspa.org/info/price'),
          fetch('https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd&include_24hr_change=true'),
          fetch('https://api.kaspa.org/info/hashrate'),
          fetch('https://api.kaspa.org/info/virtual-chain-blue-score'),
          fetch('https://api.kaspa.org/info/coinsupply'),
          fetch('https://api.kaspa.org/info/blockreward'),
          fetch('https://api.kaspa.org/info/network')
        ]);
        
        let price = 0, priceChange = 0;
        let hashrate = 0, blueScore = 0, circulatingSupply = 0, blockReward = 0;
        let difficulty = 0, dagTips = 0, daaScore = 0;
        
        // Get price from Kaspa API (more reliable, updates faster)
        if (kasPriceRes.status === 'fulfilled' && kasPriceRes.value.ok) {
          const data = await kasPriceRes.value.json();
          price = data.price || 0;
        }
        
        // Get 24h change from CoinGecko (Kaspa API doesn't have this)
        if (cgPriceRes.status === 'fulfilled' && cgPriceRes.value.ok) {
          const data = await cgPriceRes.value.json();
          priceChange = data.kaspa?.usd_24h_change || 0;
          // Fallback price if Kaspa API failed
          if (!price) price = data.kaspa?.usd || 0;
        }
        
        if (hashrateRes.status === 'fulfilled' && hashrateRes.value.ok) {
          const data = await hashrateRes.value.json();
          hashrate = data.hashrate || 0; // TH/s
        }
        
        if (blueScoreRes.status === 'fulfilled' && blueScoreRes.value.ok) {
          const data = await blueScoreRes.value.json();
          blueScore = data.blueScore || 0;
        }
        
        if (supplyRes.status === 'fulfilled' && supplyRes.value.ok) {
          const data = await supplyRes.value.json();
          // Supply is in sompi (1 KAS = 100,000,000 sompi)
          circulatingSupply = parseInt(data.circulatingSupply || '0') / 1e8;
        }
        
        if (rewardRes.status === 'fulfilled' && rewardRes.value.ok) {
          const data = await rewardRes.value.json();
          blockReward = data.blockreward || 0;
        }
        
        if (networkRes.status === 'fulfilled' && networkRes.value.ok) {
          const data = await networkRes.value.json();
          difficulty = parseFloat(data.difficulty) || 0;
          dagTips = data.tipHashes?.length || 0;
          daaScore = parseInt(data.virtualDaaScore) || 0;
        }
        
        // Calculate market cap from price × circulating supply
        const marketCap = price * circulatingSupply;
        
        setStats({
          price,
          priceChange24h: priceChange,
          hashrate,
          blueScore,
          difficulty,
          marketCap,
          circulatingSupply,
          blockReward,
          dagTips,
          daaScore,
        });
      } catch (e) {
        console.error('[KaspaStats] Fetch error:', e);
      }
    };
    
    fetchStats();
    // Refresh every 3 seconds for real-time data
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const formatNumber = (n: number, decimals = 2) => {
    if (n >= 1e12) return (n / 1e12).toFixed(decimals) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(decimals) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(decimals) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(decimals) + 'K';
    return n.toFixed(decimals);
  };

  const formatHashrate = (th: number) => {
    if (th >= 1e6) return (th / 1e6).toFixed(2) + ' EH/s';
    if (th >= 1e3) return (th / 1e3).toFixed(2) + ' PH/s';
    return th.toFixed(2) + ' TH/s';
  };

  const leftStats = [
    { label: 'KAS Price', value: stats ? `$${stats.price.toFixed(4)}` : '---', change: stats?.priceChange24h },
    { label: 'Hashrate', value: stats ? formatHashrate(stats.hashrate) : '---' },
    { label: 'Market Cap', value: stats ? `$${formatNumber(stats.marketCap)}` : '---' },
    { label: 'Block Reward', value: stats ? `${stats.blockReward.toFixed(2)} KAS` : '---' },
  ];

  const rightStats = [
    { label: 'Blue Score', value: stats ? formatNumber(stats.blueScore, 0) : '---' },
    { label: 'DAA Score', value: stats ? formatNumber(stats.daaScore, 0) : '---' },
    { label: 'BPS / Block Time', value: '10 BPS (0.1s)' },
    { label: 'Circulating', value: stats ? `${formatNumber(stats.circulatingSupply)} KAS` : '---' },
  ];

  const items = position === 'left' ? leftStats : rightStats;

  return (
    <div className={`kaspa-side-panel ${position}`}>
      <div className="side-panel-header">
        <span className="kaspa-hex">⬡</span>
        <span>{position === 'left' ? 'KASPA NETWORK' : 'LIVE STATS'}</span>
      </div>
      <div className="side-panel-stats">
        {items.map((item, i) => (
          <div key={i} className="side-stat">
            <div className="side-stat-content">
              <span className="side-stat-label">{item.label}</span>
              <span className="side-stat-value">{item.value}</span>
              {item.change !== undefined && (
                <span className={`side-stat-change ${item.change >= 0 ? 'positive' : 'negative'}`}>
                  {item.change >= 0 ? '▲' : '▼'} {Math.abs(item.change).toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {position === 'right' && (
        <a 
          href="https://kas.coffee/kasparov" 
          target="_blank" 
          rel="noopener noreferrer"
          className="donate-button"
        >
          <span className="donate-icon">☕</span>
          <span>Support Kasparov</span>
        </a>
      )}
      <div className="side-panel-decoration">
        {[...Array(8)].map((_, i) => (
          <div key={i} className={`chess-square ${i % 2 === (position === 'left' ? 0 : 1) ? 'light' : 'dark'}`} />
        ))}
      </div>
    </div>
  );
}

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
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('kasparov-theme');
    return saved ? saved === 'dark' : true;
  });

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('kasparov-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);
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
        <div className="app wallet-setup-screen">
          <KaspaSidePanel position="left" />
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
          <KaspaSidePanel position="right" />
        </div>
      );
    }

    // Show hex-only backup screen
    if (showPrivateKeyHex && !showMnemonic) {
      return (
        <div className="app wallet-setup-screen">
          <KaspaSidePanel position="left" />
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
          <KaspaSidePanel position="right" />
        </div>
      );
    }

    // Word count picker
    if (showWordCountPicker) {
      return (
        <div className="app wallet-setup-screen">
          <KaspaSidePanel position="left" />
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
          <KaspaSidePanel position="right" />
        </div>
      );
    }

    return (
      <div className="app wallet-setup-screen">
        <KaspaSidePanel position="left" />
        <div className="wallet-setup chess-theme">
          {/* Theme Toggle */}
          <button 
            className="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          
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
            <div className="wallet-import-card">
              <div className="import-header">
                <div className="import-icon-wrap">
                  <span className="import-icon">📝</span>
                </div>
                <h3>Import Recovery Phrase</h3>
                <p>Enter your 12 or 24-word seed phrase to restore your wallet</p>
              </div>
              <div className="import-body">
                <label className="import-label">Recovery Phrase</label>
                <textarea
                  value={mnemonicInput}
                  onChange={(e) => setMnemonicInput(e.target.value)}
                  placeholder="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
                  className="import-textarea"
                  rows={4}
                  spellCheck={false}
                />
                <p className="import-hint">💡 Words should be separated by spaces</p>
              </div>
              <div className="import-actions">
                <button onClick={handleImportWallet} className="btn-import-primary">
                  <span>🔐</span> Restore Wallet
                </button>
                <button onClick={() => setImportMode(false)} className="btn-import-back">
                  ← Back
                </button>
              </div>
            </div>
          ) : importMode === 'privateKey' ? (
            <div className="wallet-import-card">
              <div className="import-header">
                <div className="import-icon-wrap key">
                  <span className="import-icon">🔑</span>
                </div>
                <h3>Import Private Key</h3>
                <p>Enter your 64-character hexadecimal private key</p>
              </div>
              <div className="import-body">
                <label className="import-label">Private Key (Hex)</label>
                <input
                  type="password"
                  value={privateKeyInput}
                  onChange={(e) => setPrivateKeyInput(e.target.value)}
                  placeholder="a1b2c3d4e5f6...64 characters total"
                  className="import-input mono"
                  spellCheck={false}
                />
                <div className="import-hint-box">
                  <span className="hint-icon">ℹ️</span>
                  <div>
                    <strong>How to get your private key:</strong>
                    <p>Kasware/Kastle → Settings → Export Private Key</p>
                  </div>
                </div>
              </div>
              <div className="import-actions">
                <button onClick={handleImportPrivateKey} className="btn-import-primary">
                  <span>🔐</span> Restore Wallet
                </button>
                <button onClick={() => setImportMode(false)} className="btn-import-back">
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
        <KaspaSidePanel position="right" />
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
