const numberWords = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const quantityPattern = `(?:\\d{1,2}|${Object.keys(numberWords).join("|")})`;

export const registrationCountries = [
  { name: "Australia", callingCode: "+61" },
  { name: "Bangladesh", callingCode: "+880" },
  { name: "Brazil", callingCode: "+55" },
  { name: "Canada", callingCode: "+1" },
  { name: "France", callingCode: "+33" },
  { name: "Germany", callingCode: "+49" },
  { name: "Hong Kong", callingCode: "+852" },
  { name: "India", callingCode: "+91" },
  { name: "Indonesia", callingCode: "+62" },
  { name: "Japan", callingCode: "+81" },
  { name: "Malaysia", callingCode: "+60" },
  { name: "Mexico", callingCode: "+52" },
  { name: "Pakistan", callingCode: "+92" },
  { name: "Philippines", callingCode: "+63" },
  { name: "Singapore", callingCode: "+65" },
  { name: "South Korea", callingCode: "+82" },
  { name: "Spain", callingCode: "+34" },
  { name: "Taiwan", callingCode: "+886" },
  { name: "Thailand", callingCode: "+66" },
  { name: "United Arab Emirates", callingCode: "+971" },
  { name: "United Kingdom", callingCode: "+44" },
  { name: "United States", callingCode: "+1" },
  { name: "Vietnam", callingCode: "+84" },
  { name: "Other", callingCode: "" },
];

function quantityValue(value) {
  const normalized = String(value || "").toLowerCase();
  return numberWords[normalized] || Number(normalized);
}

export function getTournamentRosterRequirements(tournament) {
  const explicitSize = Number(tournament?.registrationTeamSize ?? tournament?.teamSize);
  if (Number.isInteger(explicitSize) && explicitSize > 0 && explicitSize <= 10) {
    return { starters: explicitSize, substitutes: 0, totalPlayers: explicitSize };
  }

  const format = String(tournament?.format || "").toLowerCase();
  if (/\bsolo\b/.test(format)) return { starters: 1, substitutes: 0, totalPlayers: 1 };
  if (/\bduo\b/.test(format)) return { starters: 2, substitutes: 0, totalPlayers: 2 };

  const rules = Array.isArray(tournament?.rules) ? tournament.rules.join(" ") : String(tournament?.rules || "");
  const tournamentText = `${format} ${rules}`.toLowerCase();
  const countMatch = tournamentText.match(new RegExp(`\\b(${quantityPattern})\\s+(?:starting\\s+)?players?\\b`))
    || tournamentText.match(new RegExp(`\\b(${quantityPattern})\\s+starters?\\b`))
    || tournamentText.match(new RegExp(`\\b(?:squads?|teams?|rosters?)\\s+(?:of|have|field|must\\s+register)\\s+(${quantityPattern})\\b`))
    || tournamentText.match(new RegExp(`\\b(${quantityPattern})[- ]player\\s+(?:squad|team|roster)\\b`));
  const label = String(tournament?.participants?.label || "").toLowerCase();
  const starters = countMatch
    ? quantityValue(countMatch[1])
    : label.includes("squad") ? 4 : label.includes("team") ? 5 : 1;
  const substituteMatches = [...tournamentText.matchAll(new RegExp(`(?:\\b(?:plus|and)\\b|\\+)\\s+(${quantityPattern})\\s+(?:registered\\s+)?substitutes?\\b`, "g"))];
  const substitutes = substituteMatches.reduce((total, match) => {
    const precedingText = tournamentText.slice(Math.max(0, match.index - 16), match.index);
    return /\bmay\s+(?:name|add|include)\s*$/.test(precedingText) ? total : total + quantityValue(match[1]);
  }, 0);

  return { starters, substitutes, totalPlayers: starters + substitutes };
}

export function normalizeTournamentRegistrationDetails(details) {
  return {
    roster: Array.isArray(details?.roster)
      ? details.roster.map((player) => ({
        inGameName: String(player?.inGameName || "").trim(),
        gameId: String(player?.gameId || "").trim(),
      }))
      : [],
    contactEmail: String(details?.contactEmail || "").trim(),
    contactPhone: String(details?.contactPhone || "").trim(),
    country: String(details?.country || "").trim(),
  };
}

export function validateTournamentRegistrationDetails(tournament, details) {
  const normalized = normalizeTournamentRegistrationDetails(details);
  const requiredPlayers = getTournamentRosterRequirements(tournament).totalPlayers;
  const errors = {};

  if (normalized.roster.length !== requiredPlayers) {
    errors.roster = "Please provide details for all required teammates.";
  }

  normalized.roster.forEach((player, index) => {
    const isPrimaryPlayer = index === 0;
    const nameField = `roster.${index}.inGameName`;
    const idField = `roster.${index}.gameId`;

    if (!player.inGameName) {
      errors[nameField] = isPrimaryPlayer ? "Please enter your in-game name." : "Please provide details for all required teammates.";
    } else if (player.inGameName.length < 2 || player.inGameName.length > 32) {
      errors[nameField] = "In-game name must be 2-32 characters.";
    }

    if (!player.gameId) {
      errors[idField] = isPrimaryPlayer ? "Player ID cannot be empty." : "Please provide details for all required teammates.";
    } else if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/.test(player.gameId)) {
      errors[idField] = "Enter a valid in-game ID (2-64 letters, numbers, dots, underscores or hyphens).";
    }
  });

  const playerIds = new Map();
  normalized.roster.forEach((player, index) => {
    if (!player.gameId) return;
    const normalizedId = player.gameId.toLowerCase();
    const previousIndex = playerIds.get(normalizedId);
    if (previousIndex !== undefined) {
      errors[`roster.${previousIndex}.gameId`] = "Duplicate player IDs are not allowed.";
      errors[`roster.${index}.gameId`] = "Duplicate player IDs are not allowed.";
    } else {
      playerIds.set(normalizedId, index);
    }
  });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.contactEmail) || normalized.contactEmail.length > 254) {
    errors.contactEmail = "Enter a valid email address.";
  }

  const country = registrationCountries.find((item) => item.name === normalized.country);
  const normalizedPhone = normalized.contactPhone.replace(/[\s().-]/g, "");
  const phoneDigits = normalizedPhone.replace(/\D/g, "");
  if (!country || !/^\+\d+$/.test(normalizedPhone) || phoneDigits.length < 8 || phoneDigits.length > 15
    || (country.callingCode && !normalizedPhone.startsWith(country.callingCode))) {
    errors.contactPhone = "Phone number must include a valid country code.";
  }

  if (!country) errors.country = "Please select your country/region.";

  return { normalized, errors };
}
