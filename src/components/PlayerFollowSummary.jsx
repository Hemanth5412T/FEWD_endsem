import { useCallback, useEffect, useState } from "react";
import { Link } from "./TransitionLink.jsx";
import { getPlayerFollowSummary, listPlayerFollowProfiles, togglePlayerFollow } from "../data/accountStore.js";

function Avatar({ name }) {
  const initials = String(name || "Player").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
  return <span className="community-avatar community-avatar-small" aria-hidden="true">{initials}</span>;
}

function FollowAction({ profileId, viewer, isFollowing, disabled = false, onChange, onError }) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const canFollow = Boolean(viewer?.id && viewer.status === "active" && viewer.id !== profileId && !disabled);

  async function changeFollow() {
    if (!canFollow || busy) return;
    setBusy(true);
    setMenuOpen(false);
    try {
      const nextState = await togglePlayerFollow(viewer.id, profileId);
      window.dispatchEvent(new CustomEvent("gamearena:follow-updated", {
        detail: { followerId: viewer.id, followingId: profileId },
      }));
      onChange?.(nextState);
    } catch (error) {
      onError?.(error.message || "The follow change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!viewer?.id) return <Link className="btn o player-follow-login" to="/login">Log in to follow</Link>;
  if (viewer.id === profileId || disabled) return null;
  if (viewer.status !== "active") {
    return <button className="btn o player-follow-button" type="button" disabled title="An active account is required to manage follows.">{isFollowing ? "Following" : "Follow"}</button>;
  }
  return <span className="player-follow-action">
    {isFollowing
      ? <button className="btn o player-follow-button" type="button" disabled={busy} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{busy ? "Saving…" : "Following"} <span aria-hidden="true">⌄</span></button>
      : <button className="btn p player-follow-button" type="button" disabled={busy} onClick={changeFollow}>{busy ? "Saving…" : "Follow"}</button>}
    {menuOpen && <span className="player-follow-menu" role="menu">
      <button type="button" role="menuitem" disabled={busy} onClick={changeFollow}>Unfollow</button>
    </span>}
  </span>;
}

export default function PlayerFollowSummary({ profileId, viewer, isDemo = false }) {
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState("");
  const [modal, setModal] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  const refreshSummary = useCallback(async () => {
    if (!profileId) return;
    try {
      const next = await getPlayerFollowSummary(profileId, viewer?.id || null);
      setSummary(next);
      setSummaryError("");
    } catch (error) {
      setSummaryError(error.message || "Follow counts could not be loaded.");
    }
  }, [profileId, viewer?.id]);

  const loadProfiles = useCallback(async (direction) => {
    setListLoading(true);
    setListError("");
    try {
      const result = await listPlayerFollowProfiles(profileId, direction, viewer?.id || null);
      setProfiles(result);
    } catch (error) {
      setListError(error.message || "The player list could not be loaded.");
    } finally {
      setListLoading(false);
    }
  }, [profileId, viewer?.id]);

  useEffect(() => { refreshSummary(); }, [refreshSummary]);
  useEffect(() => {
    const handleFollowChange = (event) => {
      const change = event.detail;
      if (change?.followerId === viewer?.id || change?.followingId === profileId) refreshSummary();
      if (modal) loadProfiles(modal);
    };
    window.addEventListener("gamearena:follow-updated", handleFollowChange);
    return () => window.removeEventListener("gamearena:follow-updated", handleFollowChange);
  }, [loadProfiles, modal, profileId, refreshSummary, viewer?.id]);
  useEffect(() => {
    if (!modal) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setModal(""); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [modal]);

  function openList(direction) {
    setProfiles([]);
    setModal(direction);
    loadProfiles(direction);
  }

  function updateListFollow(profileUserId, isFollowing) {
    setProfiles((current) => current.map((profile) => profile.userId === profileUserId ? { ...profile, isFollowing } : profile));
  }

  return <>
    <div className="player-follow-summary" aria-label="Player follows">
      <button className="player-follow-count" type="button" onClick={() => openList("followers")} aria-label={`${summary?.followers ?? "Loading"} followers`}>
        <b>{summary?.followers ?? "…"}</b> Followers
      </button>
      <button className="player-follow-count" type="button" onClick={() => openList("following")} aria-label={`${summary?.following ?? "Loading"} following`}>
        <b>{summary?.following ?? "…"}</b> Following
      </button>
      {!isDemo && <FollowAction
        profileId={profileId}
        viewer={viewer}
        isFollowing={Boolean(summary?.isFollowing)}
        disabled={!summary}
        onChange={(isFollowing) => setSummary((current) => current && ({
          ...current,
          followers: Math.max(0, current.followers + (isFollowing ? 1 : -1)),
          isFollowing,
        }))}
        onError={setSummaryError}
      />}
    </div>
    {summaryError && <p className="player-follow-error" role="alert">{summaryError}</p>}
    {modal && <div className="player-follow-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(""); }}>
      <section className="player-follow-dialog" role="dialog" aria-modal="true" aria-labelledby="player-follow-title">
        <header className="player-follow-dialog-header">
          <h2 id="player-follow-title">{modal === "followers" ? "Followers" : "Following"}</h2>
          <button type="button" className="player-follow-close" aria-label="Close list" onClick={() => setModal("")}>×</button>
        </header>
        {listError && <p className="player-follow-error" role="alert">{listError}</p>}
        {listError ? null : listLoading
          ? <p className="player-follow-empty" role="status">Loading players…</p>
          : profiles.length
            ? <ul className="player-follow-list">{profiles.map((profile) => <li key={profile.userId}>
              <Link className="player-follow-person" to={`/player/${encodeURIComponent(profile.userId)}`} onClick={() => setModal("")}>
                <Avatar name={profile.displayName} />
                <span><b>{profile.displayName}</b><small>@{profile.username}</small></span>
              </Link>
              {viewer?.id !== profile.userId && <FollowAction
                profileId={profile.userId}
                viewer={viewer}
                isFollowing={profile.isFollowing}
                onChange={(isFollowing) => updateListFollow(profile.userId, isFollowing)}
                onError={setListError}
              />}
            </li>)}</ul>
            : <p className="player-follow-empty">No {modal} yet.</p>}
      </section>
    </div>}
  </>;
}
