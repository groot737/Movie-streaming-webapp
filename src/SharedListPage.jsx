import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MovieModal } from "./BrowsePage.jsx";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

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
  getMovieDetails: async (movieId, signal) => {
    return fetchApiJson(`/api/tmdb/details/movie/${movieId}`, signal);
  },
  getSeriesDetails: async (seriesId, signal) => {
    return fetchApiJson(`/api/tmdb/details/tv/${seriesId}`, signal);
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

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 50 } },
  };

  const heroBackdrop = items.length > 0 && items[0]?.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${items[0].backdrop_path}`
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-cyan-900/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-slate-800/10 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <header className="fixed top-0 inset-x-0 z-50 border-b border-slate-900/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
              G
            </div>
            <span className="font-semibold tracking-tight text-slate-100">Giostream</span>
          </div>
          <a
            href="#browse"
            className="group flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/50 border border-slate-800 text-sm font-medium text-slate-300 hover:text-white hover:border-slate-700 transition-all active:scale-95"
          >
            <span>Back to Browse</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right group-hover:translate-x-0.5 transition-transform"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
          </a>
        </div>
      </header>

      <main className="relative z-10 pt-24 pb-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <section className="relative rounded-3xl overflow-hidden mb-8 border border-slate-800 bg-slate-900 shadow-2xl shadow-black/50">
            {heroBackdrop && (
              <div className="absolute inset-0 z-0">
                <img src={heroBackdrop} alt="" className="w-full h-full object-cover opacity-30" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/50 to-transparent" />
              </div>
            )}

            <div className="relative z-10 p-6 sm:p-8 md:p-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
              <div className="max-w-2xl">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium tracking-wide uppercase mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" x2="12" y1="2" y2="15" /></svg>
                    Shared Collection
                  </div>
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-slate-400 tracking-tight leading-[1.1] mb-2">
                    {list?.name || <span className="animate-pulse bg-white/10 rounded w-64 inline-block h-[1em]"></span>}
                  </h1>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="flex items-center gap-4 text-slate-400"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                      <span className="text-[10px] font-bold text-slate-300">
                        {list?.owner?.username?.slice(0, 2).toUpperCase() || "?"}
                      </span>
                    </div>
                    <span className="text-xs">
                      Curated by <span className="text-slate-200 font-medium">{list?.owner?.username || "Unknown"}</span>
                    </span>
                  </div>
                  <span className="text-slate-700">•</span>
                  <div className="text-xs">
                    {items.length} {items.length === 1 ? 'Title' : 'Titles'}
                  </div>
                </motion.div>
              </div>

              {list?.shareCode && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-col items-end gap-1"
                >
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">List Code</div>
                  <div className="px-3 py-1.5 bg-slate-900/50 backdrop-blur border border-cyan-500/20 rounded-lg font-mono text-base tracking-widest text-cyan-400 shadow-inner shadow-cyan-500/5">
                    {list.shareCode}
                  </div>
                </motion.div>
              )}
            </div>
          </section>

          {/* List Grid */}
          <section>
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="aspect-[2/3] rounded-2xl bg-slate-900 animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Unavailable</h3>
                <p className="text-slate-400 max-w-sm">{error}</p>
              </div>
            ) : items.length ? (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6"
              >
                {items.map((movie) => (
                  <motion.div
                    key={`${movie.mediaType || "movie"}-${movie.id}`}
                    variants={itemVariants}
                    className="group relative cursor-pointer"
                    onClick={() => handleOpenMedia(movie, movie.mediaType || "movie")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && handleOpenMedia(movie, movie.mediaType || "movie")}
                  >
                    <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-slate-800 shadow-lg shadow-black/20 ring-1 ring-white/5 transition-all duration-300 group-hover:shadow-2xl group-hover:shadow-cyan-500/10 group-hover:scale-105 group-hover:ring-cyan-500/40">
                      {movie.poster_path ? (
                        <>
                          <img
                            src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                            alt={movie.title || "Shared item"}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="w-12 h-12 rounded-full bg-cyan-500/90 backdrop-blur-md flex items-center justify-center text-slate-900 transfrom translate-y-4 group-hover:translate-y-0 transition-transform duration-300 shadow-lg shadow-cyan-500/20">
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-slate-500 gap-2 p-4 text-center">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                          <span className="text-xs font-medium">No Poster</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 px-1">
                      <h3 className="text-sm font-semibold text-slate-100 leading-tight line-clamp-1 group-hover:text-cyan-400 transition-colors">
                        {movie.title || "Untitled"}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        <span className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-slate-400">
                          {(movie.release_date || "----").toString().slice(0, 4)}
                        </span>
                        <span>
                          {movie.mediaType === "tv" ? "TV Series" : "Movie"}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-900/50 p-16 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-500 mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-1">Empty Collection</h3>
                <p className="text-slate-400 text-sm">This shared list doesn't have any movies yet.</p>
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
