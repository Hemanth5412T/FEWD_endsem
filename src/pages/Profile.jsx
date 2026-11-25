import { Link } from "../components/TransitionLink.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCompletedMatchHistory, getCompletedTournamentHistory, getTournamentsPlayed } from "../data/accountStore.js";
import { getTournamentById } from "../data/tournaments.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Profile() {
  const { user, updateProfile, changePassword } = useAuth();
  const [editing, setEditing] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const editButtonRef = useRef(null);
  const closeEditor = useCallback(() => { setEditing(false); editButtonRef.current?.focus(); }, []);
  const username = user?.username || "Player";
  const initials = username.slice(0, 2).toUpperCase();
  const joined = user?.createdAt ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(user.createdAt)) : "Date unavailable";
  const matchesPlayed = user?.matchesPlayed ?? 0;
  const wins = user?.wins ?? 0;
  const losses = user?.losses ?? 0;
  const winRate = matchesPlayed ? `${((wins / matchesPlayed) * 100).toFixed(1)}%` : "0.0%";
  const completedMatches = getCompletedMatchHistory(user);
  const tournamentHistory = getCompletedTournamentHistory(user);
  const tournamentsPlayed = getTournamentsPlayed(user);
  const achievements = Array.isArray(user?.achievements) ? user.achievements : [];
  const gameStatistics = new Map();
  for (const match of completedMatches) {
    const game = String(match.game || "").trim();
    if (!game) continue;
    const statistics = gameStatistics.get(game) || { matches: 0, wins: 0 };
    statistics.matches += 1;
    if (match.result === "win") statistics.wins += 1;
    gameStatistics.set(game, statistics);
  }
  return (
    <main>
    <div className="w">
      <section style={{paddingBottom: "24px"}}>
        <div className="card ph2 in">
          <div className="av">
            {initials}
          </div>
          <div>
            <h1 style={{fontSize: "3.4rem"}}>
              {username}
            </h1>
            <p>
              <b>
                {user?.playerId || "Player ID unavailable"}
              </b>
                {user ? " · GAME ARENA player" : " · Log in to view your player profile"}
            </p>
            <p style={{margin: "8px 0 14px", maxWidth: "56ch"}}>
              {user?.bio || "No bio added yet."}
            </p>
            <span className="tag">
              {`Joined ${joined}`}
            </span>
          </div>
          <button ref={editButtonRef} className="btn p" type="button" disabled={!user} title={!user ? "Log in to edit your profile." : undefined} onClick={() => { setProfileMessage(""); setEditing(true); }}>Edit profile</button>
        </div>
        {profileMessage && <p className="profile-update-message" role="status">{profileMessage}</p>}
      </section>
      <section style={{padding: "24px 0"}}>
        <div className="g profile-stats">
          <div className="st lt rv profile-stat-card">
            <b>
              {matchesPlayed}
            </b>
            {"Total matches"}
          </div>
          <div className="st lt rv profile-stat-card">
            <b>
              {wins}
            </b>
            {"Wins"}
          </div>
          <div className="st lt rv profile-stat-card">
            <b>
              {losses}
            </b>
            {"Losses"}
          </div>
          <div className="st lt rv profile-stat-card">
            <b>
              {winRate}
            </b>
            {"Win rate"}
          </div>
          <div className="st lt rv profile-stat-card">
            <b>
              {tournamentsPlayed}
            </b>
            {"Tournaments played"}
          </div>
        </div>
      </section>
      <section style={{padding: "24px 0"}}>
        <h2 className="rv" style={{marginBottom: "20px"}}>
          {"Game statistics"}
        </h2>
        <div className="tw rv">
          <table>
            <thead>
              <tr>
                <th>
                  {"Game"}
                </th>
                <th>
                  {"Matches"}
                </th>
                <th>
                  {"Wins"}
                </th>
                <th>
                  {"Win rate"}
                </th>
                <th>
                  {"Rank"}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...gameStatistics].map(([game, statistics]) => <tr key={game}>
                <td><b>{game}</b></td>
                <td>{statistics.matches}</td>
                <td>{statistics.wins}</td>
                <td>{((statistics.wins / statistics.matches) * 100).toFixed(1)}%</td>
                <td>—</td>
              </tr>)}
              {gameStatistics.size === 0 && <tr><td colSpan="5">No completed match statistics yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section style={{padding: "24px 0"}}>
        <div className="two">
          <div>
            <h2 className="rv">
              {"Recent tournaments"}
            </h2>
            {tournamentHistory.length > 0
              ? tournamentHistory.slice(0, 3).map((entry) => {
                const tournament = getTournamentById(entry.tournamentId);
                return <div className="card pad rv" key={entry.tournamentId}>
                  <h3>{entry.name || tournament?.name || "Tournament"}</h3>
                  <p>{String(entry.result)}{entry.prize ? ` · ₹${Number(entry.prize).toLocaleString("en-IN")} won` : ""}</p>
                </div>;
              })
              : <div className="card pad rv">No tournament history yet.</div>}
          </div>
          <div>
            <h2 className="rv">
              {"Match history"}
            </h2>
            {completedMatches.length > 0
              ? completedMatches.slice(0, 3).map((match, index) => <div className="card pad rv" key={match.id || `${match.game || "match"}-${index}`}>
                <span className={`res ${match.result}`}>{match.result === "win" ? "W" : match.result === "loss" ? "L" : "D"}{match.score ? ` ${match.score}` : ""}</span>
                <b>{match.opponent ? `vs ${match.opponent}` : "Completed match"}</b>
                <br />
                <small>{[match.game, match.map].filter(Boolean).join(" · ")}</small>
              </div>)
              : <div className="card pad rv">No completed matches yet.</div>}
          </div>
        </div>
      </section>
      <section style={{padding: "24px 0"}}>
        <h2 className="rv" style={{marginBottom: "20px"}}>
          {"Achievements"}
        </h2>
        <div className="g">
          {achievements.length > 0
            ? achievements.map((achievement, index) => {
              const name = achievement.name || achievement.title || achievement.value || "Achievement";
              return <div className="card badge rv" key={achievement.id || `${name}-${index}`}>
                <i>{achievement.icon || name.slice(0, 1).toUpperCase()}</i>
                <div><b>{name}</b><br /><small>{achievement.description || achievement.detail || ""}</small></div>
              </div>;
            })
            : <p className="card pad">No achievements yet. Participate in tournaments and showcase your victories here.</p>}
        </div>
      </section>
    </div>
    {editing && <EditProfileDialog user={user} onClose={closeEditor} onProfileSave={updateProfile} onPasswordSave={changePassword} onProfileSaved={() => setProfileMessage("Profile updated successfully.")} />}
    </main>
  );
}

