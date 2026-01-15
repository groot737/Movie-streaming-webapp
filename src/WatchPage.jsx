import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

const POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const PROFILE_BASE = "https://image.tmdb.org/t/p/w185";
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
  getCredits: async (type, id, signal) => {
    return fetchApiJson(`/api/tmdb/credits/${type}/${id}`, signal);
  },
  getSimilar: async (type, id, signal) => {
    return fetchApiJson(`/api/tmdb/similar/${type}/${id}`, signal);
  },
  getSeason: async (tvId, seasonNumber, signal) => {
    return fetchApiJson(
      `/api/tmdb/season/${tvId}/${seasonNumber}`,
      signal
    );
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

function WatchPage({ mediaId = 550, mediaType = "movie" }) {
  const [details, setDetails] = useState(null);
  const [credits, setCredits] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [episodes, setEpisodes] = useState([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonError, setSeasonError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const similarRailRef = useRef(null);
  const castRailRef = useRef(null);
  const seasonAbortRef = useRef(null);
  const episodesRailRef = useRef(null);

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
        const [detailData, creditData, similarData] = await Promise.all([
          tmdbClient.getDetails(mediaType, mediaId, controller.signal),
          tmdbClient.getCredits(mediaType, mediaId, controller.signal),
          tmdbClient.getSimilar(mediaType, mediaId, controller.signal),
        ]);
        setDetails(detailData);
        setCredits(creditData);
        setSimilar(similarData?.results || []);
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

  useEffect(() => {
    if (mediaType !== "tv" || !details?.seasons?.length) {
      setEpisodes([]);
      setSeasonError("");
      return;
    }
    const seasonNumber = details.seasons.find(
      (season) => season.season_number === selectedSeason
    )
      ? selectedSeason
      : details.seasons[0].season_number;
    if (seasonNumber !== selectedSeason) {
      setSelectedSeason(seasonNumber);
      return;
    }
    if (seasonAbortRef.current) {
      seasonAbortRef.current.abort();
    }
    const controller = new AbortController();
    seasonAbortRef.current = controller;
    setSeasonLoading(true);
    setSeasonError("");

    const run = async () => {
      try {
        const data = await tmdbClient.getSeason(
          mediaId,
          seasonNumber,
          controller.signal
        );
        setEpisodes(data?.episodes || []);
      } catch (err) {
        if (err.name !== "AbortError") {
          setSeasonError(err.message || "Unable to load episodes.");
        }
      } finally {
        setSeasonLoading(false);
      }
    };

    run();

    return () => controller.abort();
  }, [details, mediaId, mediaType, selectedSeason]);

  const backdrop = details?.backdrop_path
    ? `${BACKDROP_BASE}${details.backdrop_path}`
    : null;
  const poster = details?.poster_path
    ? `${POSTER_BASE}${details.poster_path}`
    : null;
  const title = details?.title || details?.name || "Loading...";
  const releaseDate =
    details?.release_date || details?.first_air_date || "";
  const year = releaseDate ? releaseDate.slice(0, 4) : null;
  const runtime = formatRuntime(details, mediaType);
  const genres = details?.genres?.length
    ? details.genres.map((g) => g.name).join(" / ")
    : null;
  const rating = details?.vote_average
    ? details.vote_average.toFixed(1)
    : null;
  const imdbId = details?.imdb_id;
  const playerUrl =
    mediaType === "tv"
      ? `https://vidsrc-embed.ru/embed/tv?tmdb=${mediaId}&season=${selectedSeason}&episode=${selectedEpisode}`
      : imdbId
      ? `https://vidsrc-embed.ru/embed/movie/${imdbId}`
      : "";
  const seasonOptions =
    details?.seasons?.filter((season) => season.season_number > 0) || [];

  const cast = useMemo(
    () => credits?.cast?.slice(0, 12) || [],
    [credits]
  );

  const handleOpenSimilar = (item) => {
    const type = mediaType === "tv" ? "tv" : "movie";
    window.location.hash = `#watch?id=${item.id}&type=${type}`;
  };

  const scrollSimilar = (direction) => {
    if (!similarRailRef.current) return;
    const offset = direction === "left" ? -360 : 360;
    similarRailRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  const scrollCast = (direction) => {
    if (!castRailRef.current) return;
    const offset = direction === "left" ? -280 : 280;
    castRailRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  const scrollEpisodes = (direction) => {
    if (!episodesRailRef.current) return;
    const offset = direction === "left" ? -320 : 320;
    episodesRailRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="sticky top-0 z-40 backdrop-blur bg-slate-950/70 border-b border-slate-900/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="text-lg font-semibold tracking-tight">Giostream</div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
            <a href="#" className="hover:text-slate-100 transition">
              Home
            </a>
            <a href="#browse" className="hover:text-slate-100 transition">
              Browse
            </a>
          </nav>
          <div className="text-xs text-slate-400">
            {mediaType === "tv" ? "Series" : "Movie"} room
          </div>
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
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/90 to-slate-950" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6" />
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-4 space-y-12">
          {error && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
              <div>{error}</div>
            </div>
          )}

          <div className="space-y-8">
            <div className="space-y-4">
              <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen -mt-4 sm:-mt-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden mx-4 sm:mx-6">
                  <div className="aspect-[1/1] sm:aspect-[3/1] bg-slate-900">
                    {playerUrl ? (
                      <iframe
                        title="Player"
                        src={playerUrl}
                        className="h-full w-full"
                        frameBorder="0"
                        allowFullScreen
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-sm text-slate-400">
                        Player is loading...
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {mediaType === "tv" && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
                      Episodes
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-400" htmlFor="season">
                        Season
                      </label>
                      <div className="relative">
                        <select
                          id="season"
                          value={selectedSeason}
                          onChange={(e) =>
                            setSelectedSeason(Number(e.target.value))
                          }
                          className="appearance-none rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                        >
                          {seasonOptions.map((season) => (
                            <option
                              key={season.id}
                              value={season.season_number}
                            >
                              Season {season.season_number}
                            </option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">
                          ▼
                        </span>
                      </div>
                    </div>
                    <div className="ml-auto hidden sm:flex items-center gap-2">
                      <button
                        onClick={() => scrollEpisodes("left")}
                        className="h-8 w-8 rounded-full border border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-600 transition focus:outline-none focus:ring-2 focus:ring-cyan-500/60 flex items-center justify-center"
                        aria-label="Scroll episodes left"
                      >
                        <ArrowLeftIcon />
                      </button>
                      <button
                        onClick={() => scrollEpisodes("right")}
                        className="h-8 w-8 rounded-full border border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-600 transition focus:outline-none focus:ring-2 focus:ring-cyan-500/60 flex items-center justify-center"
                        aria-label="Scroll episodes right"
                      >
                        <ArrowRightIcon />
                      </button>
                    </div>
                  </div>
                  {seasonError && (
                    <div className="text-xs text-slate-400">{seasonError}</div>
                  )}
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-slate-950 to-transparent" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-slate-950 to-transparent" />
                    <div
                      ref={episodesRailRef}
                      className="flex gap-3 overflow-x-auto pb-2 pr-6 scrollbar-hide scroll-smooth"
                    >
                    {seasonLoading && (
                      <>
                        {Array.from({ length: 6 }).map((_, idx) => (
                          <div
                            key={`episode-skel-${idx}`}
                            className="h-10 w-40 rounded-full bg-slate-800 animate-pulse flex-shrink-0"
                          />
                        ))}
                      </>
                    )}
                    {!seasonLoading &&
                      episodes.map((episode) => (
                        <button
                          key={episode.id}
                          type="button"
                          onClick={() =>
                            setSelectedEpisode(episode.episode_number)
                          }
                          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition focus:outline-none focus:ring-2 focus:ring-cyan-500/60 flex-shrink-0 ${
                            selectedEpisode === episode.episode_number
                              ? "border-cyan-400 bg-cyan-500 text-slate-950"
                              : "border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-600"
                          }`}
                        >
                          <PlayIcon />
                          <span className="line-clamp-1">
                            Ep {episode.episode_number}: {episode.name}
                          </span>
                        </button>
                      ))}
                    {!seasonLoading && episodes.length === 0 && (
                      <div className="text-xs text-slate-500">
                        No episodes available.
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <motion.div initial="hidden" animate="show" variants={fadeUp}>
                <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-slate-400">
                  <span>Now playing</span>
                  {rating && (
                    <span className="px-2 py-1 rounded-full border border-slate-700 text-slate-200 tracking-normal">
                      {rating}
                    </span>
                  )}
                </div>
                <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight">
                  {title}
                </h1>
                <div className="mt-3 text-sm text-slate-300 flex flex-wrap gap-3">
                  {year && <span>{year}</span>}
                  {runtime && <span>{runtime}</span>}
                  {genres && <span>{genres}</span>}
                </div>
                <p className="mt-5 text-slate-300 max-w-2xl">
                  {details?.overview ||
                    "Discover the story, the cast, and similar picks below."}
                </p>
              </motion.div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
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
                    {details?.tagline || "Press play to start streaming."}
                  </div>
                </div>
              </div>
              <div className="text-sm text-slate-300">
                {details?.overview ||
                  "Discover the story, the cast, and similar picks below."}
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  Details
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-400">
                  <div>Language: {details?.original_language || "--"}</div>
                  <div>Status: {details?.status || "--"}</div>
                  {mediaType === "tv" && (
                    <div>
                      Seasons: {details?.number_of_seasons || "--"} / Episodes:{" "}
                      {details?.number_of_episodes || "--"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl sm:text-2xl font-semibold">Cast</h2>
              {loading && (
                <span className="text-xs text-slate-500">Loading...</span>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-4">
              <div className="text-xs text-slate-400">
                {cast.length} cast members
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={() => scrollCast("left")}
                  className="h-9 w-9 rounded-full border border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-600 transition focus:outline-none focus:ring-2 focus:ring-cyan-500/60 flex items-center justify-center"
                  aria-label="Scroll cast left"
                >
                  <ArrowLeftIcon />
                </button>
                <button
                  onClick={() => scrollCast("right")}
                  className="h-9 w-9 rounded-full border border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-600 transition focus:outline-none focus:ring-2 focus:ring-cyan-500/60 flex items-center justify-center"
                  aria-label="Scroll cast right"
                >
                  <ArrowRightIcon />
                </button>
              </div>
            </div>
            <div className="relative mt-4">
              <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-slate-950 to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-slate-950 to-transparent" />
              <div
                ref={castRailRef}
                className="flex gap-3 overflow-x-auto pb-4 pr-6 scrollbar-hide scroll-smooth"
              >
                {cast.map((person) => (
                  <div
                    key={person.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden flex-shrink-0 w-36"
                  >
                    <div className="aspect-[2/3] bg-slate-800">
                      {person.profile_path ? (
                        <img
                          src={`${PROFILE_BASE}${person.profile_path}`}
                          alt={person.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                          No photo
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="text-xs font-semibold text-slate-100 line-clamp-1">
                        {person.name}
                      </div>
                      <div className="text-[11px] text-slate-400 line-clamp-1 mt-1">
                        {person.character || "Cast"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl sm:text-2xl font-semibold">
                Similar titles
              </h2>
              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={() => scrollSimilar("left")}
                  className="h-9 w-9 rounded-full border border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-600 transition focus:outline-none focus:ring-2 focus:ring-cyan-500/60 flex items-center justify-center"
                  aria-label="Scroll left"
                >
                  <ArrowLeftIcon />
                </button>
                <button
                  onClick={() => scrollSimilar("right")}
                  className="h-9 w-9 rounded-full border border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-600 transition focus:outline-none focus:ring-2 focus:ring-cyan-500/60 flex items-center justify-center"
                  aria-label="Scroll right"
                >
                  <ArrowRightIcon />
                </button>
              </div>
            </div>
            <div className="relative mt-4">
              <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-slate-950 to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-slate-950 to-transparent" />
              <div
                ref={similarRailRef}
                className="flex gap-4 overflow-x-auto pb-4 pr-6 scrollbar-hide scroll-smooth"
              >
                {similar.map((item) => (
                  <SimilarCard
                    key={item.id}
                    item={item}
                    onSelect={() => handleOpenSimilar(item)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500">Powered by TMDB</div>
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

function SimilarCard({ item, onSelect }) {
  const poster = item.poster_path ? `${POSTER_BASE}${item.poster_path}` : null;
  const title = item.title || item.name || "Untitled";
  const releaseDate = item.release_date || item.first_air_date;
  const year = releaseDate ? releaseDate.slice(0, 4) : "--";
  const rating = item.vote_average ? item.vote_average.toFixed(1) : "--";

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden focus:outline-none focus:ring-2 focus:ring-cyan-500/60 hover:border-slate-600 transition flex-shrink-0 w-40"
    >
      <div className="relative w-full aspect-[2/3] bg-slate-800">
        {poster ? (
          <img
            src={poster}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
            No poster available
          </div>
        )}
        <div className="absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] bg-slate-950/80 border border-slate-700 text-slate-200">
          {rating}
        </div>
      </div>
      <div className="p-3">
        <div className="text-sm font-semibold text-slate-100 line-clamp-1 min-h-[24px]">
          {title}
        </div>
        <div className="text-xs text-slate-400 mt-1">{year}</div>
      </div>
    </button>
  );
}

export default WatchPage;

function PlayIcon() {
  return (
    <svg
      width="12"
      height="12"
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
