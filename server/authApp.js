import bcrypt from "bcrypt";
import cors from "cors";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db.js";

let cachedApp;

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
            "SELECT id, email, username, password_hash FROM users WHERE email = $1",
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
        "SELECT id, email, username FROM users WHERE id = $1",
        [id]
      );
      const user = result.rows[0];
      if (!user) {
        return done(null, false);
      }
      return done(null, user);
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

export const getAuthApp = () => {
  if (cachedApp) {
    return cachedApp;
  }

  const app = express();
  const PgSession = connectPgSimple(session);
  const sessionSecret = process.env.SESSION_SECRET || "dev-secret-change-me";

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
        "INSERT INTO users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING id, email, username",
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

  app.get("/api/lists", requireAuth, async (req, res, next) => {
    try {
      const listsResult = await pool.query(
        "SELECT id, name FROM lists WHERE user_id = $1 ORDER BY created_at DESC",
        [req.user.id]
      );
      const lists = listsResult.rows;
      if (!lists.length) {
        return res.json({ lists: [] });
      }
      const listIds = lists.map((list) => list.id);
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
      const payload = lists.map((list) => ({
        id: list.id,
        name: list.name,
        movies: itemsByList.get(list.id) || [],
      }));
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
      const result = await pool.query(
        "INSERT INTO lists (user_id, name) VALUES ($1, $2) RETURNING id, name",
        [req.user.id, name]
      );
      return res.status(201).json({ list: result.rows[0] });
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
      const listResult = await pool.query(
        "SELECT id FROM lists WHERE id = $1 AND user_id = $2",
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

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  });

  cachedApp = app;
  return cachedApp;
};
