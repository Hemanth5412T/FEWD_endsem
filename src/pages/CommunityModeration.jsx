import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  listCommunityModerationHistory,
  listCommunityReports,
  resolveCommunityReport,
  subscribeToCommunity,
} from "../data/communityStore.js";

const statusNames = {
  pending: "Pending review",
  reviewed: "Reviewed",
  dismissed: "Dismissed",
  removed: "Post removed",
};

export default function CommunityModeration() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [history, setHistory] = useState([]);
  const [view, setView] = useState("reports");
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setError("");
    try {
      const [nextReports, nextHistory] = await Promise.all([
        listCommunityReports(user.id),
        listCommunityModerationHistory(user.id),
      ]);
      setReports(nextReports);
      setHistory(nextHistory);
    } catch (loadError) {
      setError(loadError.message || "Community moderation data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => subscribeToCommunity(refresh), [refresh]);

  async function moderate(report, action) {
    setBusyId(report.reportId);
    setError("");
    setNotice("");
    try {
      await resolveCommunityReport(user.id, report.reportId, action, notes[report.reportId] || "");
      setNotice(action === "remove" ? "Post removed and moderation action recorded." : action === "dismiss" ? "Report dismissed and recorded." : "Report marked as reviewed.");
      await refresh();
    } catch (moderationError) {
      setError(moderationError.message || "The report could not be resolved.");
    } finally {
      setBusyId("");
    }
  }

  return <section className="community-moderation">
    <div className="community-moderation-heading">
      <div><h2>Community Moderation</h2><p>Review reports and keep a local record of moderation decisions.</p></div>
      <div className="community-moderation-tabs" role="tablist" aria-label="Community moderation views">
        <button type="button" className={view === "reports" ? "active" : ""} role="tab" aria-selected={view === "reports"} onClick={() => setView("reports")}>Reports ({reports.filter((report) => report.status === "pending").length} pending)</button>
        <button type="button" className={view === "history" ? "active" : ""} role="tab" aria-selected={view === "history"} onClick={() => setView("history")}>Moderation history</button>
      </div>
    </div>
    <p className="community-local-note">Reports, posts, and moderation records are stored in this browser only; they are not shared across devices.</p>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {loading ? (
      <p className="card pad">Loading community moderation…</p>
    ) : view === "reports" ? (
      reports.length ? (
        <div className="community-report-list">{reports.map((report) => <article className="card pad community-report-card" key={report.reportId}>
          <div className="community-report-header">
            <div><span className={`community-report-status status-${report.status}`}>{statusNames[report.status] || report.status}</span><time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString()}</time></div>
            <span>Post by @{report.postSnapshot?.authorUsername || "unknown"}</span>
          </div>
          <p className="community-report-reason"><b>Report reason:</b> {report.reason}</p>
          <blockquote>{report.postSnapshot?.content || "Post content is no longer available."}</blockquote>
          {report.reviewedAt && <p className="community-report-review">Reviewed by account {report.reviewedBy} · {new Date(report.reviewedAt).toLocaleString()}</p>}
          {!["dismissed", "removed"].includes(report.status) && <div className="community-report-controls">
            <label>Moderator note (optional)
              <textarea rows="2" maxLength="500" value={notes[report.reportId] || ""} onChange={(event) => setNotes((current) => ({ ...current, [report.reportId]: event.target.value }))} disabled={busyId === report.reportId} />
            </label>
            <div className="community-modal-actions">
              {report.status === "pending" && <button className="btn o sm" type="button" disabled={busyId === report.reportId} onClick={() => moderate(report, "review")}>Mark reviewed</button>}
              <button className="btn o sm" type="button" disabled={busyId === report.reportId} onClick={() => moderate(report, "dismiss")}>Dismiss report</button>
              <button className="btn p sm" type="button" disabled={busyId === report.reportId} onClick={() => moderate(report, "remove")}>{busyId === report.reportId ? "Saving…" : "Remove post"}</button>
            </div>
          </div>}
        </article>)}</div>
      ) : <p className="card pad">No community reports have been filed.</p>
    ) : history.length ? (
      <div className="community-report-list">{history.map((entry) => <article className="card pad community-history-card" key={entry.moderationId}>
        <div className="community-report-header"><b>{entry.action === "remove" ? "Post removed" : entry.action === "dismiss" ? "Report dismissed" : "Report reviewed"}</b><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></div>
        <p>{entry.reason}</p>
        <small>{entry.actorUsername} ({entry.actorRole}) · Report {entry.reportId}</small>
      </article>)}</div>
    ) : <p className="card pad">No moderation actions have been recorded.</p>}
  </section>;
}
