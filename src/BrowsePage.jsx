import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { addMovieToList, getLists } from "./listStorage.js";

const POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE = "https://image.tmdb.org/t/p/original";
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

const NAV_LINKS = [
  { label: "Home", href: "#" },
  { label: "Browse", href: "#browse" },
  { label: "Join room", href: "#join-room", isAction: true },
];

const MOVIE_CATEGORY_LABELS = {
  trending: "Trending now",
  popular: "Popular on GioStream",
  topRated: "Top rated",
  upcoming: "Upcoming",
};

const SERIES_CATEGORY_LABELS = {
  trending: "Trending series",
  popular: "Popular series",
  topRated: "Top rated series",
  onTheAir: "On the air",
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

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
  getCategoryMovies: async (category, page, signal) => {
    const params = new URLSearchParams({ page: String(page) });
    return fetchApiJson(
      `/api/tmdb/category/movie/${category}?${params.toString()}`,
      signal
    );
  },
  getCategorySeries: async (category, page, signal) => {
    const params = new URLSearchParams({ page: String(page) });
    return fetchApiJson(
      `/api/tmdb/category/tv/${category}?${params.toString()}`,
      signal
    );
  },
  searchMovies: async (query, page, signal) => {
    const params = new URLSearchParams({
      query,
      page: String(page),
    });
    return fetchApiJson(
      `/api/tmdb/search/movie?${params.toString()}`,
      signal
    );
  },
  searchSeries: async (query, page, signal) => {
    const params = new URLSearchParams({
      query,
      page: String(page),
    });
    return fetchApiJson(
      `/api/tmdb/search/tv?${params.toString()}`,
      signal
    );
  },
  getMovieDetails: async (movieId, signal) => {
    return fetchApiJson(`/api/tmdb/details/movie/${movieId}`, signal);
  },
  getSeriesDetails: async (seriesId, signal) => {
    return fetchApiJson(`/api/tmdb/details/tv/${seriesId}`, signal);
  },
};

const buildEmptyRow = () => ({
  movies: [],
  loading: true,
  error: "",
  page: 1,
  totalPages: 1,
});

