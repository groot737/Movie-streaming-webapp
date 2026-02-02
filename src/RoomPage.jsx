import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

const POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE = "https://image.tmdb.org/t/p/original";

const fetchApiJson = async (path, signal) => {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || `Request failed (${res.status}).`;
    throw new Error(message);
  }
  return data;
};

const tmdbClient = {
  getDetails: async (type, id, signal) => {
    return fetchApiJson(`/api/tmdb/details/${type}/${id}`, signal);
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const formatRuntime = (details, mediaType) => {
  if (mediaType === "tv") {
    const runtime = details?.episode_run_time?.[0];
    return runtime ? `${runtime} min/ep` : null;
  }
  return details?.runtime ? `${details.runtime} min` : null;
};

function RoomPage({ mediaId = 550, mediaType = "movie" }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roomTitle, setRoomTitle] = useState("");
  const [voiceChatEnabled, setVoiceChatEnabled] = useState(true);
  const [textChatEnabled, setTextChatEnabled] = useState(true);
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const abortRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);


  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError("");

    const run = async () => {
      try {
        const response = await fetch(
          `https://consumet-eta-five.vercel.app/movies/flixhq/info?id=${mediaId}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error("Unable to load this title.");
        }
        const data = await response.json();
        setDetails(data);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Unable to load this title.");
        }
      } finally {
        setLoading(false);
      }
    };

    run();

    return () => controller.abort();
  }, [mediaId, mediaType]);

  const title = details?.title || "Loading...";
  const releaseDate = details?.releaseDate || "";
  const year = releaseDate ? releaseDate.slice(0, 4) : null;
  const runtime = details?.duration || null;
  const genres = Array.isArray(details?.genres)
    ? details.genres.join(" / ")
    : null;
  const rating = details?.rating ? details.rating.toFixed(1) : null;
  const poster = details?.image || null;
  const backdrop = details?.cover || null;

  useEffect(() => {
    if (!roomTitle && title && title !== "Loading...") {
      setRoomTitle(`${title} room`);
    }
  }, [roomTitle, title]);

  const summary = useMemo(
    () =>
      [year, runtime, genres, rating && `${rating} rating`]
        .filter(Boolean)
        .join(" / "),
    [genres, rating, runtime, year]
  );

  const handleCreateRoom = async () => {
    if (createLoading) return;
    setCreateError("");
    setCreateLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: roomTitle.trim(),
          mediaId,
          mediaType,
          voiceChatEnabled,
          textChatEnabled,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || "Unable to create room.");
      }
      const createdCode = data?.room?.room_code || "";
      setRoomCode(createdCode);
      window.location.hash = `#room-watch?code=${createdCode}`;
    } catch (err) {
      setCreateError(err.message || "Unable to create room.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
    } catch (err) {
      // Ignore clipboard failures to avoid blocking.
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="sticky top-0 z-40 backdrop-blur bg-slate-950/70 border-b border-slate-900/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a
              href="#browse"
              className="h-9 w-9 rounded-full border border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-600 transition flex items-center justify-center"
              aria-label="Back to browse"
            >
              <ArrowLeftIcon />
            </a>
            <div className="text-lg font-semibold tracking-tight">Giostream</div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
            <a href="#" className="hover:text-slate-100 transition">
              Home
            </a>
          </nav>
          <div className="text-xs text-slate-400">Room setup</div>
        </div>
      </header>

      <main className="relative">
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 bg-center bg-cover"
            style={{
              backgroundImage: backdrop
                ? `url(${backdrop})`
                : "radial-gradient(circle at top, rgba(14,165,233,0.12), rgba(2,6,23,0.95))",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/90 to-slate-950" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
            <motion.div initial="hidden" animate="show" variants={fadeUp}>
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Create a private room
              </div>
              <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight">
                {title}
              </h1>
              <div className="mt-3 text-sm text-slate-300 flex flex-wrap gap-3">
                {summary}
              </div>
            </motion.div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              {error && (
                <div className="text-sm text-slate-300">{error}</div>
              )}
              {loading && !error && (
                <div className="text-sm text-slate-400">Loading details...</div>
              )}
              {!loading && !error && (
                <div className="flex flex-wrap gap-5">
                  <div className="w-28 h-40 rounded-xl overflow-hidden bg-slate-800 flex-shrink-0">
                    {poster ? (
                      <img
                        src={poster}
                        alt={title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                        No poster
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 flex-1 min-w-[200px]">
                    <div className="text-2xl font-semibold">{title}</div>
                    <div className="text-sm text-slate-400">
                      {year || "----"} / {mediaType.toUpperCase()}
                    </div>
                    <div className="text-sm text-slate-300">
                      {details?.tagline || "Pick your room settings to begin."}
                    </div>
                    {summary && (
                      <div className="text-xs text-slate-400">{summary}</div>
                    )}
                  </div>
                </div>
              )}
              {!loading && !error && (
                <p className="mt-4 text-sm text-slate-300">
                  {details?.overview || "No overview available."}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
                Room details
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-300">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  Private room, invite-only access
                </div>
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Sync playback controls enabled
                </div>
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Flexible chat controls before you start
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
                Room title
              </div>
              <div className="mt-4 space-y-2">
                <label className="text-xs text-slate-400" htmlFor="room-title">
                  Set a title for your room
                </label>
                <input
                  id="room-title"
                  type="text"
                  value={roomTitle}
                  onChange={(event) => setRoomTitle(event.target.value)}
                  placeholder="Movie night"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                />
                <div className="text-xs text-slate-500">
                  Visible to anyone who joins your room.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
              <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
                Chat controls
              </div>
              <ToggleRow
                label="Voice chat"
                description="Voice is on by default for quick reactions."
                enabled={voiceChatEnabled}
                onToggle={() => setVoiceChatEnabled((prev) => !prev)}
              />
              <ToggleRow
                label="Text chat"
                description="Keep a running message thread."
                enabled={textChatEnabled}
                onToggle={() => setTextChatEnabled((prev) => !prev)}
              />
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-xs text-slate-400">
                You can change these settings anytime before you invite someone.
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Ready to invite?</div>
                <div className="text-xs text-slate-400 mt-1">
                  {roomCode
                    ? "Room created. Share the code with your friend."
                    : "Share your room code once you finalize the setup."}
                </div>
                {roomCode && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="px-3 py-1.5 rounded-full border border-cyan-400 bg-cyan-500/10 text-xs text-cyan-200 tracking-[0.2em]">
                      {roomCode}
                    </div>
                    <button
                      onClick={handleCopyCode}
                      className="text-xs px-3 py-1.5 rounded-full border border-slate-700 text-slate-200 hover:border-slate-500 transition"
                    >
                      Copy code
                    </button>
                  </div>
                )}
                {createError && (
                  <div className="mt-3 text-xs text-rose-300">{createError}</div>
                )}
              </div>
              <button
                onClick={handleCreateRoom}
                disabled={createLoading}
                className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {createLoading ? "Creating..." : "Create room"}
              </button>
            </div>
          </div>
        </section>
      </main>

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none bg-slate-950/40"
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ToggleRow({ label, description, enabled, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-slate-200">{label}</div>
        <div className="text-xs text-slate-400">{description}</div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={enabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${enabled
          ? "bg-cyan-500 border-cyan-400"
          : "bg-slate-800 border-slate-700"
          }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-slate-950 transition ${enabled ? "translate-x-6" : "translate-x-1"
            }`}
        />
      </button>
    </div>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export default RoomPage;
