import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Link } from "../components/TransitionLink.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import {
  COMMUNITY_MAX_COMMENT_LENGTH,
  COMMUNITY_MAX_IMAGE_BYTES,
  COMMUNITY_MAX_POST_LENGTH,
  COMMUNITY_PAGE_SIZE,
  createCommunityComment,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  getPublicCommunityProfile,
  initializeCommunity,
  listCommunityComments,
  listCommunityPosts,
  reportCommunityPost,
  subscribeToCommunity,
  syncCommunityActivity,
  toggleCommunityReaction,
  updateCommunityComment,
  updateCommunityPost,
} from "../data/communityStore.js";

const filters = [
  ["all", "All Posts"],
  ["achievements", "Achievements"],
  ["matches", "Match Updates"],
  ["mine", "My Posts"],
];
const categoryNames = {
  general: "General",
  achievement: "Achievement",
  "match-update": "Match update",
  "tournament-update": "Tournament update",
};
const reportReasons = ["Spam", "Harassment", "Hate or harmful content", "False or misleading content", "Other"];

function initials(value) {
  return String(value || "Player").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const difference = Date.now() - date.getTime();
  if (difference < 60_000) return "Just now";
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)}m ago`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function Avatar({ name, className = "" }) {
  return <span className={`community-avatar ${className}`} aria-hidden="true">{initials(name)}</span>;
}

export default function CommunityRoute() {
  const { userId } = useParams();
  return <CommunityFeed profileId={userId || null} />;
}

function CommunityFeed({ profileId }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");
  const [posts, setPosts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [composer, setComposer] = useState(null);
  const [reportingPost, setReportingPost] = useState(null);
  const [reportReason, setReportReason] = useState(reportReasons[0]);
  const [reportDetails, setReportDetails] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const currentFilter = profileId ? "author" : filter;
  const loadRequest = useRef(0);

  const loadFirstPage = useCallback(async (showLoading = false) => {
    const requestId = ++loadRequest.current;
    if (showLoading) setLoading(true);
    setLoadError("");
    try {
      await initializeCommunity();
      if (user?.id) await syncCommunityActivity(user.id);
      const nextProfile = profileId ? await getPublicCommunityProfile(profileId) : null;
      const result = await listCommunityPosts({
        filter: currentFilter,
        userId: user?.id || null,
        authorId: profileId,
        limit: COMMUNITY_PAGE_SIZE,
      });
      if (requestId !== loadRequest.current) return;
      setProfile(nextProfile);
      setPosts(result.posts);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } catch (error) {
      if (requestId === loadRequest.current) setLoadError(error.message || "The community feed could not be loaded.");
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [currentFilter, profileId, user?.id]);

  useEffect(() => { loadFirstPage(true); }, [loadFirstPage]);
  useEffect(() => subscribeToCommunity(() => { loadFirstPage(); }), [loadFirstPage]);

  const canParticipate = Boolean(user && user.status === "active");
  const profilePosts = posts;

  async function loadMore() {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError("");
    try {
      const result = await listCommunityPosts({
        filter: currentFilter,
        userId: user?.id || null,
        authorId: profileId,
        cursor: nextCursor,
        limit: COMMUNITY_PAGE_SIZE,
      });
      setPosts((current) => {
        const byId = new Map(current.map((post) => [post.postId, post]));
        result.posts.forEach((post) => byId.set(post.postId, post));
        return [...byId.values()];
      });
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } catch (error) {
      setLoadError(error.message || "More posts could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }

  function startCreatePost(preset = null) {
    if (!user) {
      setNotice("Log in to share with the community.");
      return;
    }
    if (!canParticipate) {
      setNotice("Your account is restricted from posting or interacting in the community.");
      return;
    }
    setNotice("");
    setComposer({ mode: "create", preset });
  }

  async function savePost(fields) {
    if (!user) throw new Error("Log in to publish a community post.");
    if (composer?.mode === "edit" && composer.post) {
      await updateCommunityPost(user.id, composer.post.postId, fields);
      setNotice("Your post was updated.");
    } else {
      await createCommunityPost(user.id, { ...fields, relatedTournamentId: composer?.preset?.relatedTournamentId });
      setNotice("Your post is live in the community.");
    }
    setComposer(null);
    await loadFirstPage();
  }

  async function handleLike(post) {
    if (!user) {
      setNotice("Log in to react to community posts.");
      return;
    }
    if (!canParticipate) {
      setNotice("Your account is restricted from community interactions.");
      return;
    }
    setActionBusy(post.postId);
    setNotice("");
    try {
      await toggleCommunityReaction(user.id, post.postId);
      await loadFirstPage();
    } catch (error) {
      setNotice(error.message || "Your reaction could not be saved.");
    } finally {
      setActionBusy("");
    }
  }

  async function handleDeletePost(post) {
    if (!user || !window.confirm("Delete this post? It will no longer appear in the community feed.")) return;
    setActionBusy(post.postId);
    setNotice("");
    try {
      await deleteCommunityPost(user.id, post.postId);
      setNotice("Your post was deleted.");
      await loadFirstPage();
    } catch (error) {
      setNotice(error.message || "This post could not be deleted.");
    } finally {
      setActionBusy("");
    }
  }

  async function sharePost(post) {
    const url = `${window.location.origin}/community#${encodeURIComponent(post.postId)}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this browser.");
      await navigator.clipboard.writeText(url);
      setNotice("Post link copied.");
    } catch (error) {
      setNotice(error.message || "The post link could not be copied.");
    }
  }

  function shareActivity(post) {
    if (!user) {
      setNotice("Log in to share an activity.");
      return;
    }
    startCreatePost({
      content: post.content,
      category: post.category,
      game: post.game || "",
      relatedTournamentId: post.relatedTournamentId,
    });
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!user || !reportingPost) return;
    setReportBusy(true);
    setReportError("");
    try {
      const reason = `${reportReason}${reportDetails.trim() ? `: ${reportDetails.trim()}` : ""}`;
      await reportCommunityPost(user.id, reportingPost.postId, reason);
      setReportingPost(null);
      setReportDetails("");
      setNotice("Thanks. Your report was sent to the moderation team.");
    } catch (error) {
      setReportError(error.message || "The report could not be submitted.");
    } finally {
      setReportBusy(false);
    }
  }

  if (profileId && !loading && !profile) {
    return <main className="community-page"><div className="w"><section className="community-empty card pad">
      <h1>Player not found</h1>
      <p>This community profile is unavailable.</p>
      <Link className="btn p" to="/community">Back to Community</Link>
    </section></div></main>;
  }

  return <main className="community-page">
    <div className="w">
      {!profileId && <div className="community-feed-heading community-feed-toolbar">
        <h2>{filters.find(([value]) => value === filter)?.[1] || "All Posts"}</h2>
        <span>{filter === "mine" && !user ? "Log in to view your posts" : "Newest first"}</span>
        <button className="btn p community-create-button" type="button" onClick={() => startCreatePost()}>＋ Create Post</button>
      </div>}

      <header className={`community-hero${profileId ? " community-profile-hero" : ""}`}>
        <div className="community-hero-copy">
          <p className="eyebrow">{profileId ? profile?.isDemo ? "DEMO PLAYER PROFILE" : "PLAYER PROFILE" : "GAME ARENA · PLAYER NETWORK"}</p>
          {profileId
            ? <><h1>{profile?.displayName || "Loading profile…"}</h1>{profile?.username && <p className="community-profile-handle">@{profile.username}</p>}
              {profile?.bio && <p className="community-subtitle">{profile.bio}</p>}
              {profile?.isDemo && <span className="community-demo-label">Seeded demo profile · illustrative content</span>}
              <Link className="community-back-link" to="/community">← Back to community</Link></>
            : <><h1>THE ARENA<br />COMMUNITY</h1><p className="community-subtitle">Your victories. Your moments. Your community.</p></>}
        </div>
        <div className="community-hero-side">
          {profileId
            ? profile && <Avatar name={profile.displayName} className="community-profile-avatar" />
            : <>{user
              ? <Link to="/profile" className="community-current-player"><Avatar name={user.username} /><span><b>{user.username}</b><small>Your profile</small></span></Link>
              : <Link to="/login" className="community-current-player"><Avatar name="Player" /><span><b>Guest player</b><small>Log in to join in</small></span></Link>}</>}
        </div>
      </header>

      {!profileId && <nav className="community-filters" aria-label="Community feed filters">
        {filters.map(([value, label]) => <button
          key={value}
          type="button"
          className={filter === value ? "active" : ""}
          aria-pressed={filter === value}
          onClick={() => { setFilter(value); setNotice(""); }}
        >{label}</button>)}
      </nav>}

      {!profileId && <p className="community-local-note">Local prototype: posts, reactions, and comments are saved in this browser's IndexedDB and do not sync to other devices.</p>}
      {notice && <p className="community-notice" role="status">{notice}</p>}
      {loadError && <p className="community-error" role="alert">{loadError}</p>}

      {loading
        ? <p className="community-empty card pad" role="status">Loading the arena feed…</p>
        : <section className="community-feed" aria-label={profileId ? "Player posts" : "Community posts"}>
          {profileId && profile && <div className="community-profile-meta">
            {profile.game && <span className="community-game-tag">{profile.game}</span>}
            {!profile.isDemo && profile.createdAt && <span>Joined {new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(new Date(profile.createdAt))}</span>}
          </div>}
          {profilePosts.length
            ? profilePosts.map((post) => <CommunityPostCard
              key={post.postId}
              post={post}
              user={user}
              busy={actionBusy === post.postId}
              canParticipate={canParticipate}
              onLike={() => handleLike(post)}
              onEdit={() => setComposer({ mode: "edit", post })}
              onDelete={() => handleDeletePost(post)}
              onShare={() => sharePost(post)}
              onShareActivity={() => shareActivity(post)}
              onReport={() => { setReportingPost(post); setReportReason(reportReasons[0]); setReportDetails(""); setReportError(""); }}
              onChanged={loadFirstPage}
              onNotice={setNotice}
            />)
            : <div className="community-empty card pad">
              <span className="community-empty-icon" aria-hidden="true">✦</span>
              <h2>{profileId ? "No posts yet" : filter === "mine" ? "Your arena is waiting" : "No posts in the arena yet"}</h2>
              <p>{profileId ? "This player has not shared a post yet." : filter === "mine" ? "Share a moment to start your community profile." : "Be the first to share your moment!"}</p>
              {!profileId && filter === "mine" && <button className="btn p" type="button" onClick={() => startCreatePost()}>Create your first post</button>}
              {!profileId && filter === "mine" && !user && <Link className="btn p" to="/login">Log in</Link>}
            </div>}
          {hasMore && <div className="community-load-more"><button className="btn o" type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more posts"}</button></div>}
        </section>}
    </div>

    {composer && <PostComposer
      mode={composer.mode}
      post={composer.post}
      preset={composer.preset}
      onClose={() => setComposer(null)}
      onSubmit={savePost}
    />}
    {reportingPost && <div className="community-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !reportBusy) setReportingPost(null); }}>
      <form className="community-modal card" role="dialog" aria-modal="true" aria-labelledby="community-report-title" onSubmit={submitReport}>
        <button className="community-modal-close" type="button" onClick={() => setReportingPost(null)} aria-label="Close report dialog" disabled={reportBusy}>×</button>
        <p className="eyebrow">KEEP THE ARENA RESPECTFUL</p>
        <h2 id="community-report-title">Report post</h2>
        <p className="community-modal-copy">Reports are stored locally and reviewed by this browser's administrators.</p>
        <label>Reason
          <select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>{reportReasons.map((reason) => <option key={reason}>{reason}</option>)}</select>
        </label>
        <label>Additional details (optional)
          <textarea maxLength="220" rows="3" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} />
        </label>
        {reportError && <p className="community-error" role="alert">{reportError}</p>}
        <div className="community-modal-actions"><button className="btn o" type="button" disabled={reportBusy} onClick={() => setReportingPost(null)}>Cancel</button><button className="btn p" type="submit" disabled={reportBusy}>{reportBusy ? "Sending…" : "Submit report"}</button></div>
      </form>
    </div>}
  </main>;
}

