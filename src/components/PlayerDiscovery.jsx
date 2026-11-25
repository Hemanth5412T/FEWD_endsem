import { useEffect, useState } from "react";
import { Link } from "./TransitionLink.jsx";
import { searchRegisteredPlayers } from "../data/accountStore.js";

function Avatar({ name }) {
  const initials = String(name || "Player").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
  return <span className="community-avatar community-avatar-small" aria-hidden="true">{initials}</span>;
}

export default function PlayerDiscovery({ viewer }) {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = query.trim();
    if (!viewer?.id || viewer.status !== "active" || !term) {
      setPlayers([]);
      setLoading(false);
      setError("");
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchRegisteredPlayers(term, viewer.id);
        if (active) setPlayers(results);
      } catch (requestError) {
        if (active) setError(requestError.message || "Player search could not be completed.");
      } finally {
        if (active) setLoading(false);
      }
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, viewer?.id, viewer?.status]);

  return <section className="player-discovery card" aria-labelledby="player-discovery-title">
    <div className="player-discovery-heading">
      <div><p className="eyebrow">MEET THE PLAYERS</p><h2 id="player-discovery-title">Find players</h2></div>
      {!viewer?.id && <Link className="btn o sm" to="/login">Log in to search</Link>}
    </div>
    <label className="player-search-field">
      <span className="community-sr-only">Search by username or display name</span>
      <input type="search" value={query} placeholder="Search username or display name" onChange={(event) => setQuery(event.target.value)} disabled={!viewer || viewer.status !== "active"} />
    </label>
    {viewer && viewer.status !== "active" && <p className="player-discovery-note">An active account is required to search for players.</p>}
    {error && <p className="player-follow-error" role="alert">{error}</p>}
    {query.trim() && <div className="player-search-results" aria-live="polite">
      {loading
        ? <p className="player-discovery-note" role="status">Searching players…</p>
        : error ? null
          : players.length
            ? players.map((player) => <article className="player-search-result" key={player.userId}>
              <Link className="player-follow-person" to={`/player/${encodeURIComponent(player.userId)}`}>
                <Avatar name={player.displayName} />
                <span><b>{player.displayName}</b><small>@{player.username}</small></span>
              </Link>
              <span className="player-search-counts"><b>{player.followers}</b> Followers · <b>{player.following}</b> Following</span>
              <Link className="btn o sm" to={`/player/${encodeURIComponent(player.userId)}`}>View Profile</Link>
            </article>)
            : <p className="player-discovery-note">No registered players match that search.</p>}
    </div>}
  </section>;
}
