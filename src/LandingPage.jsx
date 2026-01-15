import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE = "https://image.tmdb.org/t/p/original";
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";
const fetchApiJson = async (path, signal) => {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data?.message || data?.status || `Request failed (${res.status}).`;
    throw new Error(message);
  }
  return data || {};
};

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how" },
  { label: "Discover", href: "#discover" },
  { label: "Safety", href: "#safety" },
  { label: "FAQ", href: "#faq" },
];

const FEATURES = [
  {
    title: "Synced playback",
    text: "Play, pause, and seek together in real time.",
    icon: SyncIcon,
  },
  {
    title: "Private room code",
    text: "Invite-only rooms with shareable codes.",
    icon: LockIcon,
  },
  {
    title: "Voice and text chat",
    text: "Quick reactions or full conversations.",
    icon: ChatIcon,
  },
  {
    title: "Reactions",
    text: "Send emoji bursts without interrupting.",
    icon: SmileIcon,
  },
  {
    title: "Tonight's queue",
    text: "Line up picks before you hit play.",
    icon: QueueIcon,
  },
  {
    title: "Device-friendly",
    text: "Optimized for mobile and desktop.",
    icon: DeviceIcon,
  },
];

const FAQS = [
  {
    q: "Is it public?",
    a: "No. Rooms are private by default and not listed anywhere.",
  },
  {
    q: "Do I need an account?",
    a: "Not required for basic use. Create a room and share a code.",
  },
  {
    q: "How do room codes work?",
    a: "Each room has a unique code. Only people with the code can join.",
  },
  {
    q: "Can I watch on mobile?",
    a: "Yes. GioStream is designed mobile-first.",
  },
  {
    q: "What content can I play?",
    a: "Only videos you already have access to via legal sources.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const stagger = {
  show: { transition: { staggerChildren: 0.08 } },
};

function LandingPage() {
  const [heroBackdrop, setHeroBackdrop] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = prev;
    };
  }, []);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          credentials: "include",
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        if (data?.user) {
          setCurrentUser(data.user);
        }
      } catch (err) {
        // Ignore session errors on load.
      }
    };
    fetchSession();
  }, []);

  const handleCreateRoom = () => {
    console.log("Create room");
  };

  const handleJoinRoom = () => {
    console.log("Join room");
  };

  const handleSignOut = async () => {
    setCurrentUser(null);
    try {
      await fetch(`${API_BASE}/api/auth/signout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      // Ignore sign out errors so UI can reset.
    }
  };

  const handleOpenAuth = (mode = "signin") => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Navbar
        onSignIn={() => handleOpenAuth("signin")}
        onJoin={handleJoinRoom}
        onSignOut={handleSignOut}
        user={currentUser}
      />

      <main className="relative">
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 bg-center bg-cover"
            style={{
              backgroundImage: heroBackdrop
                ? `url(${BACKDROP_BASE}${heroBackdrop})`
                : "radial-gradient(circle at top, rgba(14,165,233,0.15), rgba(2,6,23,0.9))",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/70 to-slate-950" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center">
              <motion.div initial="hidden" animate="show" variants={stagger}>
                <motion.div
                  variants={fadeUp}
                  className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  Personal watch rooms
                </motion.div>
                <motion.h1
                  variants={fadeUp}
                  className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight"
                >
                  Movie night, made simple.
                </motion.h1>
                <motion.p
                  variants={fadeUp}
                  className="mt-5 text-slate-300 max-w-xl"
                >
                  GioStream is a private watch room for two. Sync playback, chat,
                  and react together with the videos you already own or have
                  legal access to.
                </motion.p>
                <motion.div variants={fadeUp} className="mt-8 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleCreateRoom}
                    className="px-5 py-3 rounded-xl bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
                  >
                    Create a private room
                  </button>
                  <button
                    onClick={handleJoinRoom}
                    className="px-5 py-3 rounded-xl border border-slate-700 text-slate-100 hover:border-slate-500 transition"
                  >
                    Join with a code
                  </button>
                </motion.div>
                <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span className="px-3 py-1 rounded-full bg-slate-900/70 border border-slate-800">
                    Private rooms
                  </span>
                  <span className="px-3 py-1 rounded-full bg-slate-900/70 border border-slate-800">
                    Sync playback
                  </span>
                  <span className="px-3 py-1 rounded-full bg-slate-900/70 border border-slate-800">
                    No public listing
                  </span>
                  <span className="text-slate-500 self-center">Personal use only.</span>
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl"
              >
                <div className="rounded-xl bg-slate-800/70 border border-slate-700 h-44 sm:h-52 flex items-center justify-center text-slate-400">
                  Video player
                </div>
                <div className="mt-4 grid grid-cols-[1.2fr_0.8fr] gap-3">
                  <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3">
                    <div className="text-xs uppercase text-slate-500">
                      Room chat
                    </div>
                    <div className="mt-2 space-y-2 text-xs text-slate-300">
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-full bg-slate-700" />
                        <div className="flex-1 bg-slate-800/70 h-4 rounded" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-full bg-slate-700" />
                        <div className="flex-1 bg-slate-800/70 h-4 rounded" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3">
                    <div className="text-xs uppercase text-slate-500">
                      Invite code
                    </div>
                    <div className="mt-2 text-lg font-semibold text-cyan-400">
                      GIO-4821
                    </div>
                    <div className="mt-3 text-xs text-slate-400">
                      Private room
                    </div>
                    <button className="mt-3 text-xs px-3 py-2 rounded-lg bg-slate-800/70 border border-slate-700 hover:border-slate-500 transition">
                      Copy code
                    </button>
                  </div>
                </div>
                <div className="mt-4 rounded-xl bg-slate-900/70 border border-slate-800 p-3 text-xs text-slate-400">
                  Sync: 00:43:18 • 2 viewers • Reactions enabled
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <motion.section
          id="features"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-14"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp}
        >
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold">
                Everything you need for a private movie night
              </h2>
              <p className="text-slate-400 mt-3 max-w-2xl">
                Built for two people who want to watch together, without the
                noise of public streaming platforms.
              </p>
            </div>
          </div>
          <motion.div
            className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
          >
            {FEATURES.map((f) => (
              <motion.div key={f.title} variants={fadeUp}>
                <FeatureCard {...f} />
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        <motion.section
          id="how"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-14"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp}
        >
          <h2 className="text-2xl sm:text-3xl font-semibold">How it works</h2>
          <p className="text-slate-400 mt-3 max-w-2xl">
            Set up a room in seconds, invite your friend, and start watching.
          </p>
          <div className="mt-10 grid gap-6 lg:grid-cols-3 relative">
            <div className="hidden lg:block absolute left-0 right-0 top-6 h-px bg-slate-800" />
            {["Create a private room", "Invite your friend", "Start watching together"].map(
              (step, idx) => (
                <motion.div
                  key={step}
                  variants={fadeUp}
                  className="relative bg-slate-900/60 border border-slate-800 rounded-2xl p-6"
                >
                  <div className="h-10 w-10 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center font-semibold">
                    {idx + 1}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{step}</h3>
                  <p className="mt-2 text-slate-400 text-sm">
                    Lightweight setup with room controls ready when you are.
                  </p>
                </motion.div>
              )
            )}
          </div>
        </motion.section>

        <DiscoverSection onHeroBackdrop={setHeroBackdrop} />

        <motion.section
          className="max-w-6xl mx-auto px-4 sm:px-6 py-14"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp}
        >
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold">Room preview</h2>
              <p className="text-slate-400 mt-3 max-w-xl">
                A calm, focused interface built for two people.
              </p>
            </div>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <MockCard
              title="Player + queue"
              lines={4}
              blocks
              accent="bg-cyan-500/30"
            />
            <MockCard
              title="Chat + reactions"
              lines={5}
              blocks
              accent="bg-amber-500/30"
            />
            <MockCard
              title="Room settings"
              lines={3}
              blocks
              accent="bg-emerald-500/30"
            />
          </div>
        </motion.section>

        <motion.section
          id="safety"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-14"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp}
        >
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] items-start">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold">
                Private by default
              </h2>
              <p className="text-slate-400 mt-3">
                GioStream is built for personal use. Rooms are not indexed,
                shared only by code, and can include optional passwords.
              </p>
              <div className="mt-6 space-y-3 text-slate-300 text-sm">
                <div className="flex items-start gap-3">
                  <CheckIcon className="mt-0.5 text-cyan-400" />
                  <span>No public directory or searchable listing.</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckIcon className="mt-0.5 text-cyan-400" />
                  <span>Invite-only codes for two-person sessions.</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckIcon className="mt-0.5 text-cyan-400" />
                  <span>Optional password protection (UI only).</span>
                </div>
              </div>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
              <div className="text-sm uppercase text-slate-500">
                Privacy checklist
              </div>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li>Room codes rotate after each session</li>
                <li>Playback data stays between participants</li>
                <li>No third-party streaming or re-hosting</li>
              </ul>
            </div>
          </div>
        </motion.section>

        <motion.section
          id="faq"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-14"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp}
        >
          <h2 className="text-2xl sm:text-3xl font-semibold">
            Frequently asked questions
          </h2>
          <div className="mt-6 space-y-3">
            {FAQS.map((f) => (
              <FAQItem key={f.q} question={f.q} answer={f.a} />
            ))}
          </div>
        </motion.section>

        <motion.section
          className="max-w-6xl mx-auto px-4 sm:px-6 py-16"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp}
        >
          <div className="rounded-2xl bg-gradient-to-r from-cyan-500/20 via-slate-900/60 to-slate-900/80 border border-slate-800 p-8 sm:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold">
                Ready for movie night?
              </h2>
              <p className="text-slate-300 mt-2">
                Create a room, invite a friend, and press play.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCreateRoom}
                className="px-5 py-3 rounded-xl bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
              >
                Create Room
              </button>
              <button
                onClick={handleJoinRoom}
                className="px-5 py-3 rounded-xl border border-slate-700 text-slate-100 hover:border-slate-500 transition"
              >
                Join Room
              </button>
            </div>
          </div>
        </motion.section>
      </main>

      <footer className="border-t border-slate-900/80 bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 text-sm text-slate-400 flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <div className="font-semibold text-slate-200">Giostream</div>
            <div className="mt-1">Personal project. Private rooms only.</div>
          </div>
          <div className="space-y-1">
            <div>Powered by TMDB</div>
            <div>© 2026 GioStream</div>
          </div>
        </div>
      </footer>
      <AnimatePresence>
        {showAuthModal && (
          <AuthModal
            mode={authMode}
            onClose={() => setShowAuthModal(false)}
            onAuthSuccess={(user) => setCurrentUser(user)}
            onToggleMode={() =>
              setAuthMode((prev) => (prev === "signin" ? "register" : "signin"))
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Navbar({ onSignIn, onJoin, onSignOut, user }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 backdrop-blur bg-slate-950/70 border-b border-slate-900/80">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="text-lg font-semibold tracking-tight">Giostream</div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hover:text-slate-100 transition"
            >
              {link.label}
            </a>
          ))}
          {user && (
            <a href="#account" className="hover:text-slate-100 transition">
              My account
            </a>
          )}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <button
              onClick={onSignOut}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
            >
              Log out
            </button>
          ) : (
            <button
              onClick={onSignIn}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
            >
              Sign in
            </button>
          )}
          <button
            onClick={onJoin}
            className="px-4 py-2 rounded-lg border border-slate-700 hover:border-slate-500 transition"
          >
            Join Room
          </button>
        </div>
        <button
          className="md:hidden border border-slate-800 rounded-lg p-2"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <MenuIcon />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="md:hidden border-t border-slate-900/80 bg-slate-950/95 overflow-hidden"
          >
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 space-y-3">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="block text-sm text-slate-300"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              {user && (
                <a
                  href="#account"
                  className="block text-sm text-slate-300"
                  onClick={() => setOpen(false)}
                >
                  My account
                </a>
              )}
              <div className="flex flex-col gap-2 pt-2">
                {user ? (
                  <button
                    onClick={onSignOut}
                    className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium"
                  >
                    Log out
                  </button>
                ) : (
                  <button
                    onClick={onSignIn}
                    className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium"
                  >
                    Sign in
                  </button>
                )}
                <button
                  onClick={onJoin}
                  className="px-4 py-2 rounded-lg border border-slate-700"
                >
                  Join Room
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function FeatureCard({ title, text, icon: Icon }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
      <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center text-cyan-300">
        <Icon />
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-slate-400">{text}</p>
    </div>
  );
}

function DiscoverSection({ onHeroBackdrop }) {
  const [activeTab, setActiveTab] = useState("trending");
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const cacheRef = useRef({
    trending: null,
    topRated: null,
    search: {},
  });
  const abortRef = useRef(null);

  const segmentClass = (tab) =>
    `px-4 py-2 rounded-full text-sm transition ${activeTab === tab
      ? "bg-cyan-500 text-slate-950"
      : "border border-slate-800 text-slate-300 hover:border-slate-600"
    }`;

  const fetchTrendingMovies = async (signal) => {
    const data = await fetchApiJson(
      "/api/tmdb/category/movie/trending?page=1",
      signal
    );
    return data.results || [];
  };

  const fetchTopRatedMovies = async (signal) => {
    const data = await fetchApiJson(
      "/api/tmdb/category/movie/topRated?page=1",
      signal
    );
    return data.results || [];
  };

  const searchMovies = async (query, signal) => {
    const params = new URLSearchParams({ query, page: "1" });
    const data = await fetchApiJson(
      `/api/tmdb/search/movie?${params.toString()}`,
      signal
    );
    return data.results || [];
  };

  useEffect(() => {
    let ignoreCache = refreshKey > 0;

    if (activeTab === "search" && searchQuery.trim().length < 2) {
      setMovies([]);
      setError("");
      setLoading(false);
      return;
    }

    const cached =
      activeTab === "trending"
        ? cacheRef.current.trending
        : activeTab === "topRated"
          ? cacheRef.current.topRated
          : cacheRef.current.search[searchQuery];

    if (cached && !ignoreCache) {
      setMovies(cached);
      setLoading(false);
      setError("");
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      setLoading(true);
      setError("");
      try {
        let results = [];
        if (activeTab === "trending") {
          results = await fetchTrendingMovies(controller.signal);
          cacheRef.current.trending = results;
          if (!heroBackdropFromCache(onHeroBackdrop, results)) {
            onHeroBackdrop?.(results[0]?.backdrop_path || "");
          }
        } else if (activeTab === "topRated") {
          results = await fetchTopRatedMovies(controller.signal);
          cacheRef.current.topRated = results;
        } else {
          results = await searchMovies(searchQuery, controller.signal);
          cacheRef.current.search[searchQuery] = results;
        }
        setMovies(results);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Something went wrong.");
        }
      } finally {
        setLoading(false);
      }
    };

    run();

    return () => controller.abort();
  }, [activeTab, searchQuery, refreshKey, onHeroBackdrop]);

  const visibleMovies = useMemo(() => movies.slice(0, 12), [movies]);

  const handleSearch = (e) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed.length < 2) {
      setSearchQuery("");
      return;
    }
    setActiveTab("search");
    setSearchQuery(trimmed);
  };

  const handleRetry = () => {
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    if (activeTab !== "search") return;
    const trimmed = searchInput.trim();
    if (trimmed.length < 2) {
      setSearchQuery("");
      return;
    }
    const timeout = setTimeout(() => setSearchQuery(trimmed), 350);
    return () => clearTimeout(timeout);
  }, [activeTab, searchInput]);

  return (
    <motion.section
      id="discover"
      className="max-w-6xl mx-auto px-4 sm:px-6 py-14"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      variants={fadeUp}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-semibold">
            Trending tonight
          </h2>
          <p className="text-slate-400 mt-3 max-w-2xl">
            A preview of what is hot on TMDB, so you can decide what to queue
            up next.
          </p>
        </div>
        <form
          onSubmit={handleSearch}
          className="flex items-center gap-2 w-full sm:w-auto"
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search movies..."
            className="w-full sm:w-56 px-4 py-2 rounded-xl bg-slate-900/70 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
          />
          <button
            type="submit"
            disabled={searchInput.trim().length < 2}
            className="px-4 py-2 rounded-xl border border-slate-800 text-sm text-slate-300 hover:border-slate-600 transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            Search
          </button>
        </form>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          className={segmentClass("trending")}
          onClick={() => setActiveTab("trending")}
        >
          Trending
        </button>
        <button
          className={segmentClass("topRated")}
          onClick={() => setActiveTab("topRated")}
        >
          Top Rated
        </button>
        <button
          className={segmentClass("search")}
          onClick={() => {
            setActiveTab("search");
            setSearchQuery(searchInput.trim());
          }}
        >
          Search
        </button>
        {activeTab === "search" && searchQuery && (
          <button
            className="text-xs text-slate-400 hover:text-slate-200"
            onClick={() => {
              setActiveTab("trending");
              setSearchQuery("");
              setSearchInput("");
            }}
          >
            Clear search
          </button>
        )}
      </div>

      <div className="mt-8">
        {loading && <SkeletonGrid />}
        {!loading && error && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
            <div>{error}</div>
            <button
              className="mt-4 px-4 py-2 rounded-lg border border-slate-700 hover:border-slate-500 transition"
              onClick={handleRetry}
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && (
          <div className="grid grid-flow-col auto-cols-[150px] gap-4 overflow-x-auto pb-4 md:grid-flow-row md:grid-cols-4 lg:grid-cols-6 md:overflow-visible">
            {visibleMovies.map((movie) => (
              <motion.div key={movie.id} variants={fadeUp}>
                <MovieCard
                  movie={movie}
                  onClick={() => setSelectedMovie(movie)}
                />
              </motion.div>
            ))}
          </div>
        )}
        {!loading && !error && visibleMovies.length === 0 && (
          <div className="text-sm text-slate-400 mt-4">
            No movies found.
          </div>
        )}
        <div className="mt-4 text-xs text-slate-500">Powered by TMDB</div>
      </div>

      <AnimatePresence>
        {selectedMovie && (
          <MovieModal
            movie={selectedMovie}
            onClose={() => setSelectedMovie(null)}
          />
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function MovieCard({ movie, onClick }) {
  const poster = movie.poster_path ? `${POSTER_BASE}${movie.poster_path}` : null;
  const year = movie.release_date ? movie.release_date.slice(0, 4) : "-";
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "-";

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -4 }}
      className="group text-left rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden hover:border-slate-600 transition focus:outline-none focus:ring-2 focus:ring-cyan-500/60 flex h-full flex-col"
    >
      <div className="relative w-full aspect-[2/3] bg-slate-800 flex items-center justify-center">
        {poster ? (
          <img
            src={poster}
            alt={movie.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-xs text-slate-500 px-3 text-center">
            No poster available
          </div>
        )}
        <div className="absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] bg-slate-950/80 border border-slate-700 text-slate-200">
          {rating}
        </div>
      </div>
      <div className="p-3 flex flex-1 flex-col">
        <div className="text-sm font-semibold text-slate-100 line-clamp-2 min-h-[40px]">
          {movie.title}
        </div>
        <div className="text-xs text-slate-400 mt-1">{year}</div>
      </div>
    </motion.button>
  );
}

function AuthModal({ mode, onClose, onToggleMode, onAuthSuccess }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const closeButtonRef = useRef(null);
  const isSignIn = mode === "signin";

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    setFormError("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setIsSubmitting(false);
  }, [mode]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    const passwordHasLetter = /[A-Za-z]/.test(password);
    const passwordHasNumber = /[0-9]/.test(password);
    const passwordStrong = password.length >= 8 && passwordHasLetter && passwordHasNumber;

    if (!isSignIn && !trimmedUsername) {
      setFormError("Username is required.");
      return;
    }
    if (!isSignIn && trimmedUsername.length < 3) {
      setFormError("Username must be at least 3 characters.");
      return;
    }
    if (!isSignIn && trimmedUsername.length > 32) {
      setFormError("Username must be 32 characters or less.");
      return;
    }
    if (!trimmedEmail) {
      setFormError("Email is required.");
      return;
    }
    if (!password) {
      setFormError("Password is required.");
      return;
    }
    if (!isSignIn && !passwordStrong) {
      setFormError("Password must be at least 8 characters and include a letter and a number.");
      return;
    }
    if (!isSignIn && password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }
    setFormError("");
    setIsSubmitting(true);
    try {
      const endpoint = isSignIn ? "/api/auth/signin" : "/api/auth/signup";
      const body = isSignIn
        ? { email: trimmedEmail, password }
        : { email: trimmedEmail, username: trimmedUsername, password, confirmPassword };
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormError(data?.message || "Unable to authenticate. Please try again.");
        return;
      }
      if (data?.user) {
        onAuthSuccess?.(data.user);
      }
      onClose();
    } catch (err) {
      setFormError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
              GioStream
            </div>
            <h3 className="text-lg font-semibold">
              {isSignIn ? "Sign in" : "Create your account"}
            </h3>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="px-3 py-1 rounded-full text-xs bg-slate-900 border border-slate-700"
          >
            Close
          </button>
        </div>
        <form className="px-6 py-5 space-y-4" onSubmit={handleSubmit}>
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {formError}
            </div>
          )}
          {!isSignIn && (
            <div className="space-y-2">
              <label className="text-xs text-slate-400" htmlFor="landing-auth-username">
                Username
              </label>
              <input
                id="landing-auth-username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setFormError("");
                }}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                placeholder="yourname"
              />
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs text-slate-400" htmlFor="landing-auth-email">
              Email address
            </label>
            <input
              id="landing-auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFormError("");
              }}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-xs text-slate-400"
              htmlFor="landing-auth-password"
            >
              Password
            </label>
            <input
              id="landing-auth-password"
              type="password"
              autoComplete={isSignIn ? "current-password" : "new-password"}
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFormError("");
              }}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
              placeholder="••••••••"
            />
          </div>
          {!isSignIn && (
            <div className="space-y-2">
              <label
                className="text-xs text-slate-400"
                htmlFor="landing-auth-confirm"
              >
                Confirm password
              </label>
              <input
                id="landing-auth-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setFormError("");
                }}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                placeholder="••••••••"
              />
            </div>
          )}
          {!isSignIn && (
            <div className="text-xs text-slate-500">
              Password must be 8+ characters and include a letter and a number.
            </div>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
          >
            {isSubmitting
              ? isSignIn
                ? "Signing in..."
                : "Creating account..."
              : isSignIn
                ? "Sign in"
                : "Create account"}
          </button>
          <button
            type="button"
            onClick={onToggleMode}
            className="w-full text-xs text-slate-400 hover:text-slate-200 transition"
          >
            {isSignIn
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

function MovieModal({ movie, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const backdrop = movie.backdrop_path
    ? `${BACKDROP_BASE}${movie.backdrop_path}`
    : null;
  const handleCreateRoom = () => {
    window.location.hash = `#room?id=${movie.id}&type=movie`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden"
      >
        <div className="relative h-48 sm:h-64 bg-slate-800">
          {backdrop ? (
            <img src={backdrop} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-slate-500">
              No backdrop
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 px-3 py-1 rounded-full text-xs bg-slate-950/80 border border-slate-700"
          >
            Close
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-xl font-semibold">{movie.title}</h3>
            <div className="text-sm text-slate-400 mt-1">
              {movie.release_date || "Release date unknown"} •{" "}
              {movie.vote_average?.toFixed(1) || "—"} rating
            </div>
          </div>
          <p className="text-sm text-slate-300">
            {movie.overview || "No overview available."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium">
              Add to Tonight's Queue
            </button>
            <button
              onClick={handleCreateRoom}
              className="px-4 py-2 rounded-lg border border-slate-700"
            >
              Create room
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60">
      <button
        className="w-full p-4 flex items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-medium">{question}</span>
        <span className="text-slate-400">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="px-4 pb-4 text-sm text-slate-400">{answer}</div>}
    </div>
  );
}

function MockCard({ title, lines = 4, blocks = false, accent }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm uppercase text-slate-500">{title}</div>
        <div className={`h-2 w-10 rounded-full ${accent}`} />
      </div>
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }).map((_, idx) => (
          <div
            key={idx}
            className="h-3 rounded-full bg-slate-800/80"
            style={{ width: `${80 - idx * 6}%` }}
          />
        ))}
        {blocks && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="h-16 rounded-xl bg-slate-800/70" />
            <div className="h-16 rounded-xl bg-slate-800/70" />
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-flow-col auto-cols-[150px] gap-4 overflow-x-auto pb-4 md:grid-flow-row md:grid-cols-4 lg:grid-cols-6 md:overflow-visible">
      {Array.from({ length: 12 }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden animate-pulse"
        >
          <div className="h-48 bg-slate-800" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-slate-800 rounded" />
            <div className="h-3 bg-slate-800 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function heroBackdropFromCache(onHeroBackdrop, results) {
  if (!onHeroBackdrop) return true;
  if (!results || results.length === 0) return true;
  return false;
}

function MenuIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h6l-2-2" />
      <path d="M20 17h-6l2 2" />
      <path d="M4 7a8 8 0 0 1 12-2" />
      <path d="M20 17a8 8 0 0 1-12 2" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}

function SmileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="16" y2="12" />
      <line x1="4" y1="18" x2="12" y2="18" />
    </svg>
  );
}

function DeviceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="14" height="16" rx="2" />
      <rect x="17" y="8" width="4" height="8" rx="1" />
    </svg>
  );
}

function CheckIcon({ className = "" }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default LandingPage;
