import { useEffect, useMemo, useState } from "react";
import { Link } from "../components/TransitionLink.jsx";
import { listPublicPlayers } from "../data/accountStore.js";

const gameFilters = {
  all: "",
  valorant: "Valorant",
  bgmi: "BGMI",
  cs2: "Counter-Strike 2",
};

export default function Leaderboard() {
  const [game, setGame] = useState("all");
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    listPublicPlayers()
      .then((result) => { if (active) setPlayers(result); })
      .catch((requestError) => { if (active) setError(requestError.message || "The leaderboard could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visiblePlayers = useMemo(() => {
    const selectedGame = gameFilters[game];
    return selectedGame ? players.filter((player) => player.game === selectedGame) : players;
  }, [game, players]);

  return (
    <main>
      <div className="w">
        <div className="ph in">
          <h1>Leaderboard</h1>
          <p>Registered players ranked by verified match results. Open a player profile to see their stats and community posts.</p>
        </div>
        <section style={{ paddingTop: "24px" }}>
          <div className="fb rv">
            <p>Game</p>
            <div className="chips" role="radiogroup" aria-label="Filter leaderboard by game">
              <input type="radio" name="leaderboard-game" id="leaderboard-game-all" checked={game === "all"} onChange={() => setGame("all")} />
              <label htmlFor="leaderboard-game-all">All games</label>
              <input type="radio" name="leaderboard-game" id="leaderboard-game-valorant" checked={game === "valorant"} onChange={() => setGame("valorant")} />
              <label htmlFor="leaderboard-game-valorant">Valorant</label>
              <input type="radio" name="leaderboard-game" id="leaderboard-game-bgmi" checked={game === "bgmi"} onChange={() => setGame("bgmi")} />
              <label htmlFor="leaderboard-game-bgmi">BGMI</label>
              <input type="radio" name="leaderboard-game" id="leaderboard-game-cs2" checked={game === "cs2"} onChange={() => setGame("cs2")} />
              <label htmlFor="leaderboard-game-cs2">Counter-Strike 2</label>
            </div>
          </div>
          {error && <p className="community-error" role="alert">{error}</p>}
          <div className="tw rv">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Game</th>
                  <th>Matches</th>
                  <th>Wins</th>
                  <th>Losses</th>
                  <th>Win rate</th>
                  <th>Tournaments</th>
                  <th>Profile</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? <tr><td colSpan="9">Loading registered players…</td></tr>
                  : visiblePlayers.length
                    ? visiblePlayers.map((player, index) => <tr key={player.userId}>
                      <td><span className="rk">{index + 1}</span></td>
                      <td><Link to={`/player/${encodeURIComponent(player.userId)}`}><b>{player.displayName}</b></Link><br /><small>@{player.username}</small></td>
                      <td>{player.game || "—"}</td>
                      <td>{player.matchesPlayed}</td>
                      <td>{player.wins}</td>
                      <td>{player.losses}</td>
                      <td>{player.winRate.toFixed(1)}%<div className="bar"><i style={{ "--p": `${player.winRate}%` }} /></div></td>
                      <td>{player.tournamentsPlayed}</td>
                      <td><Link className="btn o sm" to={`/player/${encodeURIComponent(player.userId)}`}>View</Link></td>
                    </tr>)
                    : <tr><td colSpan="9">{game === "all" ? "No registered players are available yet." : `No registered ${gameFilters[game]} players are available yet.`}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
