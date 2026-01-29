import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { detectWallets, connectKasware, connectKastle, type WalletSession, sendMoveTx } from "../wallet/wallet";

type GameState = "lobby" | "waiting" | "playing" | "finished";

type GameData = {
  id: string;
  creator: string;
  opponent?: string;
  timeControl: string;
  initialTime: number;
  increment: number;
  whiteTime: number;
  blackTime: number;
  currentTurn: "w" | "b";
  fen: string;
  status: GameState;
};

const TIME_PRESETS = [
  { label: "1+0 (Bullet)", initial: 60, increment: 0 },
  { label: "3+0 (Bullet)", initial: 180, increment: 0 },
  { label: "3+2 (Blitz)", initial: 180, increment: 2 },
  { label: "5+0 (Blitz)", initial: 300, increment: 0 },
  { label: "5+3 (Blitz)", initial: 300, increment: 3 },
  { label: "10+0 (Rapid)", initial: 600, increment: 0 },
  { label: "10+5 (Rapid)", initial: 600, increment: 5 },
  { label: "15+10 (Rapid)", initial: 900, increment: 10 },
  { label: "30+20 (Classical)", initial: 1800, increment: 20 },
];

function Timer({ seconds }: { seconds: number }) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const isLow = seconds < 60;
  return (
    <span style={{ color: isLow ? "#ff6b6b" : "#00ffa3", fontFamily: "monospace", fontWeight: "bold" }}>
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}


