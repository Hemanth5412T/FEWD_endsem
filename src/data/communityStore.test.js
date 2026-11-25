import assert from "node:assert/strict";
import test from "node:test";
import { buildCommunityActivityPosts } from "./communityStore.js";

test("community activity posts are generated only from qualifying account-owned events", () => {
  const account = {
    id: "player-a",
    username: "ArenaPlayer",
    matchHistory: [
      { id: "match-1", userId: "player-a", status: "completed", result: "win", completedAt: "2025-03-01T10:00:00.000Z" },
      { id: "match-pending", userId: "player-a", status: "pending", result: "win", createdAt: "2025-03-01T11:00:00.000Z" },
      { id: "match-other", userId: "player-b", status: "completed", result: "loss", completedAt: "2025-03-01T12:00:00.000Z" },
    ],
    tournamentHistory: [
      { id: "result-1", userId: "player-a", tournamentId: "cup-1", name: "Arena Cup", status: "completed", result: "1st place", completedAt: "2025-03-02T10:00:00.000Z" },
      { id: "registered-only", userId: "player-a", tournamentId: "cup-2", status: "registered", result: "registered", completedAt: "2025-03-02T11:00:00.000Z" },
    ],
    achievements: [
      { id: "achievement-1", userId: "player-a", name: "First Victory", unlockedAt: "2025-03-03T10:00:00.000Z" },
      { id: "achievement-other", userId: "player-b", name: "Other Player's award", unlockedAt: "2025-03-03T11:00:00.000Z" },
    ],
  };
  const registrations = [
    { id: "registration-1", userId: "player-a", tournamentId: "cup-3", name: "Spring Clash", game: "BGMI", registrationStatus: "Registered", registeredAt: "2025-03-04T10:00:00.000Z" },
    { id: "registration-cancelled", userId: "player-a", tournamentId: "cup-4", registrationStatus: "Cancelled", registeredAt: "2025-03-04T11:00:00.000Z" },
    { id: "registration-other", userId: "player-b", tournamentId: "cup-5", registrationStatus: "Registered", registeredAt: "2025-03-04T12:00:00.000Z" },
  ];

  const posts = buildCommunityActivityPosts(account, registrations);
  assert.deepEqual(posts.map((post) => post.activityType).sort(), [
    "achievement",
    "match",
    "tournament-registration",
    "tournament-result",
  ]);
  assert.equal(posts.some((post) => post.content.includes("registered-only")), false);
  assert.equal(posts.some((post) => post.content.includes("Other Player")), false);
  assert.equal(posts.find((post) => post.activityType === "tournament-registration").content, "ArenaPlayer registered for Spring Clash.");

  const duplicateSync = buildCommunityActivityPosts(account, registrations);
  assert.deepEqual(
    posts.map((post) => post.sourceEventId).sort(),
    duplicateSync.map((post) => post.sourceEventId).sort(),
  );
});

test("registration events do not fabricate tournament victories", () => {
  const posts = buildCommunityActivityPosts({ id: "player-a", username: "ArenaPlayer" }, [
    { id: "registration-1", userId: "player-a", tournamentId: "cup-1", name: "Spring Clash", registrationStatus: "Registered", registeredAt: "2025-03-04T10:00:00.000Z" },
  ]);

  assert.equal(posts.length, 1);
  assert.equal(posts[0].activityType, "tournament-registration");
  assert.match(posts[0].content, /registered for Spring Clash/);
});

test("accounts without recorded events produce no community activity", () => {
  assert.deepEqual(buildCommunityActivityPosts({ id: "player-a", username: "ArenaPlayer" }), []);
});
