import assert from "node:assert/strict";
import test from "node:test";
import { findAccountByIdentifier, getPlayerStatistics, getTournamentsPlayed } from "./accountStore.js";

test("identifier lookup resolves the same account by username or email", () => {
  const account = { id: "player-a", username: "ShadowKira", email: "shadow@example.test" };
  const accounts = [account];

  assert.equal(findAccountByIdentifier(accounts, "  SHADOWKIRA "), account);
  assert.equal(findAccountByIdentifier(accounts, "SHADOW@example.test"), account);
});

test("identifier lookup rejects unknown or ambiguous matches", () => {
  const accounts = [
    { id: "player-a", username: "ShadowKira", email: "shadow@example.test" },
    { id: "player-b", username: "OtherPlayer", email: "shadowkira" },
  ];

  assert.equal(findAccountByIdentifier(accounts, "missing-player"), null);
  assert.equal(findAccountByIdentifier(accounts, "shadowkira"), null);
});

test("accounts without recorded match history have zero statistics", () => {
  assert.deepEqual(getPlayerStatistics({ matchesPlayed: 248, wins: 163, losses: 85 }), {
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
  });
});

test("statistics count only completed recorded results", () => {
  assert.deepEqual(getPlayerStatistics({
    matchHistory: [
      { status: "completed", result: "win" },
      { status: "COMPLETED", result: "loss" },
      { status: "completed", result: "draw" },
      { status: "pending", result: "win" },
      { status: "cancelled", result: "loss" },
      { status: "incomplete", result: "draw" },
      { status: "completed", result: "unknown" },
    ],
  }), {
    matchesPlayed: 3,
    wins: 1,
    losses: 1,
    draws: 1,
    winRate: 33.3,
  });
});

test("tournaments played require a completed user-owned result", () => {
  assert.equal(getTournamentsPlayed({
    id: "player-a",
    tournamentsPlayed: 18,
    tournamentHistory: [
      { userId: "player-a", tournamentId: "finished-one", status: "completed", result: "1st place" },
      { userId: "player-a", tournamentId: "finished-one", status: "completed", result: "1st place" },
      { userId: "player-a", tournamentId: "pending", status: "registered", result: "1st place" },
      { userId: "player-a", tournamentId: "no-result", status: "completed" },
      { userId: "player-b", tournamentId: "other-player", status: "completed", result: "Winner" },
    ],
  }), 1);
});
