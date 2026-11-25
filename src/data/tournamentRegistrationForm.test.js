import assert from "node:assert/strict";
import test from "node:test";
import {
  getTournamentRosterRequirements,
  validateTournamentRegistrationDetails,
} from "./tournamentRegistrationForm.js";

test("roster requirements follow solo, duo, squad, and mandatory substitute rules", () => {
  assert.equal(getTournamentRosterRequirements({ format: "Solo" }).totalPlayers, 1);
  assert.equal(getTournamentRosterRequirements({ format: "Duo" }).totalPlayers, 2);
  assert.equal(getTournamentRosterRequirements({
    participants: { label: "squads" },
    rules: ["Squads field four players."],
  }).totalPlayers, 4);
  assert.equal(getTournamentRosterRequirements({
    rules: ["Five starters and one registered substitute."],
  }).totalPlayers, 6);
  assert.equal(getTournamentRosterRequirements({
    rules: ["Five players + one substitute."],
  }).totalPlayers, 6);
  assert.equal(getTournamentRosterRequirements({
    rules: ["Four starters and may add one substitute."],
  }).totalPlayers, 4);
});

test("registration details are trimmed and valid country calling codes are accepted", () => {
  const { normalized, errors } = validateTournamentRegistrationDetails({ format: "Solo" }, {
    roster: [{ inGameName: "  Arena Player ", gameId: "  Player_42 " }],
    contactEmail: " player@example.com ",
    contactPhone: " +91 98765-43210 ",
    country: "India",
  });

  assert.deepEqual(errors, {});
  assert.deepEqual(normalized, {
    roster: [{ inGameName: "Arena Player", gameId: "Player_42" }],
    contactEmail: "player@example.com",
    contactPhone: "+91 98765-43210",
    country: "India",
  });
});

test("all invalid fields and duplicate roster IDs are reported together", () => {
  const { errors } = validateTournamentRegistrationDetails({ format: "Duo" }, {
    roster: [
      { inGameName: "", gameId: "Same_ID" },
      { inGameName: "x", gameId: "same_id" },
    ],
    contactEmail: "not-an-email",
    contactPhone: "+1 555 123 4567",
    country: "India",
  });

  assert.equal(errors["roster.0.inGameName"], "Please enter your in-game name.");
  assert.equal(errors["roster.0.gameId"], "Duplicate player IDs are not allowed.");
  assert.equal(errors["roster.1.inGameName"], "In-game name must be 2-32 characters.");
  assert.equal(errors["roster.1.gameId"], "Duplicate player IDs are not allowed.");
  assert.equal(errors.contactEmail, "Enter a valid email address.");
  assert.equal(errors.contactPhone, "Phone number must include a valid country code.");
  assert.equal(errors.country, undefined);
});

test("empty submissions and missing required teammates report every applicable field", () => {
  const { errors } = validateTournamentRegistrationDetails({ format: "Duo" }, {
    roster: [{ inGameName: "Arena Player", gameId: "Player_42" }, { inGameName: "", gameId: "" }],
    contactEmail: "",
    contactPhone: "",
    country: "",
  });

  assert.equal(errors["roster.1.inGameName"], "Please provide details for all required teammates.");
  assert.equal(errors["roster.1.gameId"], "Please provide details for all required teammates.");
  assert.equal(errors.contactEmail, "Enter a valid email address.");
  assert.equal(errors.contactPhone, "Phone number must include a valid country code.");
  assert.equal(errors.country, "Please select your country/region.");
});