export default function App() {
  const [gameState, setGameState] = useState<GameState>("lobby");
  const [game, setGame] = useState<GameData | null>(null);
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [session, setSession] = useState<WalletSession | null>(null);
  const [wallets, setWallets] = useState(() => detectWallets());
  const [selectedTime, setSelectedTime] = useState(TIME_PRESETS[3]);
  const [gameIdToJoin, setGameIdToJoin] = useState("");
  const [status, setStatus] = useState("");
  const [games, setGames] = useState<GameData[]>(() => {
    try {
      const saved = localStorage.getItem("kasparov_games");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [manualAddress, setManualAddress] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);

  // Timer tick
  useEffect(() => {
    if (gameState !== "playing" || !game) return;
    const timer = setInterval(() => {
      setGame((prev) => {
        if (!prev) return prev;
        const isWhitesTurn = prev.currentTurn === "w";
        if (isWhitesTurn) {
          const newWhiteTime = Math.max(0, prev.whiteTime - 1000);
          if (newWhiteTime === 0) {
            setStatus("⏰ Black wins by timeout!");
            setGameState("finished");
          }
          return { ...prev, whiteTime: newWhiteTime };
        } else {
          const newBlackTime = Math.max(0, prev.blackTime - 1000);
          if (newBlackTime === 0) {
            setStatus("⏰ White wins by timeout!");
            setGameState("finished");
          }
          return { ...prev, blackTime: newBlackTime };
        }
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState, game]);

  // Save games to localStorage
  useEffect(() => {
    localStorage.setItem("kasparov_games", JSON.stringify(games));
  }, [games]);

  useEffect(() => {
    const t = setInterval(() => setWallets(detectWallets()), 1000);
    return () => clearInterval(t);
  }, []);

  const boardWidth = useMemo(() => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1200;
    return Math.max(280, Math.min(520, Math.floor(w * 0.45)));
  }, []);

  async function onConnectKasware() {
    setStatus("🔗 Connecting...");
    try {
      const s = await connectKasware("kaspa_mainnet");
      setSession(s);
      setStatus(`✓ Connected: ${s.address.slice(0, 8)}...`);
      setShowManualInput(false);
    } catch (e: any) {
      setStatus(`✗ ${e?.message || "Connection failed"}`);
    }
  }

  async function onConnectKastle() {
    setStatus("🔗 Connecting...");
    try {
      const s = await connectKastle("kaspa_mainnet");
      setSession(s);
      setStatus(`✓ Connected: ${s.address.slice(0, 8)}...`);
      setShowManualInput(false);
    } catch (e: any) {
      setStatus(`✗ ${e?.message || "Connection failed"}`);
    }
  }

  function onConnectManual() {
    if (!manualAddress.trim()) {
      setStatus("✗ Please enter a Kaspa address");
      return;
    }
    if (manualAddress.length < 30) {
      setStatus("✗ Invalid address (too short)");
      return;
    }
    setSession({
      kind: "kasware",
      address: manualAddress.trim(),
    });
    setStatus(`✓ Connected: ${manualAddress.slice(0, 8)}...`);
    setShowManualInput(false);
    setManualAddress("");
  }

  function disconnect() {
    setSession(null);
    setStatus("");
    setGameState("lobby");
    setGame(null);
  }

  function createGame() {
    if (!session) {
      setStatus("✗ Connect wallet first");
      return;
    }
    const gameId = crypto.randomUUID();
    const newGame: GameData = {
      id: gameId,
      creator: session.address,
      timeControl: selectedTime.label,
      initialTime: selectedTime.initial,
      increment: selectedTime.increment,
      whiteTime: selectedTime.initial * 1000,
      blackTime: selectedTime.initial * 1000,
      currentTurn: "w",
      fen: chess.fen(),
      status: "waiting",
    };
    setGame(newGame);
    setGames([...games, newGame]);
    setGameState("waiting");
    setStatus(`✓ Game created! Share this ID`);
  }

  function joinGame() {
    if (!session) {
      setStatus("✗ Connect wallet first");
      return;
    }
    if (!gameIdToJoin.trim()) {
      setStatus("✗ Enter a game ID");
      return;
    }
    const foundGame = games.find((g) => g.id === gameIdToJoin);
    if (!foundGame) {
      setStatus("✗ Game not found");
      return;
    }
    if (foundGame.opponent) {
      setStatus("✗ Game full");
      return;
    }
    foundGame.opponent = session.address;
    foundGame.status = "playing";
    setGame(foundGame);
    setGameState("playing");
    setGameIdToJoin("");
    setStatus("✓ Game started!");
  }

  async function onDrop(sourceSquare: string, targetSquare: string) {
    if (!game || gameState !== "playing" || !session) return false;

    const isWhitesTurn = game.currentTurn === "w";
    const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
    if (!move) return false;

    const nextFen = chess.fen();
    setFen(nextFen);

    const addedTime = game.increment * 1000;
    const newGame = {
      ...game,
      fen: nextFen,
      currentTurn: game.currentTurn === "w" ? "b" : "w",
      whiteTime: isWhitesTurn ? game.whiteTime + addedTime : game.whiteTime,
      blackTime: !isWhitesTurn ? game.blackTime + addedTime : game.blackTime,
    };

    setGame(newGame);

    try {
      setStatus("⏳ Tx...");
      await sendMoveTx(session, {
        gameId: game.id,
        uci: `${move.from}${move.to}${move.promotion ?? ""}`,
        fen: nextFen,
      });
      setStatus(`✓ ${move.san}`);
    } catch (e) {
      chess.undo();
      setFen(chess.fen());
      setStatus(`✗ Tx failed`);
      return false;
    }

    return true;
  }

  // LOBBY
  if (gameState === "lobby") {
    return (
      <div className="app">
        <header className="top">
          <div className="brand">
            <span className="king">♔</span>
            <span className="title">KASPAROV</span>
          </div>
          <div className="wallet">
            {session ? (
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="pill">
                  <span className="dot" />
                  {session.address.slice(0, 10)}...
                </div>
                <button className="btn danger" onClick={disconnect}>✕</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {wallets.kasware && <button className="btn" onClick={onConnectKasware}>Kasware</button>}
                {wallets.kastle && <button className="btn" onClick={onConnectKastle}>Kastle</button>}
                <button className="btn" onClick={() => setShowManualInput(!showManualInput)}>✏️</button>
              </div>
            )}
          </div>
        </header>

        {showManualInput && !session && (
          <div className="lobbyPanel">
            <h3>Kaspa Address</h3>
            <input type="text" placeholder="kaspa:..." value={manualAddress} onChange={(e) => setManualAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onConnectManual()} style={{ width: "100%", padding: "10px", marginBottom: "10px" }} />
            <button className="btnLarge" onClick={onConnectManual}>Connect</button>
          </div>
        )}

        {status && <div className={`status ${status.startsWith("✗") ? "error" : ""}`}>{status}</div>}

        {session && (
          <div className="lobbyPanel">
            <div className="timeGrid">
              {TIME_PRESETS.map((preset) => (
                <button key={preset.label} className={`timeBtn ${selectedTime === preset ? "active" : ""}`} onClick={() => setSelectedTime(preset)}>
                  {preset.label}
                </button>
              ))}
            </div>

            <button className="btnLarge" onClick={createGame}>➕ Create Game</button>

            <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid rgba(0,255,163,.1)" }}>
              <h3>Join Game</h3>
              <input type="text" placeholder="Paste game ID..." value={gameIdToJoin} onChange={(e) => setGameIdToJoin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && joinGame()} style={{ width: "100%", padding: "10px", marginBottom: "10px" }} />
              <button className="btnLarge" onClick={joinGame}>Join</button>

              {games.length > 0 && (
                <div style={{ marginTop: "20px" }}>
                  <h4>Open Games</h4>
                  <div className="gamesList">
                    {games.filter(g => !g.opponent).map((g) => (
                      <div key={g.id} className="gameItem">
                        <div>
                          <strong>{g.timeControl}</strong>
                          <br />
                          <span style={{ fontSize: "11px", color: "rgba(0,255,163,.6)" }}>{g.id.slice(0, 8)}...</span>
                        </div>
                        {g.creator !== session.address && <button style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => { setGameIdToJoin(g.id); joinGame(); }}>Join</button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // WAITING
  if (gameState === "waiting" && game) {
    return (
      <div className="app">
        <header className="top">
          <div className="brand"><span className="king">♔</span><span className="title">KASPAROV</span></div>
          <button className="btn" onClick={disconnect}>← Back</button>
        </header>
        <div className="lobbyPanel" style={{ textAlign: "center" }}>
          <h2>Waiting for Opponent</h2>
          <p>Share this ID:</p>
          <div className="codeBlock" onClick={() => navigator.clipboard.writeText(game.id)}>{game.id}</div>
          <button className="btn" onClick={disconnect} style={{ marginTop: "20px" }}>Cancel</button>
        </div>
      </div>
    );
  }

  // PLAYING
  if (gameState === "playing" && game) {
    return (
      <div className="app" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px" }}>
        <header className="top">
          <div className="brand"><span className="king">♔</span><span className="title">KASPAROV</span></div>
          <button className="btn" onClick={disconnect}>Resign</button>
        </header>

        {status && <div className={`status ${status.startsWith("✗") ? "error" : ""}`} style={{ maxWidth: "500px" }}>{status}</div>}

        <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
          <div>
            <div style={{ fontSize: "12px", color: "rgba(0,255,163,.6)", marginBottom: "8px" }}>{game.timeControl}</div>
            <Chessboard position={fen} onPieceDrop={onDrop} boardWidth={boardWidth} />
            <div style={{ marginTop: "15px", textAlign: "center", fontSize: "13px" }}>
              <div>⚪ <Timer seconds={Math.ceil(game.whiteTime / 1000)} /></div>
              <div>⚫ <Timer seconds={Math.ceil(game.blackTime / 1000)} /></div>
              <div style={{ marginTop: "10px", fontSize: "12px", color: game.currentTurn === "w" ? "#00ffa3" : "rgba(255,255,255,.5)" }}>
                {game.currentTurn === "w" ? "White to move" : "Black to move"}
              </div>
            </div>
          </div>
        </div>

        <div className="hud">
          <div>ID: {game.id.slice(0, 8)}...</div>
          <div>FEN: {fen.slice(0, 30)}...</div>
        </div>
      </div>
    );
  }

  return null;
}
