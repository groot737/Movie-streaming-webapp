import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MovieModal } from "./BrowsePage.jsx";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

const POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const PROFILE_BASE = "https://image.tmdb.org/t/p/w300";

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
  getPerson: async (id, signal) => {
    return fetchApiJson(`/api/tmdb/person/${id}`, signal);
  },
  getCredits: async (id, signal) => {
    return fetchApiJson(`/api/tmdb/person/${id}/credits`, signal);
  },
  getDetails: async (type, id, signal) => {
    return fetchApiJson(`/api/tmdb/details/${type}/${id}`, signal);
  },
};

const normalizeCredits = (credits) => {
  const items = credits?.cast || [];
  const byKey = new Map();
  items.forEach((item) => {
    const mediaType = item.media_type === "tv" ? "tv" : "movie";
    const key = `${mediaType}-${item.id}`;
    if (!byKey.has(key)) {
      byKey.set(key, { ...item, media_type: mediaType });
    }
  });
  return Array.from(byKey.values());
};

const sortByRecency = (items) => {
  return [...items].sort((a, b) => {
    const dateA = a.release_date || a.first_air_date || "";
    const dateB = b.release_date || b.first_air_date || "";
    if (dateA && dateB) {
      return dateB.localeCompare(dateA);
    }
    return (b.popularity || 0) - (a.popularity || 0);
  });
};

function ActorPage({ personId = 0 }) {
  const [person, setPerson] = useState(null);
  const [credits, setCredits] = useState(null);
  const [filter, setFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState("movie");
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const abortRef = useRef(null);
  const detailsAbortRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!personId) return;
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError("");

    const run = async () => {
      try {
        const [personData, creditData] = await Promise.all([
          tmdbClient.getPerson(personId, controller.signal),
          tmdbClient.getCredits(personId, controller.signal),
        ]);
        setPerson(personData);
        setCredits(creditData);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Unable to load this actor.");
        }
      } finally {
        setLoading(false);
      }
    };

    run();

    return () => controller.abort();
  }, [personId]);

  const hero = person?.profile_path
    ? `${PROFILE_BASE}${person.profile_path}`
    : null;
  const backdrop = person?.known_for_department
    ? "radial-gradient(circle at top, rgba(14,165,233,0.12), rgba(2,6,23,0.95))"
    : null;
  const name = person?.name || "Loading...";
  const knownFor = person?.known_for_department || "Actor";
  const bio = person?.biography || "";

  const allCredits = useMemo(
    () => sortByRecency(normalizeCredits(credits)),
    [credits]
  );

  const filteredCredits = useMemo(() => {
    if (filter === "movie") {
      return allCredits.filter((item) => item.media_type === "movie");
    }
    if (filter === "tv") {
      return allCredits.filter((item) => item.media_type === "tv");
    }
    return allCredits;
  }, [allCredits, filter]);

  useEffect(() => {
    setVisibleCount(12);
  }, [filter, personId]);

  const visibleCredits = useMemo(
    () => filteredCredits.slice(0, visibleCount),
    [filteredCredits, visibleCount]
  );

  const canViewMore = visibleCount < filteredCredits.length;

  useEffect(() => {
    if (!selectedMedia) return;
    if (detailsAbortRef.current) {
      detailsAbortRef.current.abort();
    }
    const controller = new AbortController();
    detailsAbortRef.current = controller;
    setDetailsLoading(true);
    setDetailsError("");
    const run = async () => {
      try {
        const data = await tmdbClient.getDetails(
          selectedMediaType,
          selectedMedia.id,
          controller.signal
        );
        setDetails(data);
      } catch (err) {
        if (err.name !== "AbortError") {
          setDetailsError(err.message || "Unable to load details.");
        }
      } finally {
        setDetailsLoading(false);
      }
    };
    run();
    return () => controller.abort();
  }, [selectedMedia, selectedMediaType]);

  const handleOpenTitle = (item) => {
    const type = item.media_type === "tv" ? "tv" : "movie";
    setSelectedMedia(item);
    setSelectedMediaType(type);
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
          </nav>
          <div className="text-xs text-slate-400">Actor filmography</div>
        </div>
      </header>

      <main className="relative">
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 bg-center bg-cover"
            style={{
              backgroundImage: backdrop
                ? backdrop
                : "radial-gradient(circle at top, rgba(14,165,233,0.12), rgba(2,6,23,0.95))",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/90 to-slate-950" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
              <div className="flex flex-wrap gap-5">
                <div className="w-28 h-36 rounded-xl overflow-hidden bg-slate-800 flex-shrink-0">
                  {hero ? (
                    <img
                      src={hero}
                      alt={name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                      No photo
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-xl font-semibold">{name}</div>
                  <div className="text-sm text-slate-400">{knownFor}</div>
                  {person?.also_known_as?.length ? (
                    <div className="text-xs text-slate-500">
                      Also known as: {person.also_known_as
                        .slice(0, 3)
                        .join(", ")}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="text-sm text-slate-300">
                {bio || "Biography not available yet."}
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
          <div>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl sm:text-2xl font-semibold">
                Filmography
              </h2>
              {loading && (
                <span className="text-xs text-slate-500">Loading...</span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {[
                { key: "all", label: "All" },
                { key: "movie", label: "Movies" },
                { key: "tv", label: "TV Shows" },
              ].map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setFilter(chip.key)}
                  className={`rounded-full border px-4 py-1.5 text-xs uppercase tracking-[0.2em] transition ${
                    filter === chip.key
                      ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="mt-6">
              {error && (
                <div className="text-sm text-slate-300">{error}</div>
              )}
              {!error && !loading && filteredCredits.length === 0 && (
                <div className="text-sm text-slate-400">
                  No titles found for this actor.
                </div>
              )}
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {visibleCredits.map((item) => {
                  const poster = item.poster_path
                    ? `${POSTER_BASE}${item.poster_path}`
                    : null;
                  const title = item.title || item.name || "Untitled";
                  const releaseDate =
                    item.release_date || item.first_air_date || "";
                  const year = releaseDate ? releaseDate.slice(0, 4) : "--";
                  const typeLabel = item.media_type === "tv" ? "TV" : "Movie";

                  return (
                    <button
                      key={`${item.media_type}-${item.id}`}
                      type="button"
                      onClick={() => handleOpenTitle(item)}
                      className="group rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden text-left focus:outline-none focus:ring-2 focus:ring-cyan-500/60 hover:border-slate-600 transition"
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
                            No poster
                          </div>
                        )}
                      </div>
                      <div className="p-3 space-y-1">
                        <div className="text-sm font-semibold text-slate-100 line-clamp-2">
                          {title}
                        </div>
                        <div className="text-xs text-slate-400">
                          {year} - {typeLabel}
                        </div>
                        <div className="text-[11px] text-slate-500 line-clamp-1">
                          {item.character || item.job || "Cast"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {canViewMore && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => count + 12)}
                    className="rounded-full border border-slate-700 bg-slate-900/70 px-6 py-2 text-xs uppercase tracking-[0.25em] text-slate-200 hover:border-slate-500 hover:text-white transition"
                  >
                    View more
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <AnimatePresence>
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

export default ActorPage;
