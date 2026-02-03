import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MovieModal } from "./BrowsePage.jsx";

const POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

const SORT_OPTIONS = {
  movie: [
    { value: "popularity.desc", label: "Popularity (high to low)" },
    { value: "popularity.asc", label: "Popularity (low to high)" },
    { value: "release_date.desc", label: "Release date (newest)" },
    { value: "release_date.asc", label: "Release date (oldest)" },
    { value: "vote_average.desc", label: "Rating (high to low)" },
    { value: "vote_average.asc", label: "Rating (low to high)" },
    { value: "vote_count.desc", label: "Vote count (high to low)" },
    { value: "revenue.desc", label: "Revenue (high to low)" },
  ],
  tv: [
    { value: "popularity.desc", label: "Popularity (high to low)" },
    { value: "popularity.asc", label: "Popularity (low to high)" },
    { value: "first_air_date.desc", label: "First air date (newest)" },
    { value: "first_air_date.asc", label: "First air date (oldest)" },
    { value: "vote_average.desc", label: "Rating (high to low)" },
    { value: "vote_average.asc", label: "Rating (low to high)" },
    { value: "vote_count.desc", label: "Vote count (high to low)" },
  ],
};

const fetchApiJson = async (path, signal) => {
  const res = await fetch(`${API_BASE}${path}`, {
    signal,
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || `Request failed (${res.status}).`;
    throw new Error(message);
  }
  return data;
};

const tmdbClient = {
  getGenres: async (type, signal) => {
    return fetchApiJson(`/api/tmdb/genres/${type}`, signal);
  },
  getMovieDetails: async (movieId, signal) => {
    return fetchApiJson(`/api/tmdb/details/movie/${movieId}`, signal);
  },
  getSeriesDetails: async (seriesId, signal) => {
    return fetchApiJson(`/api/tmdb/details/tv/${seriesId}`, signal);
  },
  discover: async (type, params, signal) => {
    const query = new URLSearchParams(params);
    return fetchApiJson(
      `/api/tmdb/discover/${type}?${query.toString()}`,
      signal
    );
  },
};

const emptyFilters = {
  mediaType: "movie",
  sortBy: "popularity.desc",
  genres: [],
  dateFrom: "",
  dateTo: "",
  ratingMin: "",
  ratingMax: "",
};

const hasValue = (value) => value !== "" && value !== null && value !== undefined;

const buildDiscoverParams = (filters, page) => {
  const params = {
    page: String(page),
    sort_by: filters.sortBy,
  };

  if (filters.genres.length) {
    params.with_genres = filters.genres.join(",");
  }

  if (hasValue(filters.ratingMin)) {
    params["vote_average.gte"] = String(filters.ratingMin);
  }
  if (hasValue(filters.ratingMax)) {
    params["vote_average.lte"] = String(filters.ratingMax);
  }
  if (filters.mediaType === "movie") {
    if (hasValue(filters.dateFrom)) {
      params["primary_release_date.gte"] = filters.dateFrom;
    }
    if (hasValue(filters.dateTo)) {
      params["primary_release_date.lte"] = filters.dateTo;
    }
  } else {
    if (hasValue(filters.dateFrom)) {
      params["first_air_date.gte"] = filters.dateFrom;
    }
    if (hasValue(filters.dateTo)) {
      params["first_air_date.lte"] = filters.dateTo;
    }
  }

  return params;
};

function DiscoverPage() {
  const [filters, setFilters] = useState(emptyFilters);
  const [genreData, setGenreData] = useState({ movie: [], tv: [] });
  const [genreLoading, setGenreLoading] = useState(false);
  const [genreError, setGenreError] = useState("");
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [submittedFilters, setSubmittedFilters] = useState(filters);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState("movie");
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  const abortRef = useRef(null);
  const detailsAbortRef = useRef(null);
  const detailsCacheRef = useRef({});

  const mediaType = filters.mediaType;
  const genreOptions = useMemo(
    () => genreData[mediaType] || [],
    [genreData, mediaType]
  );

  useEffect(() => {
    let active = true;
    setGenreLoading(true);
    setGenreError("");

    const controller = new AbortController();
    const run = async () => {
      try {
        const [movieGenres, tvGenres] = await Promise.all([
          tmdbClient.getGenres("movie", controller.signal),
          tmdbClient.getGenres("tv", controller.signal),
        ]);
        if (!active) return;
        setGenreData({
          movie: movieGenres?.genres || [],
          tv: tvGenres?.genres || [],
        });
      } catch (err) {
        if (!active || err.name === "AbortError") return;
        setGenreError(err.message || "Unable to load genres.");
      } finally {
        if (active) setGenreLoading(false);
      }
    };

    run();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      if (!submittedFilters) return;
      if (page === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError("");
      try {
        const params = buildDiscoverParams(submittedFilters, page);
        const data = await tmdbClient.discover(
          submittedFilters.mediaType,
          params,
          controller.signal
        );
        const nextResults = data?.results || [];
        setResults((prev) => (page === 1 ? nextResults : [...prev, ...nextResults]));
        setTotalPages(data?.total_pages || 1);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Discover failed. Please try again.");
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    };

    run();
    return () => controller.abort();
  }, [submittedFilters, page]);

  const handleToggleGenre = (genreId) => {
    setFilters((prev) => {
      const hasGenre = prev.genres.includes(genreId);
      const nextGenres = hasGenre
        ? prev.genres.filter((id) => id !== genreId)
        : [...prev.genres, genreId];
      return { ...prev, genres: nextGenres };
    });
  };

  const handleApply = () => {
    setPage(1);
    setResults([]);
    setTotalPages(1);
    setSubmittedFilters({ ...filters });
  };

  const handleClear = () => {
    setFilters(emptyFilters);
    setPage(1);
    setResults([]);
    setTotalPages(1);
    setSubmittedFilters({ ...emptyFilters });
  };

  const handleOpenMedia = async (media, type) => {
    const mediaType = type === "tv" ? "tv" : "movie";
    const cacheKey = `${mediaType}-${media.id}`;
    setSelectedMedia(media);
    setSelectedMediaType(mediaType);
    setDetailsError("");
    setDetails(null);
    if (detailsCacheRef.current[cacheKey]) {
      setDetails(detailsCacheRef.current[cacheKey]);
      return;
    }
    if (detailsAbortRef.current) {
      detailsAbortRef.current.abort();
    }
    const controller = new AbortController();
    detailsAbortRef.current = controller;
    setDetailsLoading(true);
    try {
      const data =
        mediaType === "movie"
          ? await tmdbClient.getMovieDetails(media.id, controller.signal)
          : await tmdbClient.getSeriesDetails(media.id, controller.signal);
      detailsCacheRef.current[cacheKey] = data;
      setDetails(data);
    } catch (err) {
      if (err.name !== "AbortError") {
        setDetailsError(err.message || "Unable to load details.");
      }
    } finally {
      setDetailsLoading(false);
    }
  };

  const hasMore = page < totalPages;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-900/80 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-400">
              Discover
            </div>
            <div className="text-lg font-semibold">Find your next watch</div>
          </div>
          <nav className="flex items-center gap-3 text-sm text-slate-300">
            <a href="#" className="hover:text-white transition">
              Home
            </a>
            <span className="text-slate-700">/</span>
            <span className="text-cyan-300">Discover</span>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <section className="rounded-3xl border border-slate-900 bg-slate-900/40 p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Filters</h2>
              <button
                onClick={handleClear}
                className="text-xs px-3 py-1.5 rounded-full border border-slate-700 text-slate-200 hover:border-slate-500 transition"
              >
                Clear all
              </button>
            </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Media type
              </label>
              <div className="mt-2 flex gap-2">
                {[
                  { id: "movie", label: "Movies" },
                  { id: "tv", label: "Series" },
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        mediaType: option.id,
                        genres: [],
                        sortBy:
                          SORT_OPTIONS[option.id]?.[0]?.value ||
                          prev.sortBy,
                      }))
                    }
                    className={`flex-1 px-3 py-2 rounded-xl text-sm border transition ${
                      mediaType === option.id
                        ? "bg-cyan-500/90 text-slate-950 border-cyan-400"
                        : "border-slate-800 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Sort by
              </label>
              <select
                value={filters.sortBy}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, sortBy: e.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
              >
                {SORT_OPTIONS[mediaType].map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Release window
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
                  }
                  style={{ colorScheme: "dark" }}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200"
                />
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                  }
                  style={{ colorScheme: "dark" }}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200"
                />
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {mediaType === "movie" ? "Release date" : "First air date"}
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Rating (TMDB)
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  placeholder="Min"
                  value={filters.ratingMin}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, ratingMin: e.target.value }))
                  }
                  className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200"
                />
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  placeholder="Max"
                  value={filters.ratingMax}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, ratingMax: e.target.value }))
                  }
                  className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200"
                />
              </div>
            </div>
          </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Genres
              </label>
              {genreError && (
                <div className="text-xs text-rose-300 mt-2">{genreError}</div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {genreLoading && (
                  <div className="text-xs text-slate-500">Loading genres...</div>
                )}
                {!genreLoading &&
                  genreOptions.map((genre) => {
                    const active = filters.genres.includes(genre.id);
                    return (
                      <button
                        key={`${mediaType}-${genre.id}`}
                        onClick={() => handleToggleGenre(genre.id)}
                        className={`px-3 py-1.5 rounded-full text-xs border transition ${
                          active
                            ? "bg-gradient-to-r from-cyan-400 to-teal-300 text-slate-950 border-cyan-300"
                            : "border-slate-800 text-slate-300 hover:border-slate-600"
                        }`}
                      >
                        {genre.name}
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleApply}
                className="px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-semibold hover:bg-cyan-300 transition"
              >
                Run discover
              </button>
              <div className="text-xs text-slate-500">
                Results update after running discover.
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <div className="rounded-3xl border border-slate-900 bg-slate-900/40 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Results</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Showing {results.length} items
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPage(1);
                    setResults([]);
                    setTotalPages(1);
                    setSubmittedFilters({ ...filters });
                  }}
                  className="text-xs px-3 py-1.5 rounded-full border border-slate-700 text-slate-200 hover:border-slate-500 transition"
                >
                  Refresh
                </button>
              </div>

              {error && (
                <div className="mt-4 text-sm text-rose-300">{error}</div>
              )}

              <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-5 mt-6">
                {loading &&
                  Array.from({ length: 10 }).map((_, idx) => (
                    <SkeletonCard key={`s-${idx}`} />
                  ))}
                {!loading &&
                  results.map((item) => (
                    <MediaCard
                      key={`${submittedFilters.mediaType}-${item.id}`}
                      item={item}
                      onClick={() =>
                        handleOpenMedia(item, submittedFilters.mediaType)
                      }
                    />
                  ))}
                {loadingMore &&
                  Array.from({ length: 6 }).map((_, idx) => (
                    <SkeletonCard key={`sm-${idx}`} />
                  ))}
              </div>

              {!loading && results.length === 0 && !error && (
                <div className="text-sm text-slate-400 mt-6">
                  No results found. Try widening your filters.
                </div>
              )}

              <div className="mt-8 flex items-center justify-center">
                {hasMore && (
                  <button
                    onClick={() => setPage((prev) => prev + 1)}
                    className="px-5 py-3 rounded-xl border border-slate-800 text-sm text-slate-300 hover:border-slate-600 transition"
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading..." : "Load more"}
                  </button>
                )}
              </div>
            </div>
        </section>
      </main>
      {selectedMedia && (
        <MovieModal
          movie={selectedMedia}
          mediaType={selectedMediaType}
          details={details}
          loading={detailsLoading}
          error={detailsError}
          onClose={() => {
            setSelectedMedia(null);
            setDetails(null);
            setDetailsError("");
          }}
        />
      )}
    </div>
  );
}

function MediaCard({ item, onClick }) {
  const poster = item.poster_path ? `${POSTER_BASE}${item.poster_path}` : null;
  const title = item.title || item.name || "Untitled";
  const releaseDate = item.release_date || item.first_air_date;
  const year = releaseDate ? releaseDate.slice(0, 4) : "--";
  const rating = item.vote_average ? item.vote_average.toFixed(1) : "--";

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
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
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
        <div className="text-sm font-semibold text-slate-100 line-clamp-1 min-h-[24px]">
          {title}
        </div>
        <div className="text-xs text-slate-400 mt-1">{year}</div>
      </div>
    </motion.button>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden animate-pulse">
      <div className="w-full aspect-[2/3] bg-slate-800/70" />
      <div className="p-3 space-y-2">
        <div className="h-3 rounded bg-slate-800/80" />
        <div className="h-3 w-1/2 rounded bg-slate-800/60" />
      </div>
    </div>
  );
}

export default DiscoverPage;
