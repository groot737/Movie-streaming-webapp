import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

const requestAiList = async (prompt) => {
  const response = await fetch(`${API_BASE}/api/ai/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ prompt }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || "Unable to generate list.");
  }
  return data;
};

function AiPromptModal({ onClose, onSelect }) {
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const closeButtonRef = useRef(null);

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Prompt is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await requestAiList(trimmed);
      setTitle(data?.title || trimmed);
      setResults(Array.isArray(data?.movies) ? data.movies : []);
    } catch (err) {
      setError(err.message || "Unable to generate list.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setTitle("");
    setResults([]);
    setError("");
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
        className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
              GioStream
            </div>
            <h3 className="text-lg font-semibold">Ask AI</h3>
            <p className="text-xs text-slate-400 mt-1">
              Describe a vibe and we will pick a movie or series.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="px-3 py-1 rounded-full text-xs bg-slate-900 border border-slate-700"
          >
            Close
          </button>
        </div>

        {results.length === 0 ? (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-slate-400" htmlFor="ai-prompt">
                Prompt
              </label>
              <input
                id="ai-prompt"
                type="text"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Cozy rainy-night sci‑fi with strong female lead"
                className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
            >
              {loading ? "Generating..." : "Generate picks"}
            </button>
            {error && <div className="text-xs text-rose-300">{error}</div>}
          </form>
        ) : (
          <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-slate">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  List
                </div>
                <div className="text-lg font-semibold mt-1">{title}</div>
              </div>
              <button
                type="button"
                onClick={reset}
                className="px-3 py-1.5 rounded-full text-xs border border-slate-700 text-slate-200 hover:border-slate-500 transition"
              >
                New prompt
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {results.map((item) => {
                const poster = item.poster_path
                  ? `${POSTER_BASE}${item.poster_path}`
                  : null;
                const titleText = item.title || item.name || "Untitled";
                const releaseDate = item.release_date || item.first_air_date;
                const year = releaseDate ? releaseDate.slice(0, 4) : "--";
                const rating = item.vote_average
                  ? item.vote_average.toFixed(1)
                  : "--";
                const mediaType = item.mediaType === "tv" ? "Series" : "Movie";
                return (
                  <button
                    key={`${item.mediaType || "movie"}-${item.id}`}
                    onClick={() => onSelect?.(item)}
                    className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-left hover:border-slate-600 transition"
                  >
                    <div className="w-16 h-24 rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center shrink-0">
                      {poster ? (
                        <img
                          src={poster}
                          alt={titleText}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="text-[10px] text-slate-500 text-center px-2">
                          No poster
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-100 line-clamp-1">
                        {titleText}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {mediaType} · {year}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Rating {rating}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {error && <div className="text-xs text-rose-300">{error}</div>}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default AiPromptModal;
