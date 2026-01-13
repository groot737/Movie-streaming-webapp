import React, { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { MovieModal } from "./BrowsePage.jsx";
import {
  createList,
  deleteList,
  getLists,
  removeMovieFromList,
} from "./listStorage.js";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

const TAB_LABELS = [
  { id: "rooms", label: "Your rooms" },
  { id: "lists", label: "My lists" },
  { id: "settings", label: "Settings" },
];

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

function AccountPage({ initialTab = "rooms" }) {
  const normalizeTab = (value) =>
    TAB_LABELS.some((tab) => tab.id === value) ? value : "rooms";
  const [activeTab, setActiveTab] = useState(normalizeTab(initialTab));
  const [lists, setLists] = useState([]);
  const [listName, setListName] = useState("");
  const [listError, setListError] = useState("");
  const [listMessage, setListMessage] = useState("");
  const [activeListId, setActiveListId] = useState("");
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState("movie");
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const activeList = lists.find((list) => list.id === activeListId) || null;

  useEffect(() => {
    setActiveTab(normalizeTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    if (activeTab !== "lists") return;
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
      syncLists(storedLists);
    };
    loadLists();
    return () => {
      active = false;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "settings") return;
    let active = true;
    const loadUser = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          credentials: "include",
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (data?.user?.username) {
          setUsername(data.user.username);
        }
      } catch (err) {
        // Ignore profile load errors.
      }
    };
    loadUser();
    return () => {
      active = false;
    };
  }, [activeTab]);

  const syncLists = (storedLists, preferredId = activeListId) => {
    setLists(storedLists);
    if (!storedLists.length) {
      setActiveListId("");
      return;
    }
    const match = storedLists.find((list) => list.id === preferredId);
    setActiveListId(match ? match.id : storedLists[0].id);
  };

  const handleProfileSubmit = (event) => {
    event.preventDefault();
    const trimmed = username.trim();
    setProfileError("");
    setProfileMessage("");
    if (!trimmed) {
      setProfileError("Username is required.");
      return;
    }
    if (trimmed.length < 3) {
      setProfileError("Username must be at least 3 characters.");
      return;
    }
    if (trimmed.length > 32) {
      setProfileError("Username must be 32 characters or less.");
      return;
    }
    const run = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/account/username`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username: trimmed }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setProfileError(data?.message || "Unable to update username.");
          return;
        }
        setUsername(data?.user?.username || trimmed);
        setProfileMessage("Username updated.");
      } catch (err) {
        setProfileError("Network error. Please try again.");
      }
    };
    run();
  };

  const handlePasswordSubmit = (event) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    const passwordHasLetter = /[A-Za-z]/.test(newPassword);
    const passwordHasNumber = /[0-9]/.test(newPassword);
    const passwordStrong =
      newPassword.length >= 8 && passwordHasLetter && passwordHasNumber;

    if (!currentPassword) {
      setPasswordError("Current password is required.");
      return;
    }
    if (!newPassword) {
      setPasswordError("New password is required.");
      return;
    }
    if (!passwordStrong) {
      setPasswordError(
        "Password must be at least 8 characters and include a letter and a number."
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    const run = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/account/password`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            currentPassword,
            newPassword,
            confirmPassword,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setPasswordError(data?.message || "Unable to update password.");
          return;
        }
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordMessage("Password updated.");
      } catch (err) {
        setPasswordError("Network error. Please try again.");
      }
    };
    run();
  };

  const handleCreateList = async (event) => {
    event.preventDefault();
    setListError("");
    setListMessage("");
    const result = await createList(listName);
    if (result?.error) {
      setListError(result.error);
      return;
    }
    const refresh = await getLists();
    if (refresh?.error) {
      setListError(refresh.error);
      return;
    }
    const storedLists = refresh.lists || [];
    syncLists(storedLists, result.list?.id);
    setListName("");
    setListMessage("List created.");
  };

  const handleDeleteList = async (listId) => {
    if (!listId) return;
    const confirmed = window.confirm(
      "Delete this list and all its movies? This cannot be undone."
    );
    if (!confirmed) return;
    setListError("");
    setListMessage("");
    const result = await deleteList(listId);
    if (result?.error) {
      setListError(result.error);
      return;
    }
    const refresh = await getLists();
    if (refresh?.error) {
      setListError(refresh.error);
      return;
    }
    syncLists(refresh.lists || [], "");
    setListMessage("List deleted.");
  };

  const handleRemoveMovie = async (listId, tmdbId) => {
    if (!listId || !tmdbId) return;
    setListError("");
    setListMessage("");
    const result = await removeMovieFromList(listId, tmdbId);
    if (result?.error) {
      setListError(result.error);
      return;
    }
    const refresh = await getLists();
    if (refresh?.error) {
      setListError(refresh.error);
      return;
    }
    syncLists(refresh.lists || [], listId);
    setListMessage("Removed from list.");
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Delete your account and all lists? This cannot be undone."
    );
    if (!confirmed) return;
    setDeleteError("");
    setProfileMessage("");
    setPasswordMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/account`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDeleteError(data?.message || "Unable to delete account.");
        return;
      }
      window.location.hash = "#";
      window.location.reload();
    } catch (err) {
      setDeleteError("Network error. Please try again.");
    }
  };

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
              My account
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold mt-2">
              Manage your profile
            </h1>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              Keep your rooms organized and update your settings whenever you
              need.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {TAB_LABELS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-full text-sm border transition ${
                  activeTab === tab.id
                    ? "bg-cyan-500 text-slate-950 border-cyan-400"
                    : "border-slate-800 text-slate-300 hover:border-slate-600"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "rooms" ? (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Your rooms</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Rooms you have created or joined will appear here.
                  </p>
                </div>
              </div>
              <div className="mt-6 rounded-xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">
                You have no rooms yet.
              </div>
            </section>
          ) : activeTab === "lists" ? (
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
                <div>
                  <h2 className="text-xl font-semibold">Create a list</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Make themed collections and add movies from any title page.
                  </p>
                </div>
                <form
                  className="mt-5 flex flex-col sm:flex-row gap-3"
                  onSubmit={handleCreateList}
                >
                  <input
                    type="text"
                    value={listName}
                    onChange={(event) => {
                      setListName(event.target.value);
                      setListError("");
                      setListMessage("");
                    }}
                    placeholder="List name"
                    className="flex-1 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
                  >
                    Create list
                  </button>
                </form>
                {listError && (
                  <div className="mt-3 text-xs text-rose-300">{listError}</div>
                )}
                {listMessage && (
                  <div className="mt-3 text-xs text-emerald-300">
                    {listMessage}
                  </div>
                )}
              </section>

              {lists.length === 0 ? (
                <section className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">
                  No lists yet. Create one to start collecting movies.
                </section>
              ) : (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
                  <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
                    <div className="space-y-3">
                      <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                        Your lists
                      </div>
                      <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                        {lists.map((list) => (
                          <button
                            key={list.id}
                            type="button"
                            onClick={() => setActiveListId(list.id)}
                            className={`w-full text-left rounded-xl border px-3 py-3 transition ${
                              activeListId === list.id
                                ? "border-cyan-400 bg-cyan-500/10 text-slate-100"
                                : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-600"
                            }`}
                          >
                            <div className="text-sm font-semibold">
                              {list.name}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                              {list.movies?.length || 0} movies
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {activeList ? (
                      <div>
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-semibold">
                              {activeList.name}
                            </h3>
                            <p className="text-xs text-slate-400 mt-1">
                              {activeList.movies?.length || 0} movies
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteList(activeList.id)}
                            className="px-3 py-1.5 rounded-lg border border-rose-500/50 text-xs text-rose-100 hover:bg-rose-500/10 transition"
                          >
                            Delete list
                          </button>
                        </div>
                        {activeList.movies?.length ? (
                          <div className="mt-5 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                            {activeList.movies.map((movie) => (
                              <div
                                key={`${movie.mediaType || "movie"}-${
                                  movie.id
                                }`}
                                className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden cursor-pointer group"
                                role="button"
                                tabIndex={0}
                                onClick={() =>
                                  handleOpenMedia(
                                    movie,
                                    movie.mediaType || "movie"
                                  )
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    handleOpenMedia(
                                      movie,
                                      movie.mediaType || "movie"
                                    );
                                  }
                                }}
                              >
                                <div className="relative aspect-[2/3] bg-slate-800">
                                  {movie.poster_path ? (
                                    <img
                                      src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                                      alt={movie.title || movie.name || "Movie"}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                                      No poster
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleRemoveMovie(activeList.id, movie.id);
                                    }}
                                    className="absolute top-2 right-2 rounded-full bg-slate-950/80 border border-slate-700 px-2 py-1 text-[10px] text-slate-200 opacity-0 group-hover:opacity-100 transition"
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className="p-3">
                                  <div className="text-sm font-semibold text-slate-100 line-clamp-1">
                                    {movie.title || movie.name || "Untitled"}
                                  </div>
                                  <div className="text-xs text-slate-400 mt-1">
                                    {(movie.release_date ||
                                      movie.first_air_date ||
                                      "--")
                                      .toString()
                                      .slice(0, 4)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-5 rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
                            No movies yet. Add some from the browse page.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
                        Select a list to see its movies.
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
                <div>
                  <h2 className="text-xl font-semibold">Profile</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Update the username tied to your account.
                  </p>
                </div>
                <form className="mt-5 space-y-4" onSubmit={handleProfileSubmit}>
                  <div className="space-y-2">
                    <label
                      className="text-xs text-slate-400"
                      htmlFor="account-username"
                    >
                      Username
                    </label>
                    <input
                      id="account-username"
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="new username"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
                  >
                    Save username
                  </button>
                  {profileError && (
                    <div className="text-xs text-rose-300">{profileError}</div>
                  )}
                  {profileMessage && (
                    <div className="text-xs text-emerald-300">
                      {profileMessage}
                    </div>
                  )}
                </form>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
                <div>
                  <h2 className="text-xl font-semibold">Password</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Change your password to keep your account secure.
                  </p>
                </div>
                <form className="mt-5 space-y-4" onSubmit={handlePasswordSubmit}>
                  <div className="space-y-2">
                    <label
                      className="text-xs text-slate-400"
                      htmlFor="account-current-password"
                    >
                      Current password
                    </label>
                    <input
                      id="account-current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      placeholder="********"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-xs text-slate-400"
                      htmlFor="account-new-password"
                    >
                      New password
                    </label>
                    <input
                      id="account-new-password"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="********"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-xs text-slate-400"
                      htmlFor="account-confirm-password"
                    >
                      Confirm new password
                    </label>
                    <input
                      id="account-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      placeholder="********"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
                  >
                    Update password
                  </button>
                  {passwordError && (
                    <div className="text-xs text-rose-300">{passwordError}</div>
                  )}
                  {passwordMessage && (
                    <div className="text-xs text-emerald-300">
                      {passwordMessage}
                    </div>
                  )}
                </form>
              </section>

              <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6">
                <div>
                  <h2 className="text-xl font-semibold">Delete account</h2>
                  <p className="text-sm text-rose-100/80 mt-1">
                    This permanently removes your profile and rooms. There is no
                    undo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="mt-4 px-4 py-2 rounded-lg border border-rose-400 text-rose-100 hover:bg-rose-500/20 transition"
                >
                  Delete account
                </button>
                {deleteError && (
                  <div className="mt-3 text-xs text-rose-200">
                    {deleteError}
                  </div>
                )}
              </section>
            </div>
          )}
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
            canManageLists
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default AccountPage;
