import { Link } from "../components/TransitionLink.jsx";
import { useEffect, useState } from "react";
import { getRegistrationsForUser, isUnregistrationOpen, subscribeToData, unregisterTournament } from "../data/gameArenaData.js";
import { getCompletedMatchHistory, getCompletedTournamentHistory } from "../data/accountStore.js";
import { getTournamentById } from "../data/tournaments.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Activities() {
  const { user, status: authStatus } = useAuth();
  const [registrations, setRegistrations] = useState(() => user ? getRegistrationsForUser(user.id) : []);
  const [now, setNow] = useState(() => new Date());
  const [pendingUnregistration, setPendingUnregistration] = useState(null);
  const [unregistrationFeedback, setUnregistrationFeedback] = useState("");
  useEffect(() => {
    const refresh = () => setRegistrations(user ? getRegistrationsForUser(user.id) : []);
    refresh();
    return subscribeToData(refresh);
  }, [user]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function confirmUnregistration() {
    if (!pendingUnregistration) return;
    const result = await unregisterTournament(pendingUnregistration.tournamentId, user?.id, new Date());
    if (result.ok) {
      setPendingUnregistration(null);
      setUnregistrationFeedback("");
      return;
    }
    if (result.reason === "closed") {
      setNow(new Date());
      return;
    }
    setPendingUnregistration(null);
    setUnregistrationFeedback("This tournament registration could not be removed. Please refresh and try again.");
  }
  const isThisMonth = (value) => {
    const date = new Date(value);
    const current = new Date();
    return !Number.isNaN(date.getTime()) && date.getFullYear() === current.getFullYear() && date.getMonth() === current.getMonth();
  };
  const matchHistory = getCompletedMatchHistory(user);
  const monthMatches = matchHistory.filter((match) => isThisMonth(match.completedAt || match.playedAt || match.at || match.createdAt));
  const achievements = Array.isArray(user?.achievements) ? user.achievements : [];
  const tournamentHistory = getCompletedTournamentHistory(user);
  const stats = {
    matches: monthMatches.length,
    wins: monthMatches.filter((match) => match.result === "win").length,
    tournaments: registrations.length,
    badges: achievements.filter((achievement) => isThisMonth(achievement.unlockedAt || achievement.createdAt || achievement.at)).length,
  };
  const pendingCanUnregister = pendingUnregistration
    ? isUnregistrationOpen(pendingUnregistration.tournamentStart, now)
    : false;
  const activityItems = [
    ...(Array.isArray(user?.activities) ? user.activities : [])
      .filter((activity) => activity.userId === user?.id)
      .map((activity) => ({
        ...activity,
        at: activity.at || activity.createdAt || activity.date,
        type: activity.type || "activity",
        title: activity.title || activity.name || activity.value || "Player activity",
        detail: activity.detail || activity.description || "",
      })),
    ...matchHistory.map((match) => ({
      at: match.completedAt || match.playedAt || match.at || match.createdAt,
      type: "match",
      result: match.result,
      title: match.title || `${match.result === "win" ? "Won" : match.result === "loss" ? "Lost" : "Drew"} vs ${match.opponent || "opponent"}`,
      detail: [match.game, match.score, match.map].filter(Boolean).join(" · "),
    })),
    ...achievements.map((achievement) => ({
      at: achievement.unlockedAt || achievement.createdAt || achievement.at,
      type: "badge",
      title: `Achievement unlocked: ${achievement.name || achievement.title || achievement.value || "Achievement"}`,
      detail: achievement.description || achievement.detail || "",
    })),
    ...tournamentHistory.map((entry) => ({
      at: entry.completedAt || entry.at,
      type: "tournament-result",
      title: `${entry.result} · ${entry.name || getTournamentById(entry.tournamentId)?.name || "Tournament"}`,
      detail: "Tournament result",
    })),
    ...registrations.map((registration) => {
      const tournament = getTournamentById(registration.tournamentId);
      return { at: registration.registeredAt, type: "tournament-registration", result: "win", title: "REGISTERED FOR TOURNAMENT", detail: `${tournament?.game || registration.game || "Tournament"} · ${tournament?.name || registration.name} · Registration successful` };
    }),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  };
  return (
    <main>
    <div className="w">
      <div className="ph in">
        <h1>
          {"Activities"}
        </h1>
        <p>
          {"Your recent matches, tournament runs and achievements in one timeline."}
        </p>
      </div>
      <section style={{paddingTop: "24px"}}>
        <div className="g" style={{marginBottom: "48px"}}>
          <div className="st lt rv activity-stat">
            <b data-activity-stat="matches">
            {stats.matches}
            </b>
            {"Matches this month"}
          </div>
          <div className="st lt rv activity-stat">
            <b data-activity-stat="wins">
            {stats.wins}
            </b>
            {"Wins this month"}
          </div>
          <div className="st lt rv activity-stat">
            <b data-activity-stat="tournaments">
            {stats.tournaments}
            </b>
            {"Tournaments joined"}
          </div>
          <div className="st lt rv activity-stat">
            <b data-activity-stat="badges">
            {stats.badges}
            </b>
            {"New badges"}
          </div>
        </div>
        <section className="registered-tournaments" aria-labelledby="registered-tournaments-title">
          <div className="sh">
            <h2 id="registered-tournaments-title">
              {"Registered tournaments"}
            </h2>
          </div>
          <div id="registered-tournament-list" className="g">
            {registrations.map((registration) => {
              const registeredDate = new Date(registration.registeredAt);
              const tournament = getTournamentById(registration.tournamentId);
              const tournamentName = tournament?.name || registration.name;
              const tournamentGame = tournament?.game || registration.game || "—";
              const tournamentStart = tournament?.start || registration.tournamentStart;
              const start = Date.parse(tournamentStart);
              const end = Date.parse(tournament?.end || registration.tournamentEnd);
              const status = registration.tournamentStatus === "Cancelled" ? "Cancelled"
                : Number.isFinite(start) && Date.now() < start ? "Upcoming"
                  : Number.isFinite(end) && Date.now() > end ? "Completed"
                    : Number.isFinite(start) && Date.now() >= start ? "Live" : (registration.tournamentStatus || "Upcoming");
              const route = registration.tournamentId ? `/tournament/${registration.tournamentId}` : null;
              const canUnregister = isUnregistrationOpen(tournamentStart, now);
              return <article className="card pad registered-tournament-card" data-tournament-id={registration.tournamentId} key={`${registration.userId}-${registration.tournamentId}`}>
                <div className="registered-tournament-header"><h3>{tournamentName}</h3><span className={`registration-status-badge status-${status.toLowerCase()}`}>{status}</span></div>
                <div className="registered-tournament-meta">
                  <p><b>Game: </b>{tournamentGame}</p>
                  <p><b>Registered: </b>{Number.isNaN(registeredDate.getTime()) ? "Date unavailable" : registeredDate.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                  <p><b>Tournament: </b>{tournamentStart ? new Date(tournamentStart).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Date unavailable"}</p>
                  <p><b>Registration: </b>{registration.registrationStatus}</p>
                  {registration.entryFee !== null && registration.entryFee !== undefined && <p><b>Entry fee: </b>{registration.entryFee === 0 ? "Free" : `₹${Number(registration.entryFee).toLocaleString("en-IN")}`}</p>}
                </div>
                <div className="registered-tournament-actions">
                  {route && <Link className="btn o sm registered-tournament-link" to={route}>View Tournament</Link>}
                  <button className="btn sm unregister-button" type="button" disabled={!canUnregister} aria-label={`Unregister from ${registration.name}`} onClick={() => { setPendingUnregistration(registration); setUnregistrationFeedback(""); }}>Unregister</button>
                  {!canUnregister && <span className="unregistration-closed">Unregistration closed</span>}
                  {unregistrationFeedback && <span className="unregistration-feedback" role="status">{unregistrationFeedback}</span>}
                </div>
              </article>;
            })}
          </div>
          {pendingUnregistration && <div className="unregister-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingUnregistration(null); }}>
            <section className="unregister-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="unregister-dialog-title" aria-describedby="unregister-dialog-description" onKeyDown={(event) => { if (event.key === "Escape") setPendingUnregistration(null); }}>
              <h2 id="unregister-dialog-title">Unregister from tournament?</h2>
              <p id="unregister-dialog-description">Are you sure you want to unregister from <strong>{pendingUnregistration.name}</strong>? This will cancel your tournament registration.</p>
              {!pendingCanUnregister && <p className="unregistration-closed" role="status">Unregistration closed</p>}
              {unregistrationFeedback && <p className="unregistration-feedback" role="status">{unregistrationFeedback}</p>}
              <div className="unregister-confirm-actions">
                <button className="btn p sm" type="button" disabled={!pendingCanUnregister} onClick={confirmUnregistration}>Confirm Unregister</button>
                <button className="btn o sm" type="button" autoFocus onClick={() => setPendingUnregistration(null)}>Keep Registration</button>
              </div>
            </section>
          </div>}
          {authStatus === "loading" && <p className="card pad" role="status">Restoring your account session…</p>}
          {authStatus === "unavailable" && <p className="card pad" role="status">Account storage is unavailable in this browser.</p>}
          <div id="registered-tournament-empty" className="registered-empty card pad" hidden={authStatus === "loading" || authStatus === "unavailable" || registrations.length > 0 || !user}>
            <h3>
              {"No tournament registrations yet."}
            </h3>
            <p>
              {"Explore upcoming tournaments and register to compete."}
            </p>
            <Link className="btn p sm" to="/search-events">
              {"Explore tournaments"}
            </Link>
          </div>
        </section>
        <div className="tlw" id="activity-timeline">
          {activityItems.length > 0
            ? activityItems.map((item, index) => <div className="ti rv" data-activity-type={item.type} data-activity-at={item.at} key={item.id || `${item.type}-${item.at || item.title}-${index}`}>
              <div className="card pad">
                <time dateTime={item.at || undefined}>{item.at ? formatDate(item.at) : "Date unavailable"}</time>
                <h3>{item.title}</h3>
                {item.detail && <p className={item.result === "loss" ? "loss" : "win"}>{item.detail}</p>}
              </div>
            </div>)
            : <p className="card pad">No activities yet. Your tournament registrations and gaming milestones will appear here.</p>}
        </div>
      </section>
    </div>
    </main>
  );
}
