import React, { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { MovieModal } from "./BrowsePage.jsx";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

const TMDB_API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_TMDB_API_KEY) ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_TMDB_API_KEY) ||
  "";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const buildTmdbUrl = (path, params = {}) => {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  const searchParams = new URLSearchParams(params);
  searchParams.set("api_key", TMDB_API_KEY);
  url.search = searchParams.toString();
  return url.toString();
};

const fetchTmdbJson = async (url, signal) => {
  const res = await fetch(url, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data?.status_message || `TMDB request failed (${res.status}).`;
    throw new Error(message);
  }
  return data;
};

const tmdbClient = {
  getMovieDetails: async (movieId, signal) => {
    const url = buildTmdbUrl(`/movie/${movieId}`);
    return fetchTmdbJson(url, signal);
  },
  getSeriesDetails: async (seriesId, signal) => {
    const url = buildTmdbUrl(`/tv/${seriesId}`);
    return fetchTmdbJson(url, signal);
  },
};

function SharedListPage({ code = "" }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState("movie");
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  useEffect(() => {
    const normalized = (code || "").trim();
    if (!normalized) {
      setError("Missing share code.");
      setLoading(false);
      return;
    }
    let active = true;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `${API_BASE}/api/lists/share/${encodeURIComponent(normalized)}`
        );
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) {
          setError(data?.message || "Unable to load shared list.");
          setList(null);
          setItems([]);
          return;
        }
        setList(data?.list || null);
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        if (!active) return;
        setError("Network error. Please try again.");
        setList(null);
        setItems([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [code]);

  const handleOpenMedia = async (media, type) => {
    setSelectedMedia(media);
    setSelectedMediaType(type);
    setDetails(null);
    setDetailsError("");
    if (!TMDB_API_KEY) {
      setDetailsError("Missing TMDB API key.");
      return;
    }
    setDetailsLoading(true);
    try {
      const controller = new AbortController();
      const data =
        type === "tv"
          ? await tmdbClient.getSeriesDetails(media.id, controller.signal)
          : await tmdbClient.getMovieDetails(media.id, controller.signal);
      setDetails(data);
    } catch (err) {
      setDetailsError(err.message || "Unable to load details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleCloseMovie = () => {
    setSelectedMedia(null);
    setDetails(null);
    setDetailsError("");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-900/80 bg-slate-950/70 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="text-lg font-semibold tracking-tight">Giostream</div>
          <a
            href="#browse"
            className="text-sm text-slate-300 hover:text-slate-100 transition"
          >
            Back to browse
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col gap-6">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Shared list
            </div>
            <div className="text-base text-slate-400 mt-2">
              {list?.owner?.username
                ? `${list.owner.username} shared list`
                : "Shared list"}
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold mt-2">
              {list?.name || "Browse the shared picks."}
            </h1>
          </div>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            {loading ? (
              <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">
                Loading shared list...
              </div>
            ) : error ? (
              <div className="rounded-xl border border-dashed border-rose-500/40 bg-rose-500/10 p-10 text-center text-sm text-rose-100">
                {error}
              </div>
            ) : items.length ? (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-slate-400">
                    {items.length} items
                  </div>
                  <div className="text-xs text-slate-500">
                    Code: {list?.shareCode || code}
                  </div>
                </div>
                <div className="mt-5 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                  {items.map((movie) => (
                    <div
                      key={`${movie.mediaType || "movie"}-${movie.id}`}
                      className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        handleOpenMedia(movie, movie.mediaType || "movie")
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleOpenMedia(movie, movie.mediaType || "movie");
                        }
                      }}
                    >
                      <div className="relative aspect-[2/3] bg-slate-800">
                        {movie.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                            alt={movie.title || "Shared item"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                            No poster
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="text-sm font-semibold text-slate-100 line-clamp-1">
                          {movie.title || "Untitled"}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {(movie.release_date || "--").toString().slice(0, 4)} •{" "}
                          {movie.mediaType === "tv" ? "Series" : "Movie"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">
                This list is empty.
              </div>
            )}
          </section>
        </div>
      </main>
      <AnimatePresence>
        {selectedMedia && (
          <MovieModal
            movie={selectedMedia}
            mediaType={selectedMediaType}
            details={details}
            loading={detailsLoading}
            error={detailsError}
            onClose={handleCloseMovie}
            canManageLists={false}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default SharedListPage;