const usernamePattern = /^[a-zA-Z0-9_]{3,24}$/;
function EditProfileDialog({ user, onClose, onProfileSave, onPasswordSave, onProfileSaved }) {
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [usernameError, setUsernameError] = useState("");
  const [bioError, setBioError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordFieldErrors, setPasswordFieldErrors] = useState({});
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const usernameRef = useRef(null);
  const dialogRef = useRef(null);
  const busyRef = useRef(false);
  busyRef.current = profileBusy || passwordBusy;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    usernameRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { if (!busyRef.current) onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)")];
      if (!controls.length) return;
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [onClose]);

  async function saveProfile(event) {
    event.preventDefault();
    if (profileBusy || !user?.id) return;
    const cleanUsername = username.trim();
    const cleanBio = bio.trim();
    const nextUsernameError = !cleanUsername ? "Enter a username." : !usernamePattern.test(cleanUsername) ? "Use 3–24 letters, numbers, or underscores." : "";
    const nextBioError = cleanBio.length > 250 ? "Bio must be 250 characters or fewer." : "";
    setUsernameError(nextUsernameError);
    setBioError(nextBioError);
    setProfileError("");
    if (nextUsernameError || nextBioError) return;
    setProfileBusy(true);
    let result;
    try { result = await onProfileSave({ username: cleanUsername, bio: cleanBio }); }
    catch { result = { ok: false, message: "Profile changes could not be saved. Please try again." }; }
    setProfileBusy(false);
    if (!result.ok) {
      if (result.reason === "username-taken" || result.reason === "invalid-username") setUsernameError(result.message);
      else if (result.reason === "bio-too-long") setBioError(result.message);
      else setProfileError(result.message || "Profile changes could not be saved.");
      return;
    }
    onProfileSaved();
    onClose();
  }

  async function savePassword(event) {
    event.preventDefault();
    if (passwordBusy || !user?.id) return;
    setPasswordBusy(true);
    setPasswordError("");
    setPasswordSuccess("");
    const fieldErrors = {
      current: currentPassword ? "" : "Enter your current password.",
      next: !newPassword ? "Enter a new password." : newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) ? "Use at least 8 characters with uppercase, lowercase, and a number." : newPassword === currentPassword ? "Choose a password different from your current one." : "",
      confirmation: !confirmation ? "Confirm your new password." : confirmation !== newPassword ? "The new passwords do not match." : "",
    };
    setPasswordFieldErrors(fieldErrors);
    if (Object.values(fieldErrors).some(Boolean)) { setPasswordBusy(false); return; }
    let result;
    try { result = await onPasswordSave(currentPassword, newPassword, confirmation); }
    catch { result = { ok: false, message: "Password could not be updated. Please try again." }; }
    setPasswordBusy(false);
    if (!result.ok) {
      if (result.reason === "incorrect-current-password") setPasswordFieldErrors((current) => ({ ...current, current: result.message }));
      else if (["weak-password", "same-password"].includes(result.reason)) setPasswordFieldErrors((current) => ({ ...current, next: result.message }));
      else if (result.reason === "password-mismatch") setPasswordFieldErrors((current) => ({ ...current, confirmation: result.message }));
      else setPasswordError(result.message || "Password could not be updated.");
      return;
    }
    setCurrentPassword(""); setNewPassword(""); setConfirmation("");
    setPasswordSuccess("Password updated successfully.");
  }

  const closeDisabled = profileBusy || passwordBusy;
  return <div className="profile-edit-backdrop" onMouseDown={(event) => { if (!closeDisabled && event.target === event.currentTarget) onClose(); }}>
    <section className="profile-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title" ref={dialogRef}>
      <header className="profile-edit-header"><div><small>Account settings</small><h2 id="profile-edit-title">Edit profile</h2></div><button className="profile-edit-close" type="button" aria-label="Close profile editor" disabled={closeDisabled} onClick={onClose}>×</button></header>
      <form onSubmit={saveProfile} noValidate>
        <h3>Profile details</h3>
        <label className="profile-edit-field">Username<input ref={usernameRef} value={username} maxLength={24} autoComplete="username" aria-invalid={Boolean(usernameError)} aria-describedby="profile-username-error" onChange={(event) => { setUsername(event.target.value); setUsernameError(""); }} /><small id="profile-username-error" className="profile-edit-error">{usernameError}</small></label>
        <label className="profile-edit-field">Bio<textarea value={bio} rows={3} maxLength={250} aria-invalid={Boolean(bioError)} aria-describedby="profile-bio-counter profile-bio-error" onChange={(event) => { setBio(event.target.value); setBioError(""); }} /><span id="profile-bio-counter" className="profile-edit-counter">{bio.length}/250</span><small id="profile-bio-error" className="profile-edit-error">{bioError}</small></label>
        {profileError && <p className="profile-edit-error" role="alert">{profileError}</p>}
        <div className="profile-edit-actions"><button className="btn o" type="button" disabled={closeDisabled} onClick={onClose}>Cancel</button><button className="btn p" type="submit" disabled={profileBusy}>{profileBusy ? "Saving…" : "Save Changes"}</button></div>
      </form>
      <form className="profile-password-form" onSubmit={savePassword} noValidate>
        <h3>Change password</h3>
        <label className="profile-edit-field">Current password<input type="password" autoComplete="current-password" required value={currentPassword} aria-invalid={Boolean(passwordFieldErrors.current)} aria-describedby="profile-current-password-error" onChange={(event) => { setCurrentPassword(event.target.value); setPasswordFieldErrors((current) => ({ ...current, current: "" })); }} /><small className="profile-edit-error" id="profile-current-password-error">{passwordFieldErrors.current}</small></label>
        <label className="profile-edit-field">New password<input type="password" autoComplete="new-password" required minLength={8} value={newPassword} aria-invalid={Boolean(passwordFieldErrors.next)} aria-describedby="profile-password-hint profile-new-password-error" onChange={(event) => { setNewPassword(event.target.value); setPasswordFieldErrors((current) => ({ ...current, next: "", confirmation: "" })); }} /><small id="profile-password-hint">At least 8 characters, including uppercase, lowercase, and a number.</small><small className="profile-edit-error" id="profile-new-password-error">{passwordFieldErrors.next}</small></label>
        <label className="profile-edit-field">Confirm new password<input type="password" autoComplete="new-password" required minLength={8} value={confirmation} aria-invalid={Boolean(passwordFieldErrors.confirmation)} aria-describedby="profile-confirm-password-error" onChange={(event) => { setConfirmation(event.target.value); setPasswordFieldErrors((current) => ({ ...current, confirmation: "" })); }} /><small className="profile-edit-error" id="profile-confirm-password-error">{passwordFieldErrors.confirmation}</small></label>
        {passwordError && <p className="profile-edit-error" role="alert">{passwordError}</p>}
        {passwordSuccess && <p className="profile-edit-success" role="status">{passwordSuccess}</p>}
        <div className="profile-edit-actions"><button className="btn p" type="submit" disabled={passwordBusy}>{passwordBusy ? "Updating…" : "Update Password"}</button></div>
      </form>
    </section>
  </div>;
}
