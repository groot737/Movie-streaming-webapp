import React, { useEffect, useState } from "react";
import { createList, getLists } from "./listStorage.js";

const TAB_LABELS = [
  { id: "rooms", label: "Your rooms" },
  { id: "lists", label: "My lists" },
  { id: "settings", label: "Settings" },
];

function AccountPage({ initialTab = "rooms" }) {
  const normalizeTab = (value) =>
    TAB_LABELS.some((tab) => tab.id === value) ? value : "rooms";
  const [activeTab, setActiveTab] = useState(normalizeTab(initialTab));
  const [lists, setLists] = useState([]);
  const [listName, setListName] = useState("");
  const [listError, setListError] = useState("");
  const [listMessage, setListMessage] = useState("");
  const [activeListId, setActiveListId] = useState("");
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
      setLists(storedLists);
      if (storedLists.length && !activeListId) {
        setActiveListId(storedLists[0].id);
      }
    };
    loadLists();
    return () => {
      active = false;
    };
  }, [activeTab]);

  const handleProfileSubmit = (event) => {
    event.preventDefault();
  };

  const handlePasswordSubmit = (event) => {
    event.preventDefault();
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
    setLists(storedLists);
    if (result.list?.id) {
      setActiveListId(result.list.id);
    } else if (storedLists.length && !activeListId) {
      setActiveListId(storedLists[0].id);
    }
    setListName("");
    setListMessage("List created.");
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
                        </div>
                        {activeList.movies?.length ? (
                          <div className="mt-5 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                            {activeList.movies.map((movie) => (
                              <div
                                key={`${movie.mediaType || "movie"}-${
                                  movie.id
                                }`}
                                className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden"
                              >
                                <div className="aspect-[2/3] bg-slate-800">
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
                      placeholder="••••••••"
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
                      placeholder="••••••••"
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
                      placeholder="••••••••"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
                  >
                    Update password
                  </button>
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
                  className="mt-4 px-4 py-2 rounded-lg border border-rose-400 text-rose-100 hover:bg-rose-500/20 transition"
                >
                  Delete account
                </button>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default AccountPage;
