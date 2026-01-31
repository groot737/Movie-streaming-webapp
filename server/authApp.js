import bcrypt from "bcrypt";
import crypto from "crypto";
import cors from "cors";
import express from "express";
import session from "express-session";
import multer from "multer";
import nodemailer from "nodemailer";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import connectPgSimple from "connect-pg-simple";
import OpenAI from "openai";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { pool } from "./db.js";

let cachedApp;
let resetTableReady = false;
let listCollaboratorsReady = false;

const ensureResetTable = async () => {
  if (resetTableReady) {
    return;
  }
  await pool.query(
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx ON password_reset_tokens (token_hash);"
  );
  resetTableReady = true;
};

const ensureListCollaboratorsTable = async () => {
  if (listCollaboratorsReady) {
    return;
  }
  await pool.query(
    `CREATE TABLE IF NOT EXISTS list_collaborators (
      list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (list_id, user_id)
    );`
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS list_collaborators_user_id_idx ON list_collaborators (user_id);"
  );
  listCollaboratorsReady = true;
};

const configurePassport = () => {
  if (passport._strategy("local")) {
    return;
  }

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const normalizedEmail = email.trim().toLowerCase();
          const result = await pool.query(
            "SELECT id, email, username, avatar, password_hash FROM users WHERE email = $1",
            [normalizedEmail]
          );
          const user = result.rows[0];
          if (!user) {
            return done(null, false, { message: "Invalid email or password." });
          }
          const isValid = await bcrypt.compare(password, user.password_hash);
          if (!isValid) {
            return done(null, false, { message: "Invalid email or password." });
          }
          return done(null, {
            id: user.id,
            email: user.email,
            username: user.username,
            avatar: user.avatar || "",
          });
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const result = await pool.query(
        "SELECT id, email, username, avatar FROM users WHERE id = $1",
        [id]
      );
      const user = result.rows[0];
      if (!user) {
        return done(null, false);
      }
      return done(null, {
        ...user,
        avatar: user.avatar || "",
      });
    } catch (err) {
      return done(err);
    }
  });
};

const passwordMeetsPolicy = (password) => {
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return password.length >= 8 && hasLetter && hasNumber;
};

const buildCorsOrigin = () => {
  const raw = process.env.CLIENT_ORIGIN || "";
  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    return true;
  }
  return origins.length === 1 ? origins[0] : origins;
};

const requireAuth = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated." });
  }
  return next();
};

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const SHARE_CODE_LENGTH = 6;
const SHARE_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const RECOVERY_TOKEN_TTL_MS = 1000 * 60 * 60;
const TMDB_CATEGORY_MAP = {
  movie: {
    trending: "/trending/movie/week",
    popular: "/movie/popular",
    topRated: "/movie/top_rated",
    upcoming: "/movie/upcoming",
  },
  tv: {
    trending: "/trending/tv/week",
    popular: "/tv/popular",
    topRated: "/tv/top_rated",
    onTheAir: "/tv/on_the_air",
  },
};

const generateShareCode = () => {
  let code = "";
  for (let i = 0; i < SHARE_CODE_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * SHARE_CODE_CHARS.length);
    code += SHARE_CODE_CHARS[index];
  }
  return code;
};

const createListWithShareCode = async (userId, name) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const shareCode = generateShareCode();
    const existing = await pool.query(
      "SELECT 1 FROM lists WHERE share_code = $1",
      [shareCode]
    );
    if (existing.rows.length) {
      continue;
    }
    try {
      return await pool.query(
        "INSERT INTO lists (user_id, name, share_code) VALUES ($1, $2, $3) RETURNING id, name, share_code",
        [userId, name, shareCode]
      );
    } catch (err) {
      if (err?.code === "23505" && err?.constraint?.includes("share_code")) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unable to generate unique share code.");
};

const createRoomWithCode = async ({
  userId,
  title,
  mediaId,
  mediaType,
  voiceChatEnabled,
  textChatEnabled,
}) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const roomCode = generateShareCode();
    const existing = await pool.query(
      "SELECT 1 FROM rooms WHERE room_code = $1",
      [roomCode]
    );
    if (existing.rows.length) {
      continue;
    }
    try {
      return await pool.query(
        `INSERT INTO rooms
         (room_code, user_id, media_id, media_type, title, voice_chat_enabled, text_chat_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, room_code, user_id, media_id, media_type, title, voice_chat_enabled, text_chat_enabled, created_at`,
        [
          roomCode,
          userId,
          mediaId,
          mediaType,
          title,
          voiceChatEnabled,
          textChatEnabled,
        ]
      );
    } catch (err) {
      if (err?.code === "23505" && err?.constraint?.includes("room_code")) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unable to generate unique room code.");
};

