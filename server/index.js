import "dotenv/config";
import bcrypt from "bcrypt";
import cors from "cors";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db.js";

const app = express();
const PgSession = connectPgSimple(session);
const PORT = process.env.PORT || 3001;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "";
const corsOrigin = CLIENT_ORIGIN
  ? CLIENT_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
  : true;

app.set("trust proxy", 1);
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: SESSION_SECRET,
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
        return done(null, { id: user.id, email: user.email, username: user.username });
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

app.use(passport.initialize());
app.use(passport.session());

const passwordMeetsPolicy = (password) => {
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return password.length >= 8 && hasLetter && hasNumber;
};

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
    return res.status(400).json({ message: "Username must be at least 3 characters." });
  }
  if (normalizedUsername.length > 32) {
    return res.status(400).json({ message: "Username must be 32 characters or less." });
  }
  if (!password) {
    return res.status(400).json({ message: "Password is required." });
  }
  if (!passwordMeetsPolicy(password)) {
    return res.status(400).json({
      message: "Password must be at least 8 characters and include a letter and a number.",
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
      return res.status(401).json({ message: info?.message || "Invalid credentials." });
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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error." });
});

app.listen(PORT, () => {
  console.log(`Auth server running on port ${PORT}`);
});