function BrowsePage() {
  const [movieRows, setMovieRows] = useState({
    trending: buildEmptyRow(),
    popular: buildEmptyRow(),
    topRated: buildEmptyRow(),
    upcoming: buildEmptyRow(),
  });
  const [seriesRows, setSeriesRows] = useState({
    trending: buildEmptyRow(),
    popular: buildEmptyRow(),
    topRated: buildEmptyRow(),
    onTheAir: buildEmptyRow(),
  });
  const [heroMovie, setHeroMovie] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const [searchResults, setSearchResults] = useState([]);
  const [searchFilter, setSearchFilter] = useState("all");
  const [searchTotalPages, setSearchTotalPages] = useState(1);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchRefreshKey, setSearchRefreshKey] = useState(0);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState("movie");
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [currentUser, setCurrentUser] = useState(null);
  const [showJoinRoomModal, setShowJoinRoomModal] = useState(false);

  const cacheRef = useRef({
    categories: {},
    seriesCategories: {},
    search: {},
    details: {},
  });
  const movieRowAbortRef = useRef({});
  const seriesRowAbortRef = useRef({});
  const searchAbortRef = useRef(null);

  const isSearchMode = searchQuery.trim().length > 0;

  useEffect(() => {
    const trimmed = searchInput.trim();
    const timeout = setTimeout(() => setSearchQuery(trimmed), 400);
    return () => clearTimeout(timeout);
  }, [searchInput]);

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

  useEffect(() => {
    setSearchPage(1);
    setSearchResults([]);
    setSearchTotalPages(1);
    setSearchError("");
    setSearchFilter("all");
  }, [searchQuery]);

  const hydrateSearchFromCache = (query, pageCount) => {
    const pages = [];
    for (let idx = 1; idx <= pageCount; idx += 1) {
      const pageData = cacheRef.current.search[query]?.[idx];
      if (!pageData) continue;
      if (pageData.movie?.results?.length) {
        pages.push(
          ...pageData.movie.results.map((item) => ({
            ...item,
            mediaType: "movie",
          }))
        );
      }
      if (pageData.tv?.results?.length) {
        pages.push(
          ...pageData.tv.results.map((item) => ({
            ...item,
            mediaType: "tv",
          }))
        );
      }
    }
    setSearchResults(pages);
  };

  const searchCounts = useMemo(
    () =>
      searchResults.reduce(
        (acc, item) => {
          if (item.mediaType === "tv") {
            acc.tv += 1;
          } else {
            acc.movie += 1;
          }
          acc.total += 1;
          return acc;
        },
        { total: 0, movie: 0, tv: 0 }
      ),
    [searchResults]
  );

  const filteredSearchResults = useMemo(() => {
    if (searchFilter === "movie") {
      return searchResults.filter((item) => item.mediaType === "movie");
    }
    if (searchFilter === "tv") {
      return searchResults.filter((item) => item.mediaType === "tv");
    }
    return searchResults;
  }, [searchResults, searchFilter]);

  const updateMovieRow = (category, patch) => {
    setMovieRows((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        ...patch,
      },
    }));
  };

  const updateSeriesRow = (category, patch) => {
    setSeriesRows((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        ...patch,
      },
    }));
  };

  const fetchMovieRow = async (category, force = false) => {
    if (movieRowAbortRef.current[category]) {
      movieRowAbortRef.current[category].abort();
    }
    const controller = new AbortController();
    movieRowAbortRef.current[category] = controller;

    const cached = cacheRef.current.categories[category]?.[1];
    if (cached && !force) {
      updateMovieRow(category, {
        movies: cached.results || [],
        totalPages: cached.total_pages || 1,
        loading: false,
        error: "",
      });
      if (category === "trending" && cached.results?.[0]) {
        setHeroMovie(cached.results[0]);
      }
      return;
    }

    updateMovieRow(category, { loading: true, error: "" });
    try {
      const response = await tmdbClient.getCategoryMovies(
        category,
        1,
        controller.signal
      );
      cacheRef.current.categories[category] = {
        ...(cacheRef.current.categories[category] || {}),
        1: response,
      };
      updateMovieRow(category, {
        movies: response.results || [],
        totalPages: response.total_pages || 1,
        loading: false,
        error: "",
      });
      if (category === "trending" && response.results?.[0]) {
        setHeroMovie(response.results[0]);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        updateMovieRow(category, {
          loading: false,
          error: err.message || "Something went wrong.",
        });
      }
    }
  };

  const fetchSeriesRow = async (category, force = false) => {
    if (seriesRowAbortRef.current[category]) {
      seriesRowAbortRef.current[category].abort();
    }
    const controller = new AbortController();
    seriesRowAbortRef.current[category] = controller;

    const cached = cacheRef.current.seriesCategories[category]?.[1];
    if (cached && !force) {
      updateSeriesRow(category, {
        movies: cached.results || [],
        totalPages: cached.total_pages || 1,
        loading: false,
        error: "",
      });
      return;
    }

    updateSeriesRow(category, { loading: true, error: "" });
    try {
      const response = await tmdbClient.getCategorySeries(
        category,
        1,
        controller.signal
      );
      cacheRef.current.seriesCategories[category] = {
        ...(cacheRef.current.seriesCategories[category] || {}),
        1: response,
      };
      updateSeriesRow(category, {
        movies: response.results || [],
        totalPages: response.total_pages || 1,
        loading: false,
        error: "",
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        updateSeriesRow(category, {
          loading: false,
          error: err.message || "Something went wrong.",
        });
      }
    }
  };

  useEffect(() => {
    Object.keys(MOVIE_CATEGORY_LABELS).forEach((category) => {
      fetchMovieRow(category);
    });
    Object.keys(SERIES_CATEGORY_LABELS).forEach((category) => {
      fetchSeriesRow(category);
    });
    return () => {
      Object.keys(movieRowAbortRef.current).forEach((category) => {
        movieRowAbortRef.current[category]?.abort();
      });
      Object.keys(seriesRowAbortRef.current).forEach((category) => {
        seriesRowAbortRef.current[category]?.abort();
      });
    };
  }, []);

  useEffect(() => {
    if (!isSearchMode) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchLoadingMore(false);
      setSearchError("");
      return;
    }
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    const cached = cacheRef.current.search[searchQuery]?.[searchPage];
    if (cached) {
      hydrateSearchFromCache(searchQuery, searchPage);
      const totalPages = Math.max(
        cached.movie?.total_pages || 1,
        cached.tv?.total_pages || 1
      );
      setSearchTotalPages(totalPages);
      setSearchLoading(false);
      setSearchLoadingMore(false);
      setSearchError("");
      return;
    }

    if (searchPage === 1) {
      setSearchLoading(true);
    } else {
      setSearchLoadingMore(true);
    }
    setSearchError("");

    const run = async () => {
      try {
        const [movieResult, seriesResult] = await Promise.allSettled([
          tmdbClient.searchMovies(searchQuery, searchPage, controller.signal),
          tmdbClient.searchSeries(searchQuery, searchPage, controller.signal),
        ]);

        const movieResponse =
          movieResult.status === "fulfilled" ? movieResult.value : null;
        const seriesResponse =
          seriesResult.status === "fulfilled" ? seriesResult.value : null;

        if (!movieResponse && !seriesResponse) {
          throw new Error("Search failed. Please try again.");
        }

        cacheRef.current.search[searchQuery] = {
          ...(cacheRef.current.search[searchQuery] || {}),
          [searchPage]: {
            movie: movieResponse,
            tv: seriesResponse,
          },
        };
        hydrateSearchFromCache(searchQuery, searchPage);
        const totalPages = Math.max(
          movieResponse?.total_pages || 1,
          seriesResponse?.total_pages || 1
        );
        setSearchTotalPages(totalPages);
      } catch (err) {
        if (err.name !== "AbortError") {
          setSearchError(err.message || "Something went wrong.");
        }
      } finally {
        setSearchLoading(false);
        setSearchLoadingMore(false);
      }
    };

    run();

    return () => controller.abort();
  }, [isSearchMode, searchQuery, searchPage, searchRefreshKey]);

  const searchHasMore = searchPage < searchTotalPages;

  const handleOpenMedia = async (media, type) => {
    setSelectedMedia(media);
    setSelectedMediaType(type);
    setDetails(null);
    setDetailsError("");
    const cacheKey = `${type}-${media.id}`;
    if (cacheRef.current.details[cacheKey]) {
      setDetails(cacheRef.current.details[cacheKey]);
      return;
    }
    setDetailsLoading(true);
    try {
      const controller = new AbortController();
      const data =
        type === "movie"
          ? await tmdbClient.getMovieDetails(media.id, controller.signal)
          : await tmdbClient.getSeriesDetails(media.id, controller.signal);
      cacheRef.current.details[cacheKey] = data;
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

  const handleOpenAuth = (mode = "signin") => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  const handleOpenJoinRoom = () => {
    setShowJoinRoomModal(true);
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

  const heroBackdrop = heroMovie?.backdrop_path
    ? `${BACKDROP_BASE}${heroMovie.backdrop_path}`
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Navbar
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        onSignIn={() => handleOpenAuth("signin")}
        onSignOut={handleSignOut}
        onJoinRoom={handleOpenJoinRoom}
        user={currentUser}
      />

      <main className="relative">
        <HeroBanner
          movie={heroMovie}
          backdrop={heroBackdrop}
          onOpen={(movie) => handleOpenMedia(movie, "movie")}
        />

        <section id="browse" className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
          {isSearchMode ? (
            <div>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">Search results</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Results for "{searchQuery}"
                  </p>
                </div>
                <button
                  className="text-xs px-3 py-1.5 rounded-full border border-slate-700 text-slate-100 bg-slate-900/70 hover:border-slate-500 hover:bg-slate-900 transition"
                  onClick={() => setSearchInput("")}
                >
                  Clear search
                </button>
              </div>

              {searchError && !searchLoading && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300 mt-6">
                  <div>{searchError}</div>
                  <button
                    className="mt-4 px-4 py-2 rounded-lg border border-slate-700 hover:border-slate-500 transition"
                    onClick={() => setSearchRefreshKey((k) => k + 1)}
                  >
                    Retry
                  </button>
                </div>
              )}

              {!searchLoading && !searchError && (
                <>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {[
                      { id: "all", label: `All (${searchCounts.total})` },
                      {
                        id: "movie",
                        label: `Movies (${searchCounts.movie})`,
                      },
                      { id: "tv", label: `Series (${searchCounts.tv})` },
                    ].map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setSearchFilter(option.id)}
                        className={`px-3 py-1.5 rounded-full text-xs border transition ${searchFilter === option.id
                          ? "bg-cyan-500 text-slate-950 border-cyan-400"
                          : "border-slate-800 text-slate-300 hover:border-slate-600"
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {filteredSearchResults.length === 0 && (
                    <div className="text-sm text-slate-400 mt-6">
                      {searchResults.length === 0
                        ? "No movies or series found."
                        : "No results for this filter."}
                    </div>
                  )}
                </>
              )}

              <MovieGrid
                movies={filteredSearchResults}
                loading={searchLoading}
                loadingMore={searchLoadingMore}
                onOpen={(item) =>
                  handleOpenMedia(item, item.mediaType || "movie")
                }
              />

              <div className="flex items-center justify-center mt-8">
                {searchHasMore && (
                  <button
                    onClick={() => setSearchPage((p) => p + 1)}
                    className="px-5 py-3 rounded-xl border border-slate-800 text-sm text-slate-300 hover:border-slate-600 transition"
                    disabled={searchLoadingMore}
                  >
                    {searchLoadingMore ? "Loading..." : "Load more"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {Object.keys(MOVIE_CATEGORY_LABELS).map((category) => (
                <MovieRow
                  key={category}
                  title={MOVIE_CATEGORY_LABELS[category]}
                  movies={movieRows[category].movies}
                  loading={movieRows[category].loading}
                  error={movieRows[category].error}
                  onRetry={() => fetchMovieRow(category, true)}
                  onOpen={(movie) => handleOpenMedia(movie, "movie")}
                />
              ))}
              <div className="pt-2">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold">Series</h2>
                  </div>
                </div>
              </div>
              {Object.keys(SERIES_CATEGORY_LABELS).map((category) => (
                <MovieRow
                  key={`series-${category}`}
                  title={SERIES_CATEGORY_LABELS[category]}
                  movies={seriesRows[category].movies}
                  loading={seriesRows[category].loading}
                  error={seriesRows[category].error}
                  onRetry={() => fetchSeriesRow(category, true)}
                  onOpen={(series) => handleOpenMedia(series, "tv")}
                />
              ))}
            </>
          )}

          <div className="text-xs text-slate-500">Powered by TMDB</div>
        </section>
      </main>

      <Footer />

      <AnimatePresence>
        {selectedMedia && (
          <MovieModal
            movie={selectedMedia}
            mediaType={selectedMediaType}
            details={details}
            loading={detailsLoading}
            error={detailsError}
            onClose={handleCloseMovie}
            canManageLists={Boolean(currentUser)}
          />
        )}
      </AnimatePresence>
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
      <AnimatePresence>
        {showJoinRoomModal && (
          <JoinRoomModal onClose={() => setShowJoinRoomModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Navbar({ searchInput, onSearchChange, onSignIn, onSignOut, onJoinRoom, user }) {
  const [open, setOpen] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  return (
    <header className="sticky top-0 z-50 backdrop-blur bg-slate-950/70 border-b border-slate-900/80">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div className="text-lg font-semibold tracking-tight">Giostream</div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => {
                if (link.isAction) {
                  e.preventDefault();
                  onJoinRoom();
                }
              }}
              className="hover:text-slate-100 transition"
            >
              {link.label}
            </a>
          ))}
          {user && (
            <a
              href="#account"
              className="text-slate-100 hover:text-slate-300 transition"
            >
              My account
            </a>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 rounded-full bg-slate-900/70 border border-slate-800 px-3 py-2">
            <SearchIcon />
            <input
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search movies & series..."
              className="bg-transparent text-sm text-slate-200 focus:outline-none w-52"
            />
          </div>
          <button
            onClick={() => setShowMobileSearch((v) => !v)}
            className="lg:hidden border border-slate-800 rounded-lg p-2"
            aria-label="Toggle search"
          >
            <SearchIcon />
          </button>
          {user ? (
            <button
              onClick={onSignOut}
              className="hidden sm:inline-flex px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
            >
              Log out
            </button>
          ) : (
            <button
              onClick={onSignIn}
              className="hidden sm:inline-flex px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
            >
              Sign in
            </button>
          )}
          <button
            className="md:hidden border border-slate-800 rounded-lg p-2"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      {showMobileSearch && (
        <div className="lg:hidden border-t border-slate-900/80 bg-slate-950/95">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
            <div className="flex items-center gap-2 rounded-full bg-slate-900/70 border border-slate-800 px-3 py-2">
              <SearchIcon />
              <input
                value={searchInput}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search movies & series..."
                className="bg-transparent text-sm text-slate-200 focus:outline-none w-full"
              />
            </div>
          </div>
        </div>
      )}

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
                  onClick={(e) => {
                    if (link.isAction) {
                      e.preventDefault();
                      onJoinRoom();
                    }
                    setOpen(false);
                  }}
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
              {user ? (
                <button
                  onClick={onSignOut}
                  className="w-full px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium"
                >
                  Log out
                </button>
              ) : (
                <button
                  onClick={onSignIn}
                  className="w-full px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium"
                >
                  Sign in
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function HeroBanner({ movie, backdrop, onOpen }) {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{
          backgroundImage: backdrop
            ? `url(${backdrop})`
            : "radial-gradient(circle at top, rgba(14,165,233,0.12), rgba(2,6,23,0.95))",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/80 to-slate-950" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Featured tonight
          </div>
          <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight">
            {movie?.title || "Movie night, curated"}
          </h1>
          <p className="mt-5 text-slate-300 max-w-xl">
            {movie?.overview ||
              "Explore trending, top rated, and upcoming picks powered by TMDB."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => movie && onOpen(movie)}
              className="px-5 py-3 rounded-xl bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
              disabled={!movie}
            >
              More info
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function MovieRow({ title, movies, loading, error, onRetry, onOpen }) {
  const railRef = useRef(null);

  const scrollRail = (direction) => {
    if (!railRef.current) return;
    const offset = direction === "left" ? -360 : 360;
    railRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl sm:text-2xl font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          {error && (
            <button
              onClick={onRetry}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Retry
            </button>
          )}
          <button
            className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-600 transition"
            onClick={() => scrollRail("left")}
            aria-label="Scroll left"
          >
            <ArrowLeftIcon />
          </button>
          <button
            className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-600 transition"
            onClick={() => scrollRail("right")}
            aria-label="Scroll right"
          >
            <ArrowRightIcon />
          </button>
        </div>
      </div>
      {error && (
        <div className="text-sm text-slate-400 mt-3">{error}</div>
      )}
      <div className="relative mt-4">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-slate-950 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-slate-950 to-transparent" />
        <div
          ref={railRef}
          className="flex gap-4 overflow-x-auto pb-4 pr-6 scrollbar-hide scroll-smooth"
        >
          {loading &&
            Array.from({ length: 8 }).map((_, idx) => (
              <SkeletonCard key={idx} size="row" />
            ))}
          {!loading &&
            movies.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                size="row"
                onClick={() => onOpen(movie)}
              />
            ))}
        </div>
      </div>
    </section>
  );
}

function MovieGrid({ movies, loading, loadingMore, onOpen }) {
  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6 mt-6">
      {loading &&
        Array.from({ length: 12 }).map((_, idx) => <SkeletonCard key={idx} />)}
      {!loading &&
        movies.map((movie) => (
          <MovieCard
            key={`${movie.mediaType || "movie"}-${movie.id}`}
            movie={movie}
            onClick={() => onOpen(movie)}
          />
        ))}
      {loadingMore &&
        Array.from({ length: 6 }).map((_, idx) => (
          <SkeletonCard key={`more-${idx}`} />
        ))}
    </div>
  );
}

function MovieCard({ movie, onClick, size = "grid" }) {
  const poster = movie.poster_path ? `${POSTER_BASE}${movie.poster_path}` : null;
  const title = movie.title || movie.name || "Untitled";
  const releaseDate = movie.release_date || movie.first_air_date;
  const year = releaseDate ? releaseDate.slice(0, 4) : "--";
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "--";

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -4 }}
      className={`group text-left rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden hover:border-slate-600 transition focus:outline-none focus:ring-2 focus:ring-cyan-500/60 flex h-full flex-col ${size === "row" ? "w-40 flex-shrink-0" : ""
        }`}
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
      setFormError("Username is required!");
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
              <label className="text-xs text-slate-400" htmlFor="auth-username">
                Username
              </label>
              <input
                id="auth-username"
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
            <label className="text-xs text-slate-400" htmlFor="auth-email">
              Email address
            </label>
            <input
              id="auth-email"
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
            <label className="text-xs text-slate-400" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
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
                htmlFor="auth-confirm"
              >
                Confirm password
              </label>
              <input
                id="auth-confirm"
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

function JoinRoomModal({ onClose }) {
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
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
    const trimmedCode = roomCode.trim().toUpperCase();

    if (!trimmedCode) {
      setError("Room code is required.");
      return;
    }

    setError("");
    setIsChecking(true);

    try {
      const response = await fetch(`${API_BASE}/api/rooms/code/${trimmedCode}`, {
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.message || "Room not found.");
        return;
      }

      // Room exists, redirect to room-watch page
      window.location.hash = `#room-watch?code=${trimmedCode}`;
      onClose();
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsChecking(false);
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
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Join Room</h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-slate-800 flex items-center justify-center hover:border-slate-600 transition"
            aria-label="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-slate-300" htmlFor="room-code">
              Enter room code
            </label>
            <input
              id="room-code"
              type="text"
              autoComplete="off"
              autoFocus
              required
              value={roomCode}
              onChange={(e) => {
                setRoomCode(e.target.value.toUpperCase());
                setError("");
              }}
              placeholder="XXXXXX"
              maxLength={6}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60 uppercase tracking-widest text-center text-lg font-mono"
            />
          </div>

          {error && (
            <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isChecking}
            className="w-full px-4 py-3 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isChecking ? "Checking..." : "Join Room"}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

export function MovieModal({
  movie,
  mediaType,
  details,
  loading,
  error,
  onClose,
  canManageLists = true,
}) {
  const closeButtonRef = useRef(null);
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [listFeedback, setListFeedback] = useState("");
  const [listError, setListError] = useState("");

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
    if (!canManageLists) return;
    let active = true;
    const loadLists = async () => {
      const result = await getLists();
      if (!active) return;
      if (result?.error) {
        setListError(result.error);
        setLists([]);
        return;
      }
      const storedLists = result.lists || [];
      setLists(storedLists);
      if (storedLists.length && !selectedListId) {
        setSelectedListId(storedLists[0].id);
      }
    };
    loadLists();
    return () => {
      active = false;
    };
  }, [movie.id, selectedListId, canManageLists]);

  const backdropPath = details?.backdrop_path || movie.backdrop_path;
  const backdrop = backdropPath ? `${BACKDROP_BASE}${backdropPath}` : null;

  const title = movie.title || movie.name || "Untitled";
  const runtimeValue =
    mediaType === "tv" ? details?.episode_run_time?.[0] : details?.runtime;
  const runtime = runtimeValue ? `${runtimeValue} min` : null;
  const releaseDate = movie.release_date || movie.first_air_date;
  const year = releaseDate ? releaseDate.slice(0, 4) : null;
  const genres = details?.genres?.length
    ? details.genres.map((g) => g.name).join(" / ")
    : null;
  const ratingValue = movie.vote_average ? movie.vote_average.toFixed(1) : null;
  const seasons =
    mediaType === "tv" && details?.number_of_seasons
      ? `${details.number_of_seasons} seasons`
      : null;
  const metaParts = [
    year,
    runtime,
    genres,
    ratingValue && `${ratingValue} rating`,
  ]
    .filter(Boolean)
    .concat(seasons ? [seasons] : []);
  const handleWatch = () => {
    const type = mediaType === "tv" ? "tv" : "movie";
    window.location.hash = `#watch?id=${movie.id}&type=${type}`;
  };



  const handleAddToList = async () => {
    if (!selectedListId) {
      setListError("Select a list first.");
      setListFeedback("");
      return;
    }
    setListError("");
    setListFeedback("");
    const result = await addMovieToList(selectedListId, { ...movie, mediaType });
    if (result?.error) {
      setListError(result.error);
      setListFeedback("");
      return;
    }
    const refresh = await getLists();
    if (refresh?.error) {
      setListError(refresh.error);
      return;
    }
    setLists(refresh.lists || []);
    setListError("");
    setListFeedback("Added to your list.");
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
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent" />
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="absolute top-3 right-3 px-3 py-1 rounded-full text-xs bg-slate-950/80 border border-slate-700"
          >
            Close
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-xl font-semibold">{title}</h3>
            <div className="text-sm text-slate-400 mt-1">
              {metaParts.join(" / ")}
            </div>
          </div>
          {loading && (
            <div className="text-sm text-slate-400">Loading details...</div>
          )}
          {error && <div className="text-sm text-slate-400">{error}</div>}
          {!loading && !error && (
            <p className="text-sm text-slate-300">
              {details?.overview || movie.overview || "No overview available."}
            </p>
          )}
          {canManageLists && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-wide uppercase text-slate-200">
                    My lists
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Add this title to a list.
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-col sm:flex-row gap-3">
                <select
                  value={selectedListId}
                  onChange={(event) => {
                    setSelectedListId(event.target.value);
                    setListError("");
                    setListFeedback("");
                  }}
                  className="flex-1 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                >
                  {lists.length === 0 && (
                    <option value="">No lists yet</option>
                  )}
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddToList}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:border-slate-500 transition"
                >
                  Add to list
                </button>
              </div>
              {listError && (
                <div className="mt-2 text-[11px] text-rose-300">
                  {listError}
                </div>
              )}
              {listFeedback && (
                <div className="mt-2 text-[11px] text-emerald-300">
                  {listFeedback}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleWatch}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium inline-flex items-center gap-2"
            >
              <PlayIcon />
              Watch
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SkeletonCard({ size = "grid" }) {
  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden animate-pulse ${size === "row" ? "w-40 flex-shrink-0" : ""
        }`}
    >
      <div className="w-full aspect-[2/3] bg-slate-800" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-slate-800 rounded w-3/4" />
        <div className="h-3 bg-slate-800 rounded w-1/3" />
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-900/80 bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 text-sm text-slate-400 flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <div className="font-semibold text-slate-200">Giostream</div>
          <div className="mt-1">Personal project. Private rooms only.</div>
        </div>
        <div className="space-y-1">
          <div>Powered by TMDB</div>
          <div>(c) 2026 GioStream</div>
        </div>
      </div>
    </footer>
  );
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

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="8 5 19 12 8 19 8 5" />
    </svg>
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

function ArrowRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default BrowsePage;
