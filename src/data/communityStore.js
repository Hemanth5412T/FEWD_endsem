import {
  ACCOUNT_DB_VERSION,
  COMMUNITY_STORES,
  getAccountById,
  getCompletedMatchHistory,
  getCompletedTournamentHistory,
  getPublicPlayerProfile,
  initializeAccountDatabase,
} from "./accountStore.js";
import { getRegistrationsForUser } from "./gameArenaData.js";

const DB_NAME = "gameArenaAccounts";
const POST_CATEGORIES = new Set(["general", "achievement", "match-update", "tournament-update"]);
const GAMES = new Set(["", "Valorant", "BGMI", "Counter-Strike 2", "Other"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const DEMO_SEED_VERSION = 2;
export const COMMUNITY_PAGE_SIZE = 12;
export const COMMUNITY_MAX_POST_LENGTH = 1000;
export const COMMUNITY_MAX_COMMENT_LENGTH = 500;
export const COMMUNITY_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
let databasePromise;
let communityChannel;

const DEMO_POSTS = [
  {
    postId: "demo-community-post-valorant-final",
    authorId: "demo-community-account-vexnova",
    authorUsername: "VexNova",
    authorDisplayName: "Vex Nova",
    authorGame: "Valorant",
    isDemo: true,
    category: "tournament-update",
    game: "Valorant",
    content: "DEMO VICTORY — VexNova's fictional demo roster finished 1st in the Arena Masters Valorant Open final. Illustrative showcase content, not a verified player result.",
    relatedTournamentId: "arena-masters-valorant-open",
    createdOffsetMs: 1000 * 60 * 38,
  },
  {
    postId: "demo-community-post-cs2-retake",
    authorId: "demo-community-account-frostbyte",
    authorUsername: "FrostByte",
    authorDisplayName: "Frost Byte",
    authorGame: "Counter-Strike 2",
    isDemo: true,
    category: "match-update",
    game: "Counter-Strike 2",
    content: "DEMO MATCH HIGHLIGHT — A patient retake on Ancient turned this fictional demo scrim around. What map are you grinding this week?",
    createdOffsetMs: 1000 * 60 * 60 * 3,
  },
  {
    postId: "demo-community-post-bgmi-milestone",
    authorId: "demo-community-account-ember",
    authorUsername: "EmberRush",
    authorDisplayName: "Ember Rush",
    authorGame: "BGMI",
    isDemo: true,
    category: "achievement",
    game: "BGMI",
    content: "DEMO MILESTONE — EmberRush's fictional demo profile completed 100 practice sessions. Illustrative seed content, not a real player achievement.",
    createdOffsetMs: 1000 * 60 * 60 * 7,
  },
  {
    postId: "demo-community-post-discussion",
    authorId: "demo-community-account-pixel",
    authorUsername: "PixelPilot",
    authorDisplayName: "Pixel Pilot",
    authorGame: "Other",
    isDemo: true,
    category: "general",
    game: "",
    content: "DEMO DISCUSSION — What makes a great esports teammate: sharp calls, patient practice, or a clutch mindset?",
    createdOffsetMs: 1000 * 60 * 60 * 12,
  },
];

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("Community storage is unavailable in this browser."));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, ACCOUNT_DB_VERSION);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          databasePromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("Could not open community storage."));
      request.onblocked = () => reject(new Error("Community storage is blocked by another browser tab."));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Community storage request failed."));
  });
}

function completeTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Community change could not be saved."));
    transaction.onabort = () => reject(transaction.error || new Error("Community change was cancelled."));
  });
}

function dispatchCommunityUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("gamearena:community-updated"));
  if (typeof BroadcastChannel !== "undefined") {
    communityChannel ||= new BroadcastChannel("gamearena-community");
    communityChannel.postMessage({ updatedAt: Date.now() });
  }
}