function CommunityPostCard({ post, user, busy, canParticipate, onLike, onEdit, onDelete, onShare, onShareActivity, onReport, onChanged, onNotice }) {
  const ownPost = Boolean(user?.id && post.authorId === user.id && post.postType !== "demo");
  const canReport = Boolean(user?.id && canParticipate && !ownPost);
  return <article className="community-post card" id={post.postId} data-community-post={post.postId}>
    <header className="community-post-header">
      <Link className="community-author" to={`/community/profile/${encodeURIComponent(post.authorId)}`}>
        <Avatar name={post.authorDisplayName || post.authorUsername} />
        <span className="community-author-copy">
          <span><b>{post.authorDisplayName || post.authorUsername}</b>{post.isDemo && <em className="community-demo-label">DEMO ACCOUNT</em>}</span>
          <span className="community-author-meta">@{post.authorUsername} · <time dateTime={post.createdAt}>{formatTime(post.createdAt)}</time></span>
        </span>
      </Link>
      <div className="community-post-tags">
        <span className={`community-category community-category-${post.category}`}>{categoryNames[post.category] || "Community"}</span>
        {post.game && <span className="community-game-tag">{post.game}</span>}
      </div>
    </header>
    <div className="community-post-content">
      <p>{post.content}</p>
      {post.media?.dataUrl && <img className="community-post-image" src={post.media.dataUrl} alt={post.media.name || "Image shared by a community player"} loading="lazy" />}
      {post.activityDetails && <p className="community-activity-detail">{post.activityDetails}</p>}
      {post.relatedTournamentId && <Link className="community-related-link" to={`/tournament/${encodeURIComponent(post.relatedTournamentId)}`}>View tournament details →</Link>}
      {post.relatedUrl && !post.relatedTournamentId && <Link className="community-related-link" to={post.relatedUrl}>View player achievement →</Link>}
    </div>
    <div className="community-post-actions">
      <button className={`community-action${post.likedByUser ? " is-liked" : ""}`} type="button" aria-pressed={Boolean(post.likedByUser)} disabled={busy || (user && !canParticipate)} onClick={onLike} title={!user ? "Log in to react" : undefined}>
        <span aria-hidden="true">{post.likedByUser ? "♥" : "♡"}</span> {post.likes || 0}
      </button>
      <button className="community-action community-share-action" type="button" onClick={onShare}><span aria-hidden="true">↗</span> Share</button>
      {post.postType === "activity" && ownPost && <button className="community-action" type="button" onClick={onShareActivity}>Share update</button>}
      {ownPost && <div className="community-own-actions">
        {post.postType === "user" && <button className="community-action" type="button" onClick={onEdit}>Edit</button>}
        <button className="community-action community-danger-action" type="button" disabled={busy} onClick={onDelete}>Delete</button>
      </div>}
      {canReport && <button className="community-action community-report-action" type="button" onClick={onReport}>Report</button>}
    </div>
    <CommunityComments post={post} user={user} canParticipate={canParticipate} onChanged={onChanged} onNotice={onNotice} />
  </article>;
}