export const getAuthApp = () => {
  if (cachedApp) {
    return cachedApp;
  }

  const app = express();
  const PgSession = connectPgSimple(session);
  const sessionSecret = process.env.SESSION_SECRET || "dev-secret-change-me";
  const openAiKey = process.env.OPENAI_KEY || "";
  const openaiClient = openAiKey ? new OpenAI({ apiKey: openAiKey }) : null;
  const tmdbKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || "";
  const smtpHost = process.env.SMTP_HOST || "";
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER || "";
  const smtpPass = process.env.SMTP_PASS || "";
  const smtpFrom = process.env.SMTP_FROM || smtpUser;
  const b2KeyId = process.env.B2_KEY_ID || "";
  const b2Key = process.env.B2_APPLICATION_KEY || "";
  const b2Bucket = process.env.B2_BUCKET_NAME || "";
  const b2Endpoint = process.env.B2_ENDPOINT || "";
  const b2Region = process.env.B2_REGION || "us-west-004";
  const b2Public = (process.env.B2_PUBLIC || "true").toLowerCase() === "true";
  const b2AvatarPrefix = process.env.B2_AVATAR_PREFIX || "avatars";

  const mailer =
    smtpHost && smtpUser && smtpPass
      ? nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        })
      : null;

  const buildTmdbUrl = (path, params = {}) => {
    const url = new URL(`${TMDB_BASE_URL}${path}`);
    const searchParams = new URLSearchParams(params);
    searchParams.set("api_key", tmdbKey);
    url.search = searchParams.toString();
    return url.toString();
  };

  const fetchTmdb = async (path, params = {}) => {
    if (!tmdbKey) {
      return { error: "Missing TMDB configuration." };
    }
    const url = buildTmdbUrl(path, params);
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        error:
          data?.status_message || `TMDB request failed (${response.status}).`,
      };
    }
    return { data };
  };

  const searchTmdb = async (item) => {
    const title = (item?.title || "").trim();
    if (!title) {
      return null;
    }
    const mediaType = item?.mediaType === "tv" ? "tv" : "movie";
    const year = item?.year ? String(item.year).trim() : "";
    const params = { query: title };
    if (year) {
      params[mediaType === "movie" ? "year" : "first_air_date_year"] = year;
    }
    const url = buildTmdbUrl(`/search/${mediaType}`, params);
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const data = await response.json().catch(() => ({}));
    const result = data?.results?.[0];
    if (!result) {
      return null;
    }
    return {
      id: result.id,
      mediaType,
      title: result.title || result.name || title,
      name: result.name || null,
      poster_path: result.poster_path || null,
      release_date: result.release_date || result.first_air_date || null,
    };
  };

  app.set("trust proxy", 1);
  app.use(cors({ origin: buildCorsOrigin(), credentials: true }));
  app.use(express.json());

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );

  configurePassport();
  app.use(passport.initialize());
  app.use(passport.session());

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (
        ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype || "")
      ) {
        cb(null, true);
        return;
      }
      cb(new Error("Unsupported file type."));
    },
  });

  app.post("/api/auth/signup", async (req, res, next) => {
    const { email, password, confirmPassword, username } = req.body || {};
    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedUsername = (username || "").trim();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required." });
    }
    if (!normalizedUsername) {
      return res.status(400).json({ message: "Username is required." });
    }
    if (normalizedUsername.length < 3) {
      return res
        .status(400)
        .json({ message: "Username must be at least 3 characters." });
    }
    if (normalizedUsername.length > 32) {
      return res
        .status(400)
        .json({ message: "Username must be 32 characters or less." });
    }
    if (!password) {
      return res.status(400).json({ message: "Password is required." });
    }
    if (!passwordMeetsPolicy(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters and include a letter and a number.",
      });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }

    try {
      const existing = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [normalizedEmail]
      );
      if (existing.rows.length) {
        return res.status(409).json({ message: "Email is already registered." });
      }

      const existingUsername = await pool.query(
        "SELECT id FROM users WHERE username = $1",
        [normalizedUsername]
      );
      if (existingUsername.rows.length) {
        return res.status(409).json({ message: "Username is already taken." });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        "INSERT INTO users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING id, email, username, avatar",
        [normalizedEmail, passwordHash, normalizedUsername]
      );
      const user = result.rows[0];

      req.login(user, (err) => {
        if (err) {
          return next(err);
        }
        return res.status(201).json({ user });
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/signin", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res
          .status(401)
          .json({ message: info?.message || "Invalid credentials." });
      }
      return req.login(user, (loginErr) => {
        if (loginErr) {
          return next(loginErr);
        }
        return res.json({ user });
      });
    })(req, res, next);
  });

  app.post("/api/auth/recover", async (req, res, next) => {
    const normalizedEmail = (req.body?.email || "").trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required." });
    }
    if (!emailPattern.test(normalizedEmail)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }
    if (!mailer || !smtpFrom) {
      return res
        .status(500)
        .json({ message: "Email service is not configured." });
    }

    try {
      await ensureResetTable();
      const existing = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [normalizedEmail]
      );
      if (!existing.rows.length) {
        return res
          .status(404)
          .json({ message: "No account found with that email." });
      }
      const userId = existing.rows[0].id;
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_TTL_MS);

      await pool.query(
        "DELETE FROM password_reset_tokens WHERE user_id = $1 OR expires_at < NOW()",
        [userId]
      );
      await pool.query(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        [userId, tokenHash, expiresAt]
      );

      const origin =
        process.env.CLIENT_ORIGIN ||
        `${req.protocol}://${req.get("host") || "localhost"}`;
      const resetLink = `${origin}/#reset-password?token=${token}`;

      await mailer.sendMail({
        from: smtpFrom,
        to: normalizedEmail,
        subject: "Reset your GioStream password",
        text: `You requested a password reset. Use this link to set a new password: ${resetLink}`,
        html: `
          <p>You requested a password reset.</p>
          <p><a href="${resetLink}">Click here to reset your password</a></p>
          <p>If you did not request this, you can ignore this email.</p>
        `,
      });

      return res.json({
        ok: true,
        message: "Recovery email sent. Please check your inbox.",
      });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/api/auth/reset", async (req, res, next) => {
    const token = (req.body?.token || "").trim();
    const newPassword = req.body?.newPassword || "";
    const confirmPassword = req.body?.confirmPassword || "";

    if (!token) {
      return res.status(400).json({ message: "Recovery token is required." });
    }
    if (!newPassword) {
      return res.status(400).json({ message: "New password is required." });
    }
    if (!passwordMeetsPolicy(newPassword)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters and include a letter and a number.",
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }

    try {
      await ensureResetTable();
      await pool.query(
        "DELETE FROM password_reset_tokens WHERE expires_at < NOW()"
      );
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const tokenResult = await pool.query(
        `SELECT id, user_id
         FROM password_reset_tokens
         WHERE token_hash = $1 AND expires_at > NOW()`,
        [tokenHash]
      );
      const tokenRow = tokenResult.rows[0];
      if (!tokenRow) {
        return res.status(400).json({ message: "Invalid or expired token." });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        passwordHash,
        tokenRow.user_id,
      ]);
      await pool.query("DELETE FROM password_reset_tokens WHERE id = $1", [
        tokenRow.id,
      ]);
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/api/auth/signout", (req, res, next) => {
    req.logout((err) => {
      if (err) {
        return next(err);
      }
      req.session.destroy(() => {
        res.json({ ok: true });
      });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated." });
    }
    return res.json({ user: req.user });
  });

  app.patch("/api/account/username", requireAuth, async (req, res, next) => {
    const normalizedUsername = (req.body?.username || "").trim();
    if (!normalizedUsername) {
      return res.status(400).json({ message: "Username is required." });
    }
    if (normalizedUsername.length < 3) {
      return res
        .status(400)
        .json({ message: "Username must be at least 3 characters." });
    }
    if (normalizedUsername.length > 32) {
      return res
        .status(400)
        .json({ message: "Username must be 32 characters or less." });
    }
    try {
      const existingUsername = await pool.query(
        "SELECT id FROM users WHERE username = $1 AND id <> $2",
        [normalizedUsername, req.user.id]
      );
      if (existingUsername.rows.length) {
        return res.status(409).json({ message: "Username is already taken." });
      }
      const result = await pool.query(
        "UPDATE users SET username = $1 WHERE id = $2 RETURNING id, email, username, avatar",
        [normalizedUsername, req.user.id]
      );
      return res.json({ user: result.rows[0] });
    } catch (err) {
      return next(err);
    }
  });

  app.post(
    "/api/account/avatar",
    requireAuth,
    upload.single("avatar"),
    async (req, res, next) => {
      if (!b2KeyId || !b2Key || !b2Bucket || !b2Endpoint) {
        return res.status(500).json({ message: "Missing B2 configuration." });
      }
      if (!req.file) {
        return res.status(400).json({ message: "Avatar file is required." });
      }
      const ext =
        req.file.mimetype === "image/png"
          ? "png"
          : req.file.mimetype === "image/webp"
            ? "webp"
            : "jpg";
      const safePrefix = b2AvatarPrefix.replace(/\/+$/, "");
      const prefixPart = safePrefix ? `${safePrefix}/` : "";
      const objectKey = `${prefixPart}user-${req.user.id}-${Date.now()}.${ext}`;
      const s3 = new S3Client({
        region: b2Region,
        endpoint: `https://${b2Endpoint}`,
        credentials: {
          accessKeyId: b2KeyId,
          secretAccessKey: b2Key,
        },
      });
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: b2Bucket,
            Key: objectKey,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
            ACL: b2Public ? "public-read" : undefined,
          })
        );
        const publicUrl = `https://${b2Endpoint}/${b2Bucket}/${objectKey}`;
        const result = await pool.query(
          "UPDATE users SET avatar = $1 WHERE id = $2 RETURNING id, email, username, avatar",
          [publicUrl, req.user.id]
        );
        return res.json({ user: result.rows[0] });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.patch("/api/account/password", requireAuth, async (req, res, next) => {
    const currentPassword = req.body?.currentPassword || "";
    const newPassword = req.body?.newPassword || "";
    const confirmPassword = req.body?.confirmPassword || "";
    if (!currentPassword) {
      return res.status(400).json({ message: "Current password is required." });
    }
    if (!newPassword) {
      return res.status(400).json({ message: "New password is required." });
    }
    if (!passwordMeetsPolicy(newPassword)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters and include a letter and a number.",
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }
    try {
      const result = await pool.query(
        "SELECT password_hash FROM users WHERE id = $1",
        [req.user.id]
      );
      const user = result.rows[0];
      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect." });
      }
      const passwordHash = await bcrypt.hash(newPassword, 12);
      await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        passwordHash,
        req.user.id,
      ]);
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  app.delete("/api/account", requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE user_id = $1)",
        [req.user.id]
      );
      await client.query("DELETE FROM lists WHERE user_id = $1", [req.user.id]);
      await client.query("DELETE FROM rooms WHERE user_id = $1", [req.user.id]);
      await client.query("DELETE FROM users WHERE id = $1", [req.user.id]);
      await client.query("COMMIT");
      req.logout((err) => {
        if (err) {
          return next(err);
        }
        req.session.destroy(() => {
          res.json({ ok: true });
        });
      });
    } catch (err) {
      await client.query("ROLLBACK");
      return next(err);
    } finally {
      client.release();
    }
  });

  app.post("/api/rooms", requireAuth, async (req, res, next) => {
    const title = (req.body?.title || "").trim();
    const mediaId = (req.body?.mediaId || "").toString().trim();
    const mediaType = req.body?.mediaType === "tv" ? "tv" : "movie";
    const voiceChatEnabled = Boolean(req.body?.voiceChatEnabled);
    const textChatEnabled = Boolean(req.body?.textChatEnabled);

    if (!title) {
      return res.status(400).json({ message: "Room title is required." });
    }
    if (title.length > 120) {
      return res
        .status(400)
        .json({ message: "Room title must be 120 characters or less." });
    }
    if (!mediaId) {
      return res.status(400).json({ message: "Invalid media id." });
    }

    try {
      const result = await createRoomWithCode({
        userId: req.user.id,
        title,
        mediaId,
        mediaType,
        voiceChatEnabled,
        textChatEnabled,
      });
      return res.status(201).json({ room: result.rows[0] });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/api/rooms", requireAuth, async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT id, room_code, user_id, media_id, media_type, title,
                voice_chat_enabled, text_chat_enabled, created_at
         FROM rooms
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [req.user.id]
      );
      return res.json({ rooms: result.rows });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/api/rooms/code/:code", async (req, res, next) => {
    const code = (req.params.code || "").trim().toUpperCase();
    if (!code || code.length !== SHARE_CODE_LENGTH) {
      return res.status(400).json({ message: "Invalid room code." });
    }
    try {
      const result = await pool.query(
        `SELECT id, room_code, user_id, media_id, media_type, title,
                voice_chat_enabled, text_chat_enabled, created_at
         FROM rooms
         WHERE room_code = $1`,
        [code]
      );
      const room = result.rows[0];
      if (!room) {
        return res.status(404).json({ message: "Room not found." });
      }
      return res.json({ room });
    } catch (err) {
      return next(err);
    }
  });

  app.delete("/api/rooms/:roomId", requireAuth, async (req, res, next) => {
    const roomId = Number(req.params.roomId);
    if (!Number.isFinite(roomId)) {
      return res.status(400).json({ message: "Invalid room id." });
    }
    try {
      const result = await pool.query(
        "DELETE FROM rooms WHERE id = $1 AND user_id = $2 RETURNING id",
        [roomId, req.user.id]
      );
      if (!result.rows.length) {
        return res.status(404).json({ message: "Room not found." });
      }
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/api/lists", requireAuth, async (req, res, next) => {
    try {
      await ensureListCollaboratorsTable();
      const listsResult = await pool.query(
        `SELECT lists.id, lists.name, lists.share_code, lists.user_id,
                users.username AS owner_username, users.avatar AS owner_avatar
         FROM lists
         JOIN users ON users.id = lists.user_id
         LEFT JOIN list_collaborators lc
           ON lc.list_id = lists.id AND lc.user_id = $1
         WHERE lists.user_id = $1 OR lc.user_id = $1
         ORDER BY lists.created_at DESC`,
        [req.user.id]
      );
      const lists = listsResult.rows;
      if (!lists.length) {
        return res.json({ lists: [] });
      }
      const listIds = lists.map((list) => list.id);
      const collaboratorsResult = await pool.query(
        `SELECT lc.list_id, users.id, users.username, users.avatar
         FROM list_collaborators lc
         JOIN users ON users.id = lc.user_id
         WHERE lc.list_id = ANY($1)`,
        [listIds]
      );
      const collaboratorsByList = new Map();
      collaboratorsResult.rows.forEach((row) => {
        if (!collaboratorsByList.has(row.list_id)) {
          collaboratorsByList.set(row.list_id, []);
        }
        collaboratorsByList.get(row.list_id).push({
          id: row.id,
          username: row.username || "User",
          avatar: row.avatar || "",
        });
      });
      const itemsResult = await pool.query(
        `SELECT list_id, tmdb_id, media_type, title, poster_path, release_date
         FROM list_items
         WHERE list_id = ANY($1)
         ORDER BY created_at DESC`,
        [listIds]
      );
      const itemsByList = new Map();
      itemsResult.rows.forEach((row) => {
        if (!itemsByList.has(row.list_id)) {
          itemsByList.set(row.list_id, []);
        }
        itemsByList.get(row.list_id).push({
          id: row.tmdb_id,
          mediaType: row.media_type,
          title: row.title,
          poster_path: row.poster_path,
          release_date: row.release_date,
        });
      });
      const payload = lists.map((list) => {
        const isOwner = list.user_id === req.user.id;
        const owner = {
          id: list.user_id,
          username: list.owner_username || "User",
          avatar: list.owner_avatar || "",
        };
        const collaborators = [
          owner,
          ...(collaboratorsByList.get(list.id) || []),
        ].filter(
          (member, index, arr) =>
            arr.findIndex((entry) => entry.id === member.id) === index
        );
        return {
          id: list.id,
          name: list.name,
          shareCode: list.share_code || "",
          isOwner,
          owner,
          collaborators,
          movies: itemsByList.get(list.id) || [],
        };
      });
      return res.json({ lists: payload });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/api/lists", requireAuth, async (req, res, next) => {
    const name = (req.body?.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "List name is required." });
    }
    try {
      const result = await createListWithShareCode(req.user.id, name);
      return res.status(201).json({ list: result.rows[0] });
    } catch (err) {
      if (err?.code === "23505") {
        return res.status(409).json({ message: "List already exists." });
      }
      return next(err);
    }
  });

  const resolveImportedListName = async (userId, baseName) => {
    const trimmed = (baseName || "").trim() || "Imported list";
    const existing = await pool.query(
      "SELECT name FROM lists WHERE user_id = $1",
      [userId]
    );
    const existingNames = new Set(
      existing.rows.map((row) => (row.name || "").toLowerCase())
    );
    if (!existingNames.has(trimmed.toLowerCase())) {
      return trimmed;
    }
    const suffixBase = `${trimmed} (imported)`;
    if (!existingNames.has(suffixBase.toLowerCase())) {
      return suffixBase;
    }
    let index = 2;
    while (index < 50) {
      const candidate = `${trimmed} (imported ${index})`;
      if (!existingNames.has(candidate.toLowerCase())) {
        return candidate;
      }
      index += 1;
    }
    return `${trimmed} (imported ${Date.now()})`;
  };

  app.post("/api/lists/import", requireAuth, async (req, res, next) => {
    const shareCode = (req.body?.shareCode || "").trim().toUpperCase();
    if (!shareCode || shareCode.length !== SHARE_CODE_LENGTH) {
      return res.status(400).json({ message: "Invalid share code." });
    }
    try {
      const sourceResult = await pool.query(
        "SELECT id, name FROM lists WHERE share_code = $1",
        [shareCode]
      );
      const source = sourceResult.rows[0];
      if (!source) {
        return res.status(404).json({ message: "Shared list not found." });
      }
      const newName = await resolveImportedListName(req.user.id, source.name);
      const created = await createListWithShareCode(req.user.id, newName);
      const newList = created.rows[0];

      await pool.query(
        `INSERT INTO list_items (list_id, tmdb_id, media_type, title, poster_path, release_date)
         SELECT $1, tmdb_id, media_type, title, poster_path, release_date
         FROM list_items
         WHERE list_id = $2
         ON CONFLICT DO NOTHING`,
        [newList.id, source.id]
      );

      return res.status(201).json({
        list: {
          id: newList.id,
          name: newList.name,
          shareCode: newList.share_code,
        },
      });
    } catch (err) {
      return next(err);
    }
  });

  app.patch("/api/lists/:listId", requireAuth, async (req, res, next) => {
    const listId = Number(req.params.listId);
    if (!Number.isFinite(listId)) {
      return res.status(400).json({ message: "Invalid list id." });
    }
    const name = (req.body?.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "List name is required." });
    }
    try {
      const listResult = await pool.query(
        "SELECT id FROM lists WHERE id = $1 AND user_id = $2",
        [listId, req.user.id]
      );
      if (!listResult.rows.length) {
        return res.status(404).json({ message: "List not found." });
      }
      const result = await pool.query(
        "UPDATE lists SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING id, name",
        [name, listId, req.user.id]
      );
      return res.json({ list: result.rows[0] });
    } catch (err) {
      if (err?.code === "23505") {
        return res.status(409).json({ message: "List already exists." });
      }
      return next(err);
    }
  });

  app.post("/api/lists/:listId/items", requireAuth, async (req, res, next) => {
    const listId = Number(req.params.listId);
    if (!Number.isFinite(listId)) {
      return res.status(400).json({ message: "Invalid list id." });
    }
    const tmdbId = Number(req.body?.tmdbId);
    const mediaType = req.body?.mediaType === "tv" ? "tv" : "movie";
    if (!Number.isFinite(tmdbId)) {
      return res.status(400).json({ message: "Invalid movie id." });
    }
    try {
      await ensureListCollaboratorsTable();
      const listResult = await pool.query(
        `SELECT lists.id
         FROM lists
         LEFT JOIN list_collaborators lc
           ON lc.list_id = lists.id AND lc.user_id = $2
         WHERE lists.id = $1 AND (lists.user_id = $2 OR lc.user_id = $2)`,
        [listId, req.user.id]
      );
      if (!listResult.rows.length) {
        return res.status(404).json({ message: "List not found." });
      }
      const itemTitle = req.body?.title || req.body?.name || null;
      await pool.query(
        `INSERT INTO list_items
         (list_id, tmdb_id, media_type, title, poster_path, release_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          listId,
          tmdbId,
          mediaType,
          itemTitle,
          req.body?.posterPath || null,
          req.body?.releaseDate || null,
        ]
      );
      return res.status(201).json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  app.delete(
    "/api/lists/:listId/items/:tmdbId",
    requireAuth,
    async (req, res, next) => {
      const listId = Number(req.params.listId);
      const tmdbId = Number(req.params.tmdbId);
      if (!Number.isFinite(listId) || !Number.isFinite(tmdbId)) {
        return res.status(400).json({ message: "Invalid list or movie id." });
      }
      try {
        await ensureListCollaboratorsTable();
        const listResult = await pool.query(
          `SELECT lists.id
           FROM lists
           LEFT JOIN list_collaborators lc
             ON lc.list_id = lists.id AND lc.user_id = $2
           WHERE lists.id = $1 AND (lists.user_id = $2 OR lc.user_id = $2)`,
          [listId, req.user.id]
        );
        if (!listResult.rows.length) {
          return res.status(404).json({ message: "List not found." });
        }
        await pool.query(
          "DELETE FROM list_items WHERE list_id = $1 AND tmdb_id = $2",
          [listId, tmdbId]
        );
        return res.json({ ok: true });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.delete("/api/account/avatar", requireAuth, async (req, res, next) => {
    if (!b2KeyId || !b2Key || !b2Bucket || !b2Endpoint) {
      return res.status(500).json({ message: "Missing B2 configuration." });
    }
    try {
      const current = await pool.query(
        "SELECT avatar FROM users WHERE id = $1",
        [req.user.id]
      );
      const avatarUrl = current.rows?.[0]?.avatar || "";
      if (!avatarUrl) {
        const cleared = await pool.query(
          "UPDATE users SET avatar = NULL WHERE id = $1 RETURNING id, email, username, avatar",
          [req.user.id]
        );
        return res.json({ user: cleared.rows[0] });
      }
      let objectKey = "";
      try {
        const url = new URL(avatarUrl);
        const rawPath = url.pathname.replace(/^\/+/, "");
        objectKey = rawPath.startsWith(`${b2Bucket}/`)
          ? rawPath.slice(b2Bucket.length + 1)
          : rawPath;
      } catch (err) {
        objectKey = "";
      }
      const s3 = new S3Client({
        region: b2Region,
        endpoint: `https://${b2Endpoint}`,
        credentials: {
          accessKeyId: b2KeyId,
          secretAccessKey: b2Key,
        },
      });
      if (objectKey) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: b2Bucket,
            Key: objectKey,
          })
        );
      }
      const result = await pool.query(
        "UPDATE users SET avatar = NULL WHERE id = $1 RETURNING id, email, username, avatar",
        [req.user.id]
      );
      return res.json({ user: result.rows[0] });
    } catch (err) {
      return next(err);
    }
  });

  app.delete("/api/lists/:listId", requireAuth, async (req, res, next) => {
    const listId = Number(req.params.listId);
    if (!Number.isFinite(listId)) {
      return res.status(400).json({ message: "Invalid list id." });
    }
    try {
      const listResult = await pool.query(
        "SELECT id FROM lists WHERE id = $1 AND user_id = $2",
        [listId, req.user.id]
      );
      if (!listResult.rows.length) {
        return res.status(404).json({ message: "List not found." });
      }
      await pool.query("DELETE FROM list_items WHERE list_id = $1", [listId]);
      await pool.query("DELETE FROM lists WHERE id = $1 AND user_id = $2", [
        listId,
        req.user.id,
      ]);
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/api/lists/share/:code", async (req, res, next) => {
    const shareCode = (req.params.code || "").trim().toUpperCase();
    if (!shareCode || shareCode.length !== SHARE_CODE_LENGTH) {
      return res.status(400).json({ message: "Invalid share code." });
    }
    try {
      const listResult = await pool.query(
        `SELECT lists.id, lists.name, lists.share_code, users.username, users.avatar
         FROM lists
         JOIN users ON users.id = lists.user_id
         WHERE lists.share_code = $1`,
        [shareCode]
      );
      const list = listResult.rows[0];
      if (!list) {
        return res.status(404).json({ message: "Shared list not found." });
      }
      const itemsResult = await pool.query(
        `SELECT tmdb_id, media_type, title, poster_path, release_date
         FROM list_items
         WHERE list_id = $1
         ORDER BY created_at DESC`,
        [list.id]
      );
      const items = itemsResult.rows.map((row) => ({
        id: row.tmdb_id,
        mediaType: row.media_type,
        title: row.title,
        poster_path: row.poster_path,
        release_date: row.release_date,
      }));
      return res.json({
        list: {
          id: list.id,
          name: list.name,
          shareCode: list.share_code,
          owner: {
            username: list.username || "User",
            avatar: list.avatar || "",
          },
        },
        items,
      });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/api/lists/invite/accept", requireAuth, async (req, res, next) => {
    const shareCode = (req.body?.shareCode || "").trim().toUpperCase();
    if (!shareCode || shareCode.length !== SHARE_CODE_LENGTH) {
      return res.status(400).json({ message: "Invalid share code." });
    }
    try {
      await ensureListCollaboratorsTable();
      const listResult = await pool.query(
        "SELECT id, user_id FROM lists WHERE share_code = $1",
        [shareCode]
      );
      const list = listResult.rows[0];
      if (!list) {
        return res.status(404).json({ message: "Shared list not found." });
      }
      if (list.user_id === req.user.id) {
        return res.json({ ok: true, listId: list.id, already: true });
      }
      await pool.query(
        `INSERT INTO list_collaborators (list_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [list.id, req.user.id]
      );
      return res.json({ ok: true, listId: list.id });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/api/tmdb/category/:type/:category", async (req, res) => {
    const type = req.params.type === "tv" ? "tv" : "movie";
    const category = req.params.category || "";
    const path = TMDB_CATEGORY_MAP[type]?.[category];
    if (!path) {
      return res.status(400).json({ message: "Invalid TMDB category." });
    }
    const page = Number(req.query?.page) || 1;
    const result = await fetchTmdb(path, { page: String(page) });
    if (result.error) {
      return res.status(502).json({ message: result.error });
    }
    return res.json(result.data);
  });

  app.get("/api/tmdb/search/:type", async (req, res) => {
    const type = req.params.type === "tv" ? "tv" : "movie";
    const query = (req.query?.query || "").trim();
    if (!query) {
      return res.status(400).json({ message: "Query is required." });
    }
    const page = Number(req.query?.page) || 1;
    const result = await fetchTmdb(`/search/${type}`, {
      query,
      page: String(page),
      include_adult: "false",
    });
    if (result.error) {
      return res.status(502).json({ message: result.error });
    }
    return res.json(result.data);
  });

  app.get("/api/tmdb/search/multi", async (req, res) => {
    const query = (req.query?.query || "").trim();
    if (!query) {
      return res.status(400).json({ message: "Query is required." });
    }
    const page = Number(req.query?.page) || 1;
    const result = await fetchTmdb("/search/multi", {
      query,
      page: String(page),
      include_adult: "false",
    });
    if (result.error) {
      return res.status(502).json({ message: result.error });
    }
    return res.json(result.data);
  });

  app.get("/api/tmdb/details/:type/:id", async (req, res) => {
    const type = req.params.type === "tv" ? "tv" : "movie";
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Invalid TMDB id." });
    }
    const result = await fetchTmdb(`/${type}/${id}`);
    if (result.error) {
      return res.status(502).json({ message: result.error });
    }
    return res.json(result.data);
  });

  app.get("/api/tmdb/credits/:type/:id", async (req, res) => {
    const type = req.params.type === "tv" ? "tv" : "movie";
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Invalid TMDB id." });
    }
    const result = await fetchTmdb(`/${type}/${id}/credits`);
    if (result.error) {
      return res.status(502).json({ message: result.error });
    }
    return res.json(result.data);
  });

  app.get("/api/tmdb/similar/:type/:id", async (req, res) => {
    const type = req.params.type === "tv" ? "tv" : "movie";
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Invalid TMDB id." });
    }
    const result = await fetchTmdb(`/${type}/${id}/similar`);
    if (result.error) {
      return res.status(502).json({ message: result.error });
    }
    return res.json(result.data);
  });

  app.get("/api/tmdb/season/:tvId/:seasonNumber", async (req, res) => {
    const tvId = Number(req.params.tvId);
    const seasonNumber = Number(req.params.seasonNumber);
    if (!Number.isFinite(tvId) || !Number.isFinite(seasonNumber)) {
      return res.status(400).json({ message: "Invalid season request." });
    }
    const result = await fetchTmdb(`/tv/${tvId}/season/${seasonNumber}`);
    if (result.error) {
      return res.status(502).json({ message: result.error });
    }
    return res.json(result.data);
  });

  app.post("/api/ai/list", requireAuth, async (req, res) => {
    if (!openaiClient) {
      return res.status(500).json({ message: "Missing OpenAI configuration." });
    }
    if (!tmdbKey) {
      return res.status(500).json({ message: "Missing TMDB configuration." });
    }
    const prompt = (req.body?.prompt || "").trim();
    if (!prompt) {
      return res.status(400).json({ message: "Prompt is required." });
    }
    if (prompt.length > 200) {
      return res
        .status(400)
        .json({ message: "Prompt must be 200 characters or less." });
    }

    try {
      const response = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You create concise lists of movies or series. Return JSON with keys: title (string) and movies (array of 10 objects with title, year, genre, mediaType ('movie' or 'tv')). No extra keys.",
          },
          {
            role: "user",
            content: `Prompt: ${prompt}`,
          },
        ],
      });

      const content = response.choices?.[0]?.message?.content || "{}";
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        return res.status(502).json({ message: "AI response was invalid." });
      }
      const title = typeof parsed?.title === "string" ? parsed.title.trim() : "";
      const movies = Array.isArray(parsed?.movies) ? parsed.movies : [];
      const normalizedMovies = movies
        .filter((movie) => movie && typeof movie.title === "string")
        .slice(0, 10)
        .map((movie) => ({
          title: movie.title.trim(),
          year:
            typeof movie.year === "string" || typeof movie.year === "number"
              ? String(movie.year).trim()
              : "",
          genre: typeof movie.genre === "string" ? movie.genre.trim() : "",
          mediaType: movie?.mediaType === "tv" ? "tv" : "movie",
        }));

      if (!title || normalizedMovies.length === 0) {
        return res.status(502).json({ message: "AI response was incomplete." });
      }
      const resolved = await Promise.all(
        normalizedMovies.map(async (movie) => {
          const tmdbMatch = await searchTmdb(movie);
          if (!tmdbMatch) {
            return null;
          }
          return {
            ...movie,
            ...tmdbMatch,
          };
        })
      );
      const withIds = resolved.filter(Boolean);
      if (withIds.length === 0) {
        return res
          .status(502)
          .json({ message: "Unable to match titles on TMDB." });
      }
      return res.json({ title, movies: withIds });
    } catch (err) {
      return res.status(500).json({ message: "Unable to generate list." });
    }
  });

  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message });
    }
    if (err?.message === "Unsupported file type.") {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  });

  cachedApp = app;
  return cachedApp;
};
