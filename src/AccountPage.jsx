import React, { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { MovieModal } from "./BrowsePage.jsx";
import {
  createList,
  addMovieToList,
  updateListName,
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

function AccountPage({ initialTab = "rooms" }) {
  const normalizeTab = (value) =>
    TAB_LABELS.some((tab) => tab.id === value) ? value : "rooms";
  const [activeTab, setActiveTab] = useState(normalizeTab(initialTab));
  const [lists, setLists] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState("");
  const [roomsMessage, setRoomsMessage] = useState("");
  const [listName, setListName] = useState("");
  const [listError, setListError] = useState("");
  const [listMessage, setListMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [activeListId, setActiveListId] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResults, setAiResults] = useState([]);
  const [aiTitle, setAiTitle] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState("movie");
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [addedSearchIds, setAddedSearchIds] = useState({});
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
  const [createRoomModalOpen, setCreateRoomModalOpen] = useState(false);

  const handleOpenCreateRoomModal = () => setCreateRoomModalOpen(true);
  const handleCloseCreateRoomModal = () => setCreateRoomModalOpen(false);

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
    if (activeTab !== "rooms") return;
    let active = true;
    const loadRooms = async () => {
      setRoomsLoading(true);
      setRoomsError("");
      try {
        const response = await fetch(`${API_BASE}/api/rooms`, {
          credentials: "include",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.message || "Unable to load rooms.");
        }
        if (!active) return;
        setRooms(Array.isArray(data?.rooms) ? data.rooms : []);
        setRoomsMessage("");
      } catch (err) {
        if (!active) return;
        setRoomsError(err.message || "Unable to load rooms.");
        setRooms([]);
      } finally {
        if (active) {
          setRoomsLoading(false);
        }
      }
    };
    loadRooms();
    return () => {
      active = false;
    };
  }, [activeTab]);

  useEffect(() => {
    if (!activeList) {
      setRenameOpen(false);
      setRenameValue("");
      return;
    }
    if (!renameOpen) {
      setRenameValue(activeList.name);
    }
  }, [activeList, renameOpen]);

  useEffect(() => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchLoading(false);
    setSearchError("");
    setAddedSearchIds({});
    setShareMessage("");
  }, [activeListId]);

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
    setShareMessage("");
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
    setShareMessage("");
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

  const handleRenameList = async (event) => {
    event.preventDefault();
    if (!activeList) return;
    setListError("");
    setListMessage("");
    setShareMessage("");
    const result = await updateListName(activeList.id, renameValue);
    if (result?.error) {
      setListError(result.error);
      return;
    }
    const refresh = await getLists();
    if (refresh?.error) {
      setListError(refresh.error);
      return;
    }
    syncLists(refresh.lists || [], activeList.id);
    setRenameOpen(false);
    setListMessage("List renamed.");
  };

  const handleRemoveMovie = async (listId, tmdbId) => {
    if (!listId || !tmdbId) return;
    setListError("");
    setListMessage("");
    setShareMessage("");
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

  const handleDeleteRoom = async (roomId) => {
    if (!roomId) return;
    const confirmed = window.confirm(
      "Delete this room? This cannot be undone."
    );
    if (!confirmed) return;
    setRoomsError("");
    setRoomsMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/rooms/${roomId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRoomsError(data?.message || "Unable to delete room.");
        return;
      }
      setRooms((prev) => prev.filter((room) => room.id !== roomId));
      setRoomsMessage("Room deleted.");
    } catch (err) {
      setRoomsError("Network error. Please try again.");
    }
  };

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

  const handleSearchSubmit = async (event) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchError("Search query is required.");
      return;
    }
    setSearchLoading(true);
    setSearchError("");
    try {
      const params = new URLSearchParams({ query, page: "1" });
      const data = await fetchApiJson(
        `/api/tmdb/search/multi?${params.toString()}`
      );
      const items = (data?.results || [])
        .filter(
          (item) => item.media_type === "movie" || item.media_type === "tv"
        )
        .slice(0, 10)
        .map((item) => ({
          id: item.id,
          mediaType: item.media_type,
          title: item.title || item.name || "Untitled",
          poster_path: item.poster_path || null,
          release_date: item.release_date || item.first_air_date || null,
        }));
      setSearchResults(items);
      if (!items.length) {
        setSearchError("No results found.");
      }
    } catch (err) {
      setSearchError(err.message || "Search failed.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleOpenSearchModal = () => {
    setSearchModalOpen(true);
    setSearchError("");
  };

  const handleCloseSearchModal = () => {
    setSearchModalOpen(false);
  };

  const handleAddSearchResult = async (movie) => {
    if (!activeList) return;
    const key = `${movie.mediaType}-${movie.id}`;
    if (addedSearchIds[key]) return;
    setListError("");
    setListMessage("");
    setShareMessage("");
    const result = await addMovieToList(activeList.id, movie);
    if (result?.error) {
      setListError(result.error);
      return;
    }
    setAddedSearchIds((prev) => ({ ...prev, [key]: true }));
    const refresh = await getLists();
    if (refresh?.error) {
      setListError(refresh.error);
      return;
    }
    syncLists(refresh.lists || [], activeList.id);
    setListMessage("Added to list.");
  };

  const handleCloseMovie = () => {
    setSelectedMedia(null);
    setDetails(null);
    setDetailsError("");
  };

  const handleOpenAiModal = () => {
    setAiModalOpen(true);
    setAiError("");
  };

  const handleCloseAiModal = () => {
    setAiModalOpen(false);
  };

  const handleAiSubmit = (event) => {
    event.preventDefault();
    generateAiList();
  };

  const generateAiList = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      setAiError("Prompt is required.");
      return;
    }
    setAiLoading(true);
    setAiError("");
    try {
      const response = await fetch(`${API_BASE}/api/ai/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAiError(data?.message || "Unable to generate list.");
        return;
      }
      setAiTitle(data.title || prompt);
      setAiResults(Array.isArray(data.movies) ? data.movies : []);
    } catch (err) {
      setAiError("Network error. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiConfirm = () => {
    if (!aiResults.length) {
      setAiError("No AI results to save.");
      return;
    }
    setAiSaving(true);
    setAiError("");
    const run = async () => {
      const result = await createList(aiTitle || "AI list");
      if (result?.error || !result?.list?.id) {
        setAiError(result?.error || "Unable to create list.");
        setAiSaving(false);
        return;
      }
      const listId = result.list.id;
      await Promise.all(
        aiResults.map((movie) =>
          addMovieToList(listId, {
            id: movie.id,
            mediaType: movie.mediaType || "movie",
            title: movie.title,
            name: movie.name,
            poster_path: movie.poster_path,
            release_date: movie.release_date,
            first_air_date: movie.release_date,
          })
        )
      );
      const refresh = await getLists();
      if (refresh?.error) {
        setAiError(refresh.error);
        setAiSaving(false);
        return;
      }
      syncLists(refresh.lists || [], listId);
      setListMessage("List created.");
      setShareMessage("");
      setAiModalOpen(false);
      setAiResults([]);
      setAiTitle("");
      setAiPrompt("");
      setAiSaving(false);
    };
    run();
  };

  const handleShareList = async () => {
    if (!activeList?.shareCode) {
      setListError("Share code unavailable.");
      setShareMessage("");
      return;
    }
    const base = `${window.location.origin}${window.location.pathname}`;
    const shareLink = `${base}#list?code=${activeList.shareCode}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = shareLink;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setShareMessage("Share link copied.");
      setListError("");
    } catch (err) {
      setListError("Unable to copy share link.");
      setShareMessage("");
    }
  };

  const handleAiBack = () => {
    setAiResults([]);
    setAiTitle("");
    setAiError("");
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
                className={`px-4 py-2 rounded-full text-sm border transition ${activeTab === tab.id
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
                    Rooms you have created will appear here.
                  </p>
                </div>
                <button
                  onClick={handleOpenCreateRoomModal}
                  className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
                >
                  Create room
                </button>
              </div>
              {roomsLoading && (
                <div className="mt-6 text-sm text-slate-400">
                  Loading rooms...
                </div>
              )}
              {!roomsLoading && roomsError && (
                <div className="mt-6 text-sm text-rose-300">{roomsError}</div>
              )}
              {!roomsLoading && roomsMessage && (
                <div className="mt-6 text-sm text-emerald-300">
                  {roomsMessage}
                </div>
              )}
              {!roomsLoading && !roomsError && rooms.length === 0 && (
                <div className="mt-6 rounded-xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">
                  You have no rooms yet.
                </div>
              )}
              {!roomsLoading && rooms.length > 0 && (
                <div className="mt-6 grid gap-4">
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-slate-100">
                            {room.title}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            {room.media_type === "tv" ? "Series" : "Movie"} ·{" "}
                            {room.media_id}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteRoom(room.id)}
                            className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-slate-500 transition"
                          >
                            Close
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              window.location.hash = `#room-watch?code=${room.room_code}`;
                            }}
                            className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-slate-500 transition"
                          >
                            View
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <div className="tracking-[0.2em] text-cyan-300">
                          {room.room_code}
                        </div>
                        <div>
                          {room.created_at
                            ? new Date(room.created_at).toLocaleDateString()
                            : "--"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400">
                        <span>
                          Voice: {room.voice_chat_enabled ? "On" : "Off"}
                        </span>
                        <span>
                          Text: {room.text_chat_enabled ? "On" : "Off"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                <form className="mt-5 space-y-3" onSubmit={handleCreateList}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenAiModal}
                    className="inline-flex w-fit items-center justify-center gap-2 self-start px-4 py-2 rounded-lg border border-slate-700/80 bg-slate-900/60 text-sm text-slate-100 hover:border-cyan-400/60 hover:text-cyan-100 transition"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 3l1.6 3.9L18 8.5l-3.6 2.6L13 15l-3-2.2L6 13.5l1.4-4L4 8.5l4.4-1.6L10 3z" />
                      <path d="M17.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
                    </svg>
                    Create list with AI
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
                            className={`w-full text-left rounded-xl border px-3 py-3 transition ${activeListId === list.id
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
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1">
                            {renameOpen ? (
                              <form
                                className="space-y-2"
                                onSubmit={handleRenameList}
                              >
                                <input
                                  type="text"
                                  value={renameValue}
                                  onChange={(event) =>
                                    setRenameValue(event.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    type="submit"
                                    className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400 transition"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRenameOpen(false);
                                      setRenameValue(activeList.name);
                                    }}
                                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:border-slate-500 transition"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <>
                                <h3 className="text-lg font-semibold leading-snug break-words line-clamp-2 sm:line-clamp-none">
                                  {activeList.name}
                                </h3>
                                <p className="text-xs text-slate-400 mt-1">
                                  {activeList.movies?.length || 0} movies
                                </p>
                              </>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {!renameOpen && (
                              <button
                                type="button"
                                onClick={handleShareList}
                                disabled={!activeList.shareCode}
                                className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:border-slate-500 transition disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Share
                              </button>
                            )}
                            {!renameOpen && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRenameOpen(true);
                                  setRenameValue(activeList.name);
                                }}
                                className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:border-slate-500 transition"
                              >
                                Rename
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteList(activeList.id)}
                              className="px-3 py-1.5 rounded-lg border border-rose-500/50 text-xs text-rose-100 hover:bg-rose-500/10 transition"
                            >
                              Delete list
                            </button>
                          </div>
                        </div>
                        {shareMessage && (
                          <div className="mt-2 text-xs text-emerald-300">
                            {shareMessage}
                          </div>
                        )}
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={handleOpenSearchModal}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 hover:border-cyan-400/60 hover:text-cyan-100 transition"
                          >
                            Search
                          </button>
                        </div>
                        {activeList.movies?.length ? (
                          <div className="mt-5 max-h-[60vh] overflow-y-auto pr-1 scrollbar-slate">
                            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                              {activeList.movies.map((movie) => (
                                <div
                                  key={`${movie.mediaType || "movie"}-${movie.id
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
                                      className="absolute top-2 right-2 rounded-full bg-slate-950/80 border border-slate-700 px-2 py-1 text-[10px] text-slate-200 transition"
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

      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={handleCloseAiModal}
            role="presentation"
          />
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Create list with AI</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Describe the vibe and we will build a list for you.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseAiModal}
                className="rounded-full border border-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100 transition"
              >
                Close
              </button>
            </div>
            {aiResults.length === 0 && (
              <form className="mt-5 space-y-4" onSubmit={handleAiSubmit}>
                <div className="space-y-2">
                  <label
                    className="text-xs text-slate-400"
                    htmlFor="ai-list-prompt"
                  >
                    Prompt
                  </label>
                  <input
                    id="ai-list-prompt"
                    type="text"
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    placeholder="Movie list for rainy mood"
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={aiLoading}
                  className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
                >
                  {aiLoading ? "Generating..." : "Generate list"}
                </button>
                {aiError && (
                  <div className="text-xs text-rose-300">{aiError}</div>
                )}
              </form>
            )}
            {aiResults.length > 0 && (
              <div className="mt-6 space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    List title
                  </div>
                  <div className="text-lg font-semibold mt-2">{aiTitle}</div>
                </div>
                <div className="max-h-[360px] overflow-y-auto pr-1">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {aiResults.map((movie) => (
                      <div
                        key={`${movie.title}-${movie.year}`}
                        className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
                      >
                        <div className="text-sm font-semibold text-slate-100">
                          {movie.title}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {(movie.year ||
                            movie.release_date?.toString().slice(0, 4) ||
                            "--")}{" "}
                          • {movie.genre || "Mixed"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleAiBack}
                    className="px-4 py-2 rounded-lg border border-slate-700/80 text-sm text-slate-200 hover:border-slate-500 transition"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={generateAiList}
                    disabled={aiLoading}
                    className="px-4 py-2 rounded-lg border border-slate-700/80 text-sm text-slate-200 hover:border-slate-500 transition"
                  >
                    {aiLoading ? "Generating..." : "Generate again"}
                  </button>
                  <button
                    type="button"
                    onClick={handleAiConfirm}
                    disabled={aiSaving}
                    className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
                  >
                    {aiSaving ? "Saving..." : "Confirm"}
                  </button>
                </div>
                {aiError && (
                  <div className="text-xs text-rose-300">{aiError}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {searchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={handleCloseSearchModal}
            role="presentation"
          />
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Search and add</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Find movies or series and add them to this list.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseSearchModal}
                className="rounded-full border border-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100 transition"
              >
                Close
              </button>
            </div>
            <form
              className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center"
              onSubmit={handleSearchSubmit}
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchError("");
                }}
                placeholder="Search movies or series"
                className="flex-1 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
              />
              <button
                type="submit"
                disabled={searchLoading}
                className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
              >
                {searchLoading ? "Searching..." : "Search"}
              </button>
            </form>
            {searchError && (
              <div className="mt-3 text-xs text-rose-300">{searchError}</div>
            )}
            {searchResults.length > 0 && (
              <div className="mt-4 max-h-[360px] overflow-y-auto pr-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  {searchResults.map((movie) => {
                    const key = `${movie.mediaType}-${movie.id}`;
                    const alreadyInList = !!activeList?.movies?.some(
                      (item) =>
                        item.id === movie.id &&
                        (item.mediaType || "movie") === movie.mediaType
                    );
                    const isAdded = addedSearchIds[key] || alreadyInList;
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3"
                      >
                        <div className="h-14 w-10 overflow-hidden rounded-md bg-slate-800">
                          {movie.poster_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w185${movie.poster_path}`}
                              alt={movie.title}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-[10px] text-slate-500">
                              No poster
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-slate-100 line-clamp-1">
                            {movie.title}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            {(movie.release_date || "--")
                              .toString()
                              .slice(0, 4)}{" "}
                            • {movie.mediaType === "tv" ? "Series" : "Movie"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddSearchResult(movie)}
                          disabled={isAdded}
                          className={`px-3 py-1.5 rounded-lg border text-xs transition ${isAdded
                            ? "border-emerald-500/70 bg-emerald-500/20 text-emerald-100"
                            : "border-slate-700 text-slate-200 hover:border-slate-500"
                            }`}
                        >
                          {isAdded ? "Added" : "Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {createRoomModalOpen && (
        <CreateRoomModal onClose={handleCloseCreateRoomModal} />
      )}
    </div>
  );
}


function CreateRoomModal({ onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResults([]);

    try {
      const res = await fetch(
        `https://consumet-eta-five.vercel.app/movies/flixhq/${encodeURIComponent(
          query
        )}`
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      setError("Failed to search. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (item) => {
    // Consumet usually returns type as 'Movie' or 'TV Series'
    const type = item.type === "TV Series" ? "tv" : "movie";
    window.location.hash = `#room?id=${item.id}&type=${type}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      />
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl h-[80vh] flex flex-col">
        <div className="flex items-start justify-between mb-4 flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold">Create a Room</h3>
            <p className="text-sm text-slate-400 mt-1">
              Search for a movie or TV show to watch with friends.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100 transition"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-4 flex-shrink-0">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for movies or TV shows..."
            className="flex-1 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition disabled:opacity-50"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        {error && (
          <div className="text-rose-400 text-sm mb-4 flex-shrink-0">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {results.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {results.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className="flex flex-col text-left group p-2 rounded-xl border border-transparent hover:border-slate-700 hover:bg-slate-900/40 transition"
                >
                  <div className="aspect-[2/3] w-full bg-slate-800 rounded-lg overflow-hidden mb-2 relative">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                        No Image
                      </div>
                    )}
                    <div className="absolute top-2 right-2 bg-slate-950/80 px-2 py-1 rounded text-[10px] text-cyan-400 border border-slate-800">
                      {item.type || "Movie"}
                    </div>
                  </div>
                  <div className="font-medium text-sm text-slate-200 group-hover:text-cyan-400 transition line-clamp-2">
                    {item.title}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {item.releaseDate || ""}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            !loading && (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <p>No results found</p>
                <p className="text-xs mt-1">Try searching for something else</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default AccountPage;