export function subscribeToCommunity(callback) {
  if (typeof window === "undefined") return () => {};
  const onUpdate = () => callback();
  window.addEventListener("gamearena:community-updated", onUpdate);
  if (typeof BroadcastChannel !== "undefined") {
    communityChannel ||= new BroadcastChannel("gamearena-community");
    communityChannel.addEventListener("message", onUpdate);
  }
  return () => {
    window.removeEventListener("gamearena:community-updated", onUpdate);
    communityChannel?.removeEventListener("message", onUpdate);
  };
}

function displayNameFor(account) {
  return String(account.displayName || account.fullName || account.username || "Player").trim();
}

function initialsFor(name) {
  return String(name || "Player")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function normalizeMedia(media) {
  if (!media) return null;
  const mimeType = String(media.mimeType || "");
  const dataUrl = String(media.dataUrl || "");
  if (!IMAGE_TYPES.has(mimeType) || !dataUrl.startsWith(`data:${mimeType};base64,`)) {
    throw new Error("Choose a supported PNG, JPG, WEBP, or GIF image.");
  }
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const byteLength = Math.floor(encoded.length * 3 / 4);
  if (byteLength > COMMUNITY_MAX_IMAGE_BYTES) throw new Error("Images must be 2 MB or smaller.");
  return {
    mimeType,
    dataUrl,
    name: String(media.name || "community-image").slice(0, 120),
    byteLength,
  };
}

function validatePostInput(input) {
  const content = String(input.content || "").trim();
  const category = String(input.category || "general");
  const game = String(input.game || "");
  const media = normalizeMedia(input.media);
  if (!content && !media) throw new Error("Write a post or add an image before publishing.");
  if (content.length > COMMUNITY_MAX_POST_LENGTH) throw new Error(`Posts must be ${COMMUNITY_MAX_POST_LENGTH} characters or fewer.`);
  if (!POST_CATEGORIES.has(category)) throw new Error("Choose a valid post category.");
  if (!GAMES.has(game)) throw new Error("Choose a valid game.");
  return { content, category, game, media };
}

async function getWritableAccount(userId) {
  const account = await getAccountById(userId);
  if (!account || account.status !== "active") {
    throw new Error("An active account is required to participate in the community.");
  }
  return account;
}

async function getAdminAccount(userId) {
  const account = await getWritableAccount(userId);
  if (!["admin", "master_admin"].includes(account.role)) {
    throw new Error("Admin access is required to moderate community posts.");
  }
  return account;
}

function eventDate(...values) {
  for (const value of values) {
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function makeActivityPost(account, { sourceEventId, activityType, content, createdAt, category, game, relatedTournamentId = null, relatedUrl = null, details = "" }) {
  return {
    postId: `activity-${crypto.randomUUID()}`,
    authorId: account.id,
    authorUsername: account.username,
    authorDisplayName: displayNameFor(account),
    authorGame: account.preferredGame || "",
    content,
    category,
    game: game || "",
    createdAt,
    updatedAt: createdAt,
    postType: "activity",
    activityType,
    activityDetails: details,
    sourceEventId,
    relatedTournamentId,
    relatedUrl,
  };
}

export function buildCommunityActivityPosts(account, registrations = []) {
  if (!account?.id || !account.username) return [];
  const activityPosts = [];
  for (const match of getCompletedMatchHistory(account)) {
    const createdAt = eventDate(match.completedAt, match.playedAt, match.at, match.createdAt);
    if (!createdAt) continue;
    const game = String(match.game || "").trim();
    const opponent = String(match.opponent || "").trim();
    const verb = match.result === "win" ? "won" : match.result === "loss" ? "lost" : "drew";
    const identity = match.id || [createdAt, game, opponent, match.result, match.score || ""].join("|");
    activityPosts.push(makeActivityPost(account, {
      sourceEventId: `match:${account.id}:${identity}`,
      activityType: "match",
      content: `${account.username} ${verb} a ${game || "match"} match${opponent ? ` against ${opponent}` : ""}.`,
      createdAt,
      category: "match-update",
      game,
      details: match.score ? `Score: ${match.score}` : "",
    }));
  }
  for (const entry of getCompletedTournamentHistory(account)) {
    const createdAt = eventDate(entry.completedAt, entry.at, entry.createdAt);
    if (!createdAt) continue;
    const name = String(entry.name || "a tournament");
    const result = String(entry.result);
    const identity = entry.id || [entry.tournamentId, createdAt, result].join("|");
    activityPosts.push(makeActivityPost(account, {
      sourceEventId: `tournament-result:${account.id}:${identity}`,
      activityType: "tournament-result",
      content: `${account.username} secured ${result} in ${name}.`,
      createdAt,
      category: "tournament-update",
      game: String(entry.game || ""),
      relatedTournamentId: entry.tournamentId,
      relatedUrl: `/tournament/${encodeURIComponent(entry.tournamentId)}`,
      details: "Verified completed tournament result",
    }));
  }
  for (const achievement of Array.isArray(account.achievements) ? account.achievements : []) {
    if (achievement?.userId && achievement.userId !== account.id) continue;
    const createdAt = eventDate(achievement?.unlockedAt, achievement?.createdAt, achievement?.at);
    const name = String(achievement?.name || achievement?.title || achievement?.value || "").trim();
    if (!createdAt || !name) continue;
    const identity = achievement.id || [createdAt, name].join("|");
    activityPosts.push(makeActivityPost(account, {
      sourceEventId: `achievement:${account.id}:${identity}`,
      activityType: "achievement",
      content: `${account.username} unlocked a new achievement: ${name}.`,
      createdAt,
      category: "achievement",
      game: String(achievement.game || ""),
      relatedUrl: `/community/profile/${encodeURIComponent(account.id)}`,
      details: String(achievement.description || ""),
    }));
  }
  for (const registration of registrations) {
    if (registration?.userId !== account.id || registration.registrationStatus !== "Registered") continue;
    const createdAt = eventDate(registration.registeredAt);
    if (!createdAt || !registration.tournamentId) continue;
    const identity = registration.id || [registration.tournamentId, createdAt].join("|");
    activityPosts.push(makeActivityPost(account, {
      sourceEventId: `tournament-registration:${account.id}:${identity}`,
      activityType: "tournament-registration",
      content: `${account.username} registered for ${registration.name || "a tournament"}.`,
      createdAt,
      category: "tournament-update",
      game: String(registration.game || ""),
      relatedTournamentId: registration.tournamentId,
      relatedUrl: `/tournament/${encodeURIComponent(registration.tournamentId)}`,
      details: "Tournament registration",
    }));
  }
  return activityPosts;
}

async function seedDemoPosts() {
  const db = await openDatabase();
  const transaction = db.transaction(COMMUNITY_STORES.posts, "readwrite");
  const store = transaction.objectStore(COMMUNITY_STORES.posts);
  const done = completeTransaction(transaction);
  const now = Date.now();
  const request = store.getAll();
  request.onsuccess = () => {
    const existing = new Map(request.result.map((post) => [post.postId, post]));
    for (const demo of DEMO_POSTS) {
      const { createdOffsetMs, ...post } = demo;
      const timestamp = new Date(now - createdOffsetMs).toISOString();
      const current = existing.get(demo.postId);
      if (!current) {
        store.add({ ...post, createdAt: timestamp, updatedAt: timestamp, postType: "demo", commentsEnabled: true, seedVersion: DEMO_SEED_VERSION });
      } else if (current.isDemo && (current.seedVersion || 0) < DEMO_SEED_VERSION) {
        store.put({
          ...current,
          ...post,
          createdAt: current.createdAt || timestamp,
          updatedAt: new Date(now).toISOString(),
          postType: "demo",
          commentsEnabled: true,
          seedVersion: DEMO_SEED_VERSION,
        });
      }
    }
  };
  await done;
}

export async function initializeCommunity() {
  await initializeAccountDatabase();
  await seedDemoPosts();
}

export async function syncCommunityActivity(userId) {
  const account = await getAccountById(userId);
  if (!account) return 0;
  const registrations = getRegistrationsForUser(userId);
  const activityPosts = buildCommunityActivityPosts(account, registrations);
  if (!activityPosts.length) return 0;
  const db = await openDatabase();
  const transaction = db.transaction(COMMUNITY_STORES.posts, "readwrite");
  const store = transaction.objectStore(COMMUNITY_STORES.posts);
  const done = completeTransaction(transaction);
  let inserted = 0;
  for (const post of activityPosts) {
    const request = store.index("sourceEventId").get(post.sourceEventId);
    request.onsuccess = () => {
      if (request.result) return;
      store.add(post);
      inserted += 1;
    };
  }
  await done;
  if (inserted) dispatchCommunityUpdate();
  return inserted;
}

function matchesFilter(post, filter, userId, authorId) {
  if (post.removedAt || post.deletedAt) return false;
  if (filter === "achievements") return post.category === "achievement" || post.activityType === "achievement";
  if (filter === "matches") return post.category === "match-update" || post.activityType === "match";
  if (filter === "mine") return Boolean(userId) && post.authorId === userId;
  if (filter === "author") return Boolean(authorId) && post.authorId === authorId;
  return true;
}

async function getPostEngagement(posts, userId) {
  if (!posts.length) return [];
  const db = await openDatabase();
  const transaction = db.transaction([COMMUNITY_STORES.reactions, COMMUNITY_STORES.comments], "readonly");
  const reactions = transaction.objectStore(COMMUNITY_STORES.reactions);
  const comments = transaction.objectStore(COMMUNITY_STORES.comments);
  const values = new Map(posts.map((post) => [post.postId, { likes: 0, comments: 0, likedByUser: false }]));
  const done = completeTransaction(transaction);
  for (const post of posts) {
    const value = values.get(post.postId);
    const likes = reactions.index("postId").count(IDBKeyRange.only(post.postId));
    likes.onsuccess = () => { value.likes = likes.result; };
    const commentCount = comments.index("postId").count(IDBKeyRange.only(post.postId));
    commentCount.onsuccess = () => { value.comments = commentCount.result; };
    if (userId) {
      const reaction = reactions.index("postUser").get([post.postId, userId]);
      reaction.onsuccess = () => { value.likedByUser = Boolean(reaction.result); };
    }
  }
  await done;
  return posts.map((post) => ({ ...post, ...values.get(post.postId) }));
}

export async function listCommunityPosts({ filter = "all", userId = null, authorId = null, cursor = null, limit = COMMUNITY_PAGE_SIZE } = {}) {
  const pageSize = Math.max(1, Math.min(30, Math.floor(Number(limit) || COMMUNITY_PAGE_SIZE)));
  const db = await openDatabase();
  const transaction = db.transaction(COMMUNITY_STORES.posts, "readonly");
  const index = transaction.objectStore(COMMUNITY_STORES.posts).index("createdAtPost");
  const range = cursor?.createdAt && cursor?.postId
    ? IDBKeyRange.upperBound([cursor.createdAt, cursor.postId], true)
    : null;
  const page = await new Promise((resolve, reject) => {
    const posts = [];
    const request = index.openCursor(range, "prev");
    request.onsuccess = () => {
      const current = request.result;
      if (!current || posts.length > pageSize) {
        resolve(posts);
        return;
      }
      if (matchesFilter(current.value, filter, userId, authorId)) posts.push(current.value);
      if (posts.length > pageSize) {
        resolve(posts);
        return;
      }
      current.continue();
    };
    request.onerror = () => reject(request.error || new Error("Could not load community posts."));
  });
  const hasMore = page.length > pageSize;
  const visible = page.slice(0, pageSize);
  const posts = await getPostEngagement(visible, userId);
  const last = visible[visible.length - 1];
  return {
    posts,
    hasMore,
    nextCursor: hasMore && last ? { createdAt: last.createdAt, postId: last.postId } : null,
  };
}

export async function getPublicCommunityProfile(userId) {
  if (!userId) return null;
  const player = await getPublicPlayerProfile(userId);
  if (player) return { ...player, isDemo: false };
  const db = await openDatabase();
  const posts = db.transaction(COMMUNITY_STORES.posts, "readonly").objectStore(COMMUNITY_STORES.posts);
  const authored = await requestValue(posts.index("authorId").getAll(IDBKeyRange.only(userId), 1));
  const demo = authored.find((post) => post.isDemo);
  if (!demo) return null;
  return {
    userId: demo.authorId,
    username: demo.authorUsername,
    displayName: demo.authorDisplayName || demo.authorUsername,
    avatarInitials: initialsFor(demo.authorDisplayName || demo.authorUsername),
    bio: "Seeded demo profile. These posts are illustrative and are not real player history.",
    game: demo.authorGame || "",
    createdAt: null,
    isDemo: true,
  };
}

export async function createCommunityPost(authorId, input) {
  const account = await getWritableAccount(authorId);
  const { content, category, game, media } = validatePostInput(input || {});
  const now = new Date().toISOString();
  const post = {
    postId: crypto.randomUUID(),
    authorId: account.id,
    authorUsername: account.username,
    authorDisplayName: displayNameFor(account),
    authorGame: account.preferredGame || "",
    content,
    category,
    game,
    media,
    createdAt: now,
    updatedAt: now,
    postType: "user",
    relatedTournamentId: input.relatedTournamentId || null,
  };
  const db = await openDatabase();
  const transaction = db.transaction(COMMUNITY_STORES.posts, "readwrite");
  const done = completeTransaction(transaction);
  transaction.objectStore(COMMUNITY_STORES.posts).add(post);
  await done;
  dispatchCommunityUpdate();
  return post;
}

export async function updateCommunityPost(authorId, postId, input) {
  const account = await getWritableAccount(authorId);
  const postInput = input || {};
  const fields = validatePostInput(postInput);
  const includesMedia = Object.prototype.hasOwnProperty.call(postInput, "media");
  const db = await openDatabase();
  const transaction = db.transaction(COMMUNITY_STORES.posts, "readwrite");
  const store = transaction.objectStore(COMMUNITY_STORES.posts);
  const done = completeTransaction(transaction);
  let updated;
  let failure;
  const request = store.get(postId);
  request.onsuccess = () => {
    const existing = request.result;
    if (!existing || existing.authorId !== account.id || existing.postType !== "user" || existing.removedAt || existing.deletedAt) {
      failure = new Error("You can only edit your own active posts.");
      transaction.abort();
      return;
    }
    updated = {
      ...existing,
      ...fields,
      ...(!includesMedia ? { media: existing.media || null } : {}),
      updatedAt: new Date().toISOString(),
    };
    store.put(updated);
  };
  try {
    await done;
  } catch (error) {
    throw failure || error;
  }
  dispatchCommunityUpdate();
  return updated;
}

export async function deleteCommunityPost(authorId, postId) {
  const account = await getWritableAccount(authorId);
  const db = await openDatabase();
  const transaction = db.transaction(COMMUNITY_STORES.posts, "readwrite");
  const store = transaction.objectStore(COMMUNITY_STORES.posts);
  const done = completeTransaction(transaction);
  let failure;
  const request = store.get(postId);
  request.onsuccess = () => {
    const existing = request.result;
    if (!existing || existing.authorId !== account.id || existing.isDemo || existing.removedAt || existing.deletedAt) {
      failure = new Error("You can only delete your own active posts.");
      transaction.abort();
      return;
    }
    const now = new Date().toISOString();
    store.put({ ...existing, deletedAt: now, updatedAt: now });
  };
  try {
    await done;
  } catch (error) {
    throw failure || error;
  }
  dispatchCommunityUpdate();
}

export async function toggleCommunityReaction(userId, postId) {
  await getWritableAccount(userId);
  const db = await openDatabase();
  const transaction = db.transaction([COMMUNITY_STORES.posts, COMMUNITY_STORES.reactions], "readwrite");
  const posts = transaction.objectStore(COMMUNITY_STORES.posts);
  const reactions = transaction.objectStore(COMMUNITY_STORES.reactions);
  const done = completeTransaction(transaction);
  let post;
  let existing;
  let loaded = 0;
  let liked = false;
  let failure;
  const applyToggle = () => {
    loaded += 1;
    if (loaded !== 2) return;
    if (!post || post.removedAt || post.deletedAt) {
      failure = new Error("This post is no longer available.");
      transaction.abort();
      return;
    }
    liked = !existing;
    if (existing) reactions.delete(existing.reactionId);
    else reactions.add({ reactionId: crypto.randomUUID(), postId, userId, reactionType: "like", createdAt: new Date().toISOString() });
  };
  const postRequest = posts.get(postId);
  postRequest.onsuccess = () => { post = postRequest.result; applyToggle(); };
  const reactionRequest = reactions.index("postUser").get([postId, userId]);
  reactionRequest.onsuccess = () => { existing = reactionRequest.result; applyToggle(); };
  try {
    await done;
  } catch (error) {
    throw failure || error;
  }
  dispatchCommunityUpdate();
  return liked;
}

export async function listCommunityComments(postId, limit = 30) {
  const maximum = Math.max(1, Math.min(50, Math.floor(Number(limit) || 30)));
  const db = await openDatabase();
  const index = db.transaction(COMMUNITY_STORES.comments, "readonly").objectStore(COMMUNITY_STORES.comments).index("postCreatedAtId");
  const range = IDBKeyRange.bound([postId, "", ""], [postId, "\uffff", "\uffff"]);
  return new Promise((resolve, reject) => {
    const comments = [];
    const request = index.openCursor(range, "prev");
    request.onsuccess = () => {
      const current = request.result;
      if (!current || comments.length >= maximum) {
        resolve(comments.reverse());
        return;
      }
      comments.push(current.value);
      current.continue();
    };
    request.onerror = () => reject(request.error || new Error("Could not load comments."));
  });
}

export async function createCommunityComment(authorId, postId, content) {
  const account = await getWritableAccount(authorId);
  const cleanContent = String(content || "").trim();
  if (!cleanContent) throw new Error("Write a comment before posting.");
  if (cleanContent.length > COMMUNITY_MAX_COMMENT_LENGTH) throw new Error(`Comments must be ${COMMUNITY_MAX_COMMENT_LENGTH} characters or fewer.`);
  const db = await openDatabase();
  const transaction = db.transaction([COMMUNITY_STORES.posts, COMMUNITY_STORES.comments], "readwrite");
  const posts = transaction.objectStore(COMMUNITY_STORES.posts);
  const comments = transaction.objectStore(COMMUNITY_STORES.comments);
  const now = new Date().toISOString();
  const comment = {
    commentId: crypto.randomUUID(),
    postId,
    authorId: account.id,
    authorUsername: account.username,
    authorDisplayName: displayNameFor(account),
    content: cleanContent,
    createdAt: now,
    updatedAt: now,
  };
  const done = completeTransaction(transaction);
  let failure;
  let savedComment = comment;
  const postRequest = posts.get(postId);
  postRequest.onsuccess = () => {
    const post = postRequest.result;
    if (!post || post.deletedAt || post.removedAt) {
      failure = new Error("This post is no longer available.");
      transaction.abort();
      return;
    }
    const duplicateRequest = comments.index("postAuthorContent").get([postId, account.id, cleanContent]);
    duplicateRequest.onsuccess = () => {
      if (duplicateRequest.result) {
        savedComment = duplicateRequest.result;
        return;
      }
      comments.add(comment);
    };
  };
  try {
    await done;
  } catch (error) {
    throw failure || error;
  }
  if (savedComment === comment) dispatchCommunityUpdate();
  return savedComment;
}

export async function updateCommunityComment(authorId, commentId, content) {
  const account = await getWritableAccount(authorId);
  const cleanContent = String(content || "").trim();
  if (!cleanContent) throw new Error("Write a comment before saving.");
  if (cleanContent.length > COMMUNITY_MAX_COMMENT_LENGTH) throw new Error(`Comments must be ${COMMUNITY_MAX_COMMENT_LENGTH} characters or fewer.`);
  const db = await openDatabase();
  const transaction = db.transaction(COMMUNITY_STORES.comments, "readwrite");
  const store = transaction.objectStore(COMMUNITY_STORES.comments);
  const done = completeTransaction(transaction);
  let updated;
  let failure;
  const request = store.get(commentId);
  request.onsuccess = () => {
    const comment = request.result;
    if (!comment || comment.authorId !== account.id) {
      failure = new Error("You can only edit your own comments.");
      transaction.abort();
      return;
    }
    updated = { ...comment, content: cleanContent, updatedAt: new Date().toISOString() };
    store.put(updated);
  };
  try {
    await done;
  } catch (error) {
    throw failure || error;
  }
  dispatchCommunityUpdate();
  return updated;
}

export async function deleteCommunityComment(actorId, commentId) {
  const account = await getWritableAccount(actorId);
  const db = await openDatabase();
  const transaction = db.transaction([COMMUNITY_STORES.posts, COMMUNITY_STORES.comments], "readwrite");
  const posts = transaction.objectStore(COMMUNITY_STORES.posts);
  const comments = transaction.objectStore(COMMUNITY_STORES.comments);
  const done = completeTransaction(transaction);
  let failure;
  const commentRequest = comments.get(commentId);
  commentRequest.onsuccess = () => {
    const comment = commentRequest.result;
    if (!comment) {
      failure = new Error("This comment is no longer available.");
      transaction.abort();
      return;
    }
    const postRequest = posts.get(comment.postId);
    postRequest.onsuccess = () => {
      if (comment.authorId !== account.id && postRequest.result?.authorId !== account.id) {
        failure = new Error("You can only remove your own comments or comments on your post.");
        transaction.abort();
        return;
      }
      comments.delete(commentId);
    };
  };
  try {
    await done;
  } catch (error) {
    throw failure || error;
  }
  dispatchCommunityUpdate();
}

export async function reportCommunityPost(reporterId, postId, reason) {
  const reporter = await getWritableAccount(reporterId);
  const cleanReason = String(reason || "").trim();
  if (!cleanReason || cleanReason.length > 300) throw new Error("Choose a report reason of 1–300 characters.");
  const db = await openDatabase();
  const transaction = db.transaction([COMMUNITY_STORES.posts, COMMUNITY_STORES.reports], "readwrite");
  const posts = transaction.objectStore(COMMUNITY_STORES.posts);
  const reports = transaction.objectStore(COMMUNITY_STORES.reports);
  const done = completeTransaction(transaction);
  let report;
  let failure;
  const postRequest = posts.get(postId);
  postRequest.onsuccess = () => {
    const post = postRequest.result;
    if (!post || post.authorId === reporter.id || post.removedAt || post.deletedAt) {
      failure = new Error("This post cannot be reported.");
      transaction.abort();
      return;
    }
    report = {
      reportId: crypto.randomUUID(),
      postId,
      reporterId: reporter.id,
      reason: cleanReason,
      status: "pending",
      createdAt: new Date().toISOString(),
      postSnapshot: {
        authorId: post.authorId,
        authorUsername: post.authorUsername,
        content: post.content,
        category: post.category,
        game: post.game,
      },
    };
    reports.add(report);
  };
  try {
    await done;
  } catch (error) {
    if (failure) throw failure;
    if (error?.name === "ConstraintError") throw new Error("You have already reported this post.");
    throw error;
  }
  dispatchCommunityUpdate();
  return report;
}

export async function listCommunityReports(actorId, limit = 100) {
  await getAdminAccount(actorId);
  const maximum = Math.max(1, Math.min(200, Math.floor(Number(limit) || 100)));
  const db = await openDatabase();
  const transaction = db.transaction(COMMUNITY_STORES.reports, "readonly");
  const index = transaction.objectStore(COMMUNITY_STORES.reports).index("createdAt");
  const reports = await new Promise((resolve, reject) => {
    const found = [];
    const request = index.openCursor(null, "prev");
    request.onsuccess = () => {
      const current = request.result;
      if (!current || found.length >= maximum) {
        resolve(found);
        return;
      }
      found.push(current.value);
      current.continue();
    };
    request.onerror = () => reject(request.error || new Error("Could not load community reports."));
  });
  return reports;
}

export async function listCommunityModerationHistory(actorId, limit = 50) {
  await getAdminAccount(actorId);
  const maximum = Math.max(1, Math.min(100, Math.floor(Number(limit) || 50)));
  const db = await openDatabase();
  const index = db.transaction(COMMUNITY_STORES.moderation, "readonly").objectStore(COMMUNITY_STORES.moderation).index("createdAt");
  return new Promise((resolve, reject) => {
    const history = [];
    const request = index.openCursor(null, "prev");
    request.onsuccess = () => {
      const current = request.result;
      if (!current || history.length >= maximum) {
        resolve(history);
        return;
      }
      history.push(current.value);
      current.continue();
    };
    request.onerror = () => reject(request.error || new Error("Could not load moderation history."));
  });
}

export async function resolveCommunityReport(actorId, reportId, action, note = "") {
  const actor = await getAdminAccount(actorId);
  if (!["review", "dismiss", "remove"].includes(action)) throw new Error("Choose a valid moderation action.");
  const cleanNote = String(note || "").trim().slice(0, 500);
  const db = await openDatabase();
  const transaction = db.transaction([COMMUNITY_STORES.posts, COMMUNITY_STORES.reports, COMMUNITY_STORES.moderation], "readwrite");
  const posts = transaction.objectStore(COMMUNITY_STORES.posts);
  const reports = transaction.objectStore(COMMUNITY_STORES.reports);
  const moderation = transaction.objectStore(COMMUNITY_STORES.moderation);
  const done = completeTransaction(transaction);
  let report;
  let failure;
  const reportRequest = reports.get(reportId);
  reportRequest.onsuccess = () => {
    report = reportRequest.result;
    if (!report || ["dismissed", "removed"].includes(report.status)) {
      failure = new Error("This report has already been resolved.");
      transaction.abort();
      return;
    }
    const postRequest = posts.get(report.postId);
    postRequest.onsuccess = () => {
      const post = postRequest.result;
      const now = new Date().toISOString();
      if (action === "remove") {
        if (post && !post.removedAt) {
          posts.put({ ...post, removedAt: now, removedBy: actor.id, removalReason: cleanNote || report.reason, updatedAt: now });
        }
        report.status = "removed";
      } else if (action === "dismiss") {
        report.status = "dismissed";
      } else {
        report.status = "reviewed";
      }
      report.reviewedAt = now;
      report.reviewedBy = actor.id;
      reports.put(report);
      moderation.add({
        moderationId: crypto.randomUUID(),
        reportId,
        postId: report.postId,
        actorId: actor.id,
        actorUsername: actor.username,
        actorRole: actor.role,
        action,
        reason: cleanNote || report.reason,
        createdAt: now,
      });
    };
  };
  try {
    await done;
  } catch (error) {
    throw failure || error;
  }
  dispatchCommunityUpdate();
  return report;
}