function CommunityComments({ post, user, canParticipate, onChanged, onNotice }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setLoading(true);
    setError("");
    try {
      setComments(await listCommunityComments(post.postId));
    } catch (loadError) {
      setError(loadError.message || "Comments could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!user) {
      onNotice("Log in to comment on community posts.");
      return;
    }
    if (!canParticipate) {
      setError("Your account is restricted from community interactions.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const comment = await createCommunityComment(user.id, post.postId, content);
      setComments((current) => current.some((existing) => existing.commentId === comment.commentId)
        ? current
        : [...current, comment]);
      setContent("");
      await onChanged();
    } catch (submitError) {
      setError(submitError.message || "Your comment could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function saveComment(commentId) {
    setBusy(true);
    setError("");
    try {
      const updated = await updateCommunityComment(user.id, commentId, editContent);
      setComments((current) => current.map((comment) => comment.commentId === commentId ? updated : comment));
      setEditing(null);
      await onChanged();
    } catch (saveError) {
      setError(saveError.message || "Your comment could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(commentId) {
    if (!window.confirm("Remove this comment?")) return;
    setBusy(true);
    setError("");
    try {
      await deleteCommunityComment(user.id, commentId);
      setComments((current) => current.filter((comment) => comment.commentId !== commentId));
      await onChanged();
    } catch (removeError) {
      setError(removeError.message || "This comment could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="community-comments">
    <button className="community-comments-toggle" type="button" aria-expanded={open} onClick={toggleOpen}>
      <span aria-hidden="true">▤</span> {open ? "Hide comments" : `View comments (${post.comments || 0})`} <span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    {open && <div className="community-comments-panel">
      {loading ? <p className="community-comments-empty">Loading comments…</p>
        : comments.length ? <div className="community-comment-list">
          {comments.map((comment) => {
            const ownComment = comment.authorId === user?.id;
            const canRemove = ownComment || post.authorId === user?.id;
            return <article className="community-comment" key={comment.commentId}>
              <Link to={`/community/profile/${encodeURIComponent(comment.authorId)}`}><Avatar name={comment.authorDisplayName || comment.authorUsername} className="community-avatar-small" /></Link>
              <div className="community-comment-main">
                <div className="community-comment-byline"><Link to={`/community/profile/${encodeURIComponent(comment.authorId)}`}><b>{comment.authorDisplayName || comment.authorUsername}</b></Link><time dateTime={comment.createdAt}>{formatTime(comment.createdAt)}</time>{comment.updatedAt !== comment.createdAt && <span>Edited</span>}</div>
                {editing === comment.commentId
                  ? <><textarea className="community-comment-input" maxLength={COMMUNITY_MAX_COMMENT_LENGTH} value={editContent} onChange={(event) => setEditContent(event.target.value)} /><div className="community-comment-tools"><button type="button" disabled={busy} onClick={() => saveComment(comment.commentId)}>Save</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div></>
                  : <p>{comment.content}</p>}
                <div className="community-comment-tools">
                  {ownComment && editing !== comment.commentId && <button type="button" disabled={!canParticipate || busy} onClick={() => { setEditing(comment.commentId); setEditContent(comment.content); }}>Edit</button>}
                  {canRemove && editing !== comment.commentId && <button type="button" disabled={!canParticipate || busy} onClick={() => removeComment(comment.commentId)}>Remove</button>}
                </div>
              </div>
            </article>;
          })}
        </div> : <p className="community-comments-empty">No comments yet. Start the conversation.</p>}
      {user
        ? <form className="community-comment-form" onSubmit={submitComment}>
          <Avatar name={user.username} className="community-avatar-small" />
          <label className="community-sr-only" htmlFor={`comment-${post.postId}`}>Write a comment</label>
          <textarea id={`comment-${post.postId}`} maxLength={COMMUNITY_MAX_COMMENT_LENGTH} placeholder="Add a thoughtful comment…" value={content} onChange={(event) => setContent(event.target.value)} disabled={!canParticipate || busy} />
          <button className="btn p sm" type="submit" disabled={!canParticipate || busy || !content.trim()}>{busy ? "Sending…" : "Comment"}</button>
        </form>
        : <p className="community-comments-login"><Link to="/login">Log in</Link> to join the conversation.</p>}
      {error && <p className="community-error" role="alert">{error}</p>}
    </div>}
  </div>;
}

function PostComposer({ mode, post, preset, onClose, onSubmit }) {
  const [content, setContent] = useState(post?.content || preset?.content || "");
  const [category, setCategory] = useState(post?.category || preset?.category || "general");
  const [game, setGame] = useState(post?.game || preset?.game || "");
  const [media, setMedia] = useState(post?.media || null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, onClose]);

  async function chooseImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setError("Choose a PNG, JPG, WEBP, or GIF image.");
      return;
    }
    if (file.size > COMMUNITY_MAX_IMAGE_BYTES) {
      setError("Images must be 2 MB or smaller.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => setMedia({ mimeType: file.type, dataUrl: String(reader.result), name: file.name });
    reader.onerror = () => setError("The selected image could not be read.");
    reader.readAsDataURL(file);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit({ content, category, game, media });
    } catch (submitError) {
      setError(submitError.message || "The post could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="community-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="community-modal community-composer card" role="dialog" aria-modal="true" aria-labelledby="community-composer-title" onSubmit={submit}>
      <button className="community-modal-close" type="button" onClick={onClose} aria-label="Close post composer" disabled={busy}>×</button>
      <p className="eyebrow">MAKE YOUR MARK</p>
      <h2 id="community-composer-title">{mode === "edit" ? "Edit your post" : "Create a post"}</h2>
      <p className="community-modal-copy">Share a moment, a milestone, or a thought with the arena.</p>
      <label>Post category
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="general">General</option>
          <option value="achievement">Achievement</option>
          <option value="match-update">Match Update</option>
          <option value="tournament-update">Tournament Update</option>
        </select>
      </label>
      <label>Game (optional)
        <select value={game} onChange={(event) => setGame(event.target.value)}>
          <option value="">No game selected</option>
          <option value="Valorant">Valorant</option>
          <option value="BGMI">BGMI</option>
          <option value="Counter-Strike 2">Counter-Strike 2</option>
          <option value="Other">Other</option>
        </select>
      </label>
      <label>What's happening?
        <textarea autoFocus maxLength={COMMUNITY_MAX_POST_LENGTH} rows="5" placeholder="Share your moment with the arena…" value={content} onChange={(event) => setContent(event.target.value)} />
      </label>
      <div className="community-composer-count">{content.length}/{COMMUNITY_MAX_POST_LENGTH}</div>
      <label className="community-image-picker">Add an image
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={chooseImage} />
        <small>PNG, JPG, WEBP, or GIF · up to 2 MB</small>
      </label>
      {media && <div className="community-image-preview">
        <img src={media.dataUrl} alt="Selected post preview" />
        <button type="button" className="community-action community-danger-action" onClick={() => setMedia(null)} disabled={busy}>Remove image</button>
      </div>}
      <div className="community-post-preview">
        <span className="community-preview-label">PREVIEW</span>
        <div className="community-preview-content">
          <span className={`community-category community-category-${category}`}>{categoryNames[category]}</span>
          {game && <span className="community-game-tag">{game}</span>}
          <p>{content.trim() || "Your post preview will appear here."}</p>
          {media?.dataUrl && <img src={media.dataUrl} alt="Post preview" />}
        </div>
      </div>
      {error && <p className="community-error" role="alert">{error}</p>}
      <div className="community-modal-actions"><button className="btn o" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="btn p" type="submit" disabled={busy}>{busy ? "Saving…" : mode === "edit" ? "Save changes" : "Publish post"}</button></div>
    </form>
  </div>;
}
