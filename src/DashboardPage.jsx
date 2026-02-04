import React, { useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";
const KLIPY_API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_KLIPY_API) || "";
const KLIPY_API_BASE = "https://api.klipy.com/api/v1";

const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (err) => reject(err));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });

const getCroppedImage = async (imageSrc, pixelCrop, fileType) => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      fileType || "image/jpeg",
      0.92
    );
  });
};

const normalizeKlipyGifs = (payload) => {
  const items =
    payload?.data?.data ||
    payload?.data?.gifs ||
    payload?.data?.results ||
    payload?.data ||
    payload?.results ||
    payload?.gifs ||
    [];
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const url =
        item?.file?.md?.gif?.url ||
        item?.file?.hd?.gif?.url ||
        item?.file?.sm?.gif?.url ||
        item?.images?.original?.url ||
        item?.images?.downsized?.url ||
        item?.media_formats?.gif?.url ||
        item?.media?.[0]?.gif?.url ||
        item?.url;
      const previewUrl =
        item?.file?.xs?.gif?.url ||
        item?.file?.sm?.gif?.url ||
        item?.images?.fixed_width_small?.url ||
        item?.images?.preview_gif?.url ||
        item?.media_formats?.tinygif?.url ||
        url;
      if (!url) return null;
      return {
        id: item?.id || item?.slug || url,
        url,
        previewUrl,
        alt: item?.title || "GIF",
      };
    })
    .filter(Boolean);
};

const fetchKlipySearch = async (query, signal) => {
  if (!KLIPY_API_KEY) {
    throw new Error("Missing Klipy API key.");
  }
  const params = new URLSearchParams({
    q: query,
    format_filter: "gif",
  });
  const res = await fetch(
    `${KLIPY_API_BASE}/${encodeURIComponent(KLIPY_API_KEY)}/gifs/search?${params.toString()}`,
    {
      signal,
      headers: {
        Accept: "application/json",
      },
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || `GIF request failed (${res.status}).`;
    throw new Error(message);
  }
  if (data?.error || data?.status === "error") {
    throw new Error(data?.message || data?.error || "GIF request failed.");
  }
  return normalizeKlipyGifs(data);
};

function DashboardPage() {
  const [user, setUser] = useState({
    username: "",
    avatar: "",
    bio: "",
    cover: "",
  });
  const [loading, setLoading] = useState(true);
  const [coverSource, setCoverSource] = useState("");
  const [coverFileType, setCoverFileType] = useState("");
  const [coverCrop, setCoverCrop] = useState({ x: 0, y: 0 });
  const [coverZoom, setCoverZoom] = useState(1);
  const [coverCroppedArea, setCoverCroppedArea] = useState(null);
  const [coverModalOpen, setCoverModalOpen] = useState(false);
  const [coverSaving, setCoverSaving] = useState(false);
  const [coverError, setCoverError] = useState("");
  const [activeMenuId, setActiveMenuId] = useState(null);

  useEffect(() => {
    let active = true;
    const loadUser = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          credentials: "include",
        });
        if (!response.ok) {
          if (active) {
            setLoading(false);
          }
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        setUser({
          username: data?.user?.username || "User",
          avatar: data?.user?.avatar || "",
          bio: data?.user?.bio || "",
          cover: data?.user?.cover || "",
        });
      } catch (err) {
        if (active) {
          setLoading(false);
        }
        return;
      }
      if (active) {
        setLoading(false);
      }
    };
    loadUser();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadPosts = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/posts`, {
          credentials: "include",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.message || "Unable to load posts.");
        }
        if (!active) return;
        setPosts(Array.isArray(data?.posts) ? data.posts : []);
      } catch (err) {
        if (active) {
          setPosts([]);
        }
      }
    };
    loadPosts();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (coverSource) {
        URL.revokeObjectURL(coverSource);
      }
    };
  }, [coverSource]);

  const [posts, setPosts] = useState([]);
  const [postMessage, setPostMessage] = useState("");
  const [editingPostId, setEditingPostId] = useState(null);
  const [editingBody, setEditingBody] = useState("");
  const [deletePostId, setDeletePostId] = useState(null);
  const [editingGif, setEditingGif] = useState(null);
  const [editGifOpen, setEditGifOpen] = useState(false);
  const [editGifQuery, setEditGifQuery] = useState("");
  const [editGifResults, setEditGifResults] = useState([]);
  const [editGifLoading, setEditGifLoading] = useState(false);
  const [editGifError, setEditGifError] = useState("");
  const editGifAbortRef = useRef(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newPostBody, setNewPostBody] = useState("");
  const [gifOpen, setGifOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState("");
  const [newPostGif, setNewPostGif] = useState(null);
  const gifAbortRef = useRef(null);
  const likeDebounceRef = useRef(new Map());

  useEffect(() => {
    if (!postMessage) return undefined;
    const timeoutId = setTimeout(() => {
      setPostMessage("");
    }, 3000);
    return () => clearTimeout(timeoutId);
  }, [postMessage]);

  const formatPostTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  };

  const coverUrl = user.cover
    ? user.cover.startsWith("http")
      ? user.cover
      : `${API_BASE}${user.cover}`
    : "";

  const handleCoverChange = (event) => {
    const file = event.target.files?.[0];
    setCoverError("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCoverError("Please choose a PNG, JPG, or WebP image.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCoverError("Cover image must be 5MB or smaller.");
      event.target.value = "";
      return;
    }
    if (coverSource) {
      URL.revokeObjectURL(coverSource);
    }
    setCoverSource(URL.createObjectURL(file));
    setCoverFileType(file.type);
    setCoverCrop({ x: 0, y: 0 });
    setCoverZoom(1);
    setCoverCroppedArea(null);
    setCoverModalOpen(true);
  };

  const handleCoverCancel = () => {
    if (coverSource) {
      URL.revokeObjectURL(coverSource);
    }
    setCoverSource("");
    setCoverFileType("");
    setCoverCrop({ x: 0, y: 0 });
    setCoverZoom(1);
    setCoverCroppedArea(null);
    setCoverModalOpen(false);
    setCoverError("");
  };

  const handleCoverSave = async () => {
    if (coverSaving) return;
    if (!coverSource || !coverCroppedArea) {
      setCoverError("Adjust the cover image first.");
      return;
    }
    setCoverSaving(true);
    setCoverError("");
    try {
      const croppedBlob = await getCroppedImage(
        coverSource,
        coverCroppedArea,
        coverFileType
      );
      if (!croppedBlob) {
        setCoverError("Unable to prepare cover image.");
        setCoverSaving(false);
        return;
      }
      if (user.cover) {
        await fetch(`${API_BASE}/api/account/cover`, {
          method: "DELETE",
          credentials: "include",
        });
      }
      const formData = new FormData();
      formData.append("cover", croppedBlob, "cover.jpg");
      const response = await fetch(`${API_BASE}/api/account/cover`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCoverError(data?.message || "Unable to upload cover image.");
        setCoverSaving(false);
        return;
      }
      setUser((prev) => ({ ...prev, cover: data?.user?.cover || "" }));
      handleCoverCancel();
    } catch (err) {
      setCoverError("Network error. Please try again.");
    } finally {
      setCoverSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div
        className={`relative h-44 xs:h-52 sm:h-64 lg:h-72 bg-gradient-to-br from-cyan-500/40 via-slate-900 to-slate-950 ${coverUrl ? "bg-cover bg-center" : ""} group`}
        style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_55%)]" />
        <div className="absolute inset-x-0 bottom-0 h-16 sm:h-20 bg-gradient-to-t from-slate-950 to-transparent" />
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition">
          <label className="px-4 py-2 rounded-lg bg-slate-950/80 text-slate-100 text-sm border border-slate-700 cursor-pointer hover:border-slate-500 transition">
            Change cover
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleCoverChange}
              className="hidden"
            />
          </label>
        </div>
        <div className="absolute inset-x-0 bottom-0 translate-y-1/3">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center gap-3 sm:gap-6 text-center">
            <div className="flex flex-col items-center gap-3 sm:gap-4">
              <div className="h-20 w-20 sm:h-28 sm:w-28 lg:h-32 lg:w-32 rounded-full border-4 border-slate-950 bg-slate-900/80 overflow-hidden flex items-center justify-center text-xl sm:text-2xl font-semibold text-slate-300 shadow-xl">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (user.username || "U").slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="space-y-1">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold">
                  {user.username || "User"}
                </h1>
                <p className="text-sm sm:text-base text-slate-100/90 font-medium max-w-2xl">
                  {loading
                    ? "Loading your profile..."
                    : user.bio || "No bio yet. Add one in settings."}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm text-slate-300">
                  <div>
                    <span className="text-slate-100 font-semibold">128</span>{" "}
                    followers
                  </div>
                  <div>
                    <span className="text-slate-100 font-semibold">92</span>{" "}
                    following
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-12">
        <div className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-slate-900">
          <div className="max-w-2xl mx-auto flex flex-wrap justify-center gap-2 sm:gap-3 py-4 sm:py-3">
            {["Posts", "Media", "Likes"].map((label) => (
              <button
                key={label}
                type="button"
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm border transition ${
                  label === "Posts"
                    ? "bg-cyan-500 text-slate-950 border-cyan-400"
                    : "border-slate-800 text-slate-300 hover:border-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <section className="p-0">
          <div className="max-w-2xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
            <div>
              <h2 className="text-base sm:text-lg font-semibold">Posts</h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Share updates with your followers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewPostBody("");
                setNewPostGif(null);
                setGifOpen(false);
                setGifQuery("");
                setGifResults([]);
                setGifError("");
                setCreateModalOpen(true);
              }}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
            >
              New post
            </button>
          </div>

          {postMessage && (
            <div className="max-w-2xl mx-auto mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
              {postMessage}
            </div>
          )}
          {posts.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center text-sm text-slate-400 max-w-3xl mx-auto">
              No posts yet.
            </div>
          ) : (
            <div className="mt-6 space-y-4 max-w-2xl mx-auto">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-xl border border-slate-800 p-3 sm:p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      className="flex items-center gap-3 text-left"
                      title="View post"
                    >
                      <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full overflow-hidden border border-slate-800 bg-slate-900/70 flex items-center justify-center text-sm sm:text-base font-semibold text-slate-200">
                        {user.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.username}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          (user.username || "U").slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div>
                        <div className="text-sm sm:text-base font-semibold text-slate-100">
                          {user.username || "User"}
                        </div>
                        <div
                          className="text-[11px] sm:text-xs text-slate-400"
                          title={
                            post.created_at
                              ? new Date(post.created_at).toLocaleString()
                              : ""
                          }
                        >
                          {formatPostTime(post.created_at)} · Public
                        </div>
                      </div>
                    </button>
                    <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuId((prev) =>
                          prev === post.id ? null : post.id
                        )
                      }
                        className="rounded-full border border-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100 transition"
                      >
                        ···
                      </button>
                      {activeMenuId === post.id && (
                        <div className="absolute right-0 mt-2 w-36 rounded-xl border border-slate-800 bg-slate-950/95 shadow-xl">
                          <button
                            type="button"
                            onClick={() => {
                            setActiveMenuId(null);
                            setEditingPostId(post.id);
                            setEditingBody(post.body || "");
                            setEditingGif(
                              post.gif_url
                                ? {
                                    url: post.gif_url,
                                    previewUrl: post.gif_preview_url,
                                    alt: post.gif_alt,
                                  }
                                : null
                            );
                            setEditGifOpen(false);
                            setEditGifQuery("");
                            setEditGifResults([]);
                            setEditGifError("");
                            setPostMessage("");
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-900/70 transition"
                        >
                            Edit post
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              setDeletePostId(post.id);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-500/10 transition"
                          >
                            Delete post
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {editingPostId === post.id ? (
                    <div className="mt-3 space-y-3">
                      <textarea
                        value={editingBody}
                        onChange={(event) => setEditingBody(event.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                      />
                      {editingGif && (
                        <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/40">
                          <img
                            src={editingGif.previewUrl || editingGif.url}
                            alt={editingGif.alt || "GIF"}
                            className="w-full max-h-64 object-contain"
                          />
                          <div className="flex justify-end p-2 border-t border-slate-800">
                            <button
                              type="button"
                              onClick={() => setEditingGif(null)}
                              className="text-xs text-slate-300 hover:text-slate-100 transition"
                            >
                              Remove GIF
                            </button>
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditGifOpen((prev) => !prev);
                          setEditGifError("");
                        }}
                        className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:border-slate-500 transition"
                      >
                        {editGifOpen ? "Hide GIFs" : "Change GIF"}
                      </button>
                      {editGifOpen && (
                        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                          <form
                            onSubmit={async (event) => {
                              event.preventDefault();
                              const trimmed = editGifQuery.trim();
                              if (!trimmed) return;
                              setEditGifLoading(true);
                              setEditGifError("");
                              if (editGifAbortRef.current) {
                                editGifAbortRef.current.abort();
                              }
                              const controller = new AbortController();
                              editGifAbortRef.current = controller;
                              try {
                                const results = await fetchKlipySearch(
                                  trimmed,
                                  controller.signal
                                );
                                setEditGifResults(results);
                              } catch (err) {
                                if (err?.name !== "AbortError") {
                                  setEditGifError(
                                    err.message || "Unable to load GIFs."
                                  );
                                }
                              } finally {
                                setEditGifLoading(false);
                              }
                            }}
                            className="flex gap-2"
                          >
                            <input
                              value={editGifQuery}
                              onChange={(event) =>
                                setEditGifQuery(event.target.value)
                              }
                              placeholder="Search GIFs"
                              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                            />
                            <button
                              type="submit"
                              className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-sm font-medium hover:bg-cyan-400 transition"
                            >
                              Search
                            </button>
                          </form>
                          {editGifLoading ? (
                            <div className="text-xs text-slate-400">
                              Loading GIFs...
                            </div>
                          ) : editGifError ? (
                            <div className="text-xs text-rose-300">
                              {editGifError}
                            </div>
                          ) : editGifResults.length === 0 ? (
                            <div className="text-xs text-slate-400">
                              No GIFs yet. Try searching for something.
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                              {editGifResults.map((gif) => (
                                <button
                                  key={gif.id}
                                  type="button"
                                  onClick={() => {
                                    setEditingGif(gif);
                                    setEditGifOpen(false);
                                  }}
                                  className="rounded-lg overflow-hidden border border-slate-800 hover:border-cyan-400/60 transition"
                                >
                                  <img
                                    src={gif.previewUrl || gif.url}
                                    alt={gif.alt || "GIF"}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = editingBody.trim();
                            if (!trimmed && !editingGif) return;
                            fetch(`${API_BASE}/api/posts/${post.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                              body: JSON.stringify({
                                body: trimmed,
                                gif: editingGif || null,
                              }),
                            })
                              .then((res) => res.json().catch(() => ({})))
                              .then((data) => {
                                if (!data?.post) return;
                                setPosts((prev) =>
                                  prev.map((item) =>
                                    item.id === post.id ? data.post : item
                                  )
                                );
                                setEditingPostId(null);
                                setEditingBody("");
                                setEditingGif(null);
                                setPostMessage("Post updated.");
                              })
                              .catch(() => {});
                          }}
                          className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPostId(null);
                            setEditingBody("");
                            setEditingGif(null);
                          }}
                          className="px-4 py-2 rounded-lg border border-slate-700 text-slate-100 hover:border-slate-500 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {post.body && (
                        <p className="text-base sm:text-lg text-slate-100">
                          {post.body}
                        </p>
                      )}
                      {post.gif_url && (
                        <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/40">
                          <img
                            src={post.gif_preview_url || post.gif_url}
                            alt={post.gif_alt || "GIF"}
                            className="w-full max-h-64 object-contain"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </div>
                  )}
                    <div className="mt-3 border-t border-slate-800 pt-2.5">
                    <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
                      <div>
                        {post.like_count || 0}{" "}
                        {post.like_count === 1 ? "like" : "likes"}
                      </div>
                      <div>0 comments</div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-xs sm:text-sm text-slate-300">
                      {[
                        {
                          label: "Like",
                          icon: (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M7 10v11" />
                              <path d="M15 5l-3 5H5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2l2-7a2 2 0 0 0-2-2h-5l1-4a2 2 0 0 0-2-2z" />
                            </svg>
                          ),
                        },
                        {
                          label: "Comment",
                          icon: (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                            </svg>
                          ),
                        },
                        {
                          label: "Share",
                          icon: (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
                              <path d="M12 16V4" />
                              <path d="M7 9l5-5 5 5" />
                            </svg>
                          ),
                        },
                      ].map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          onClick={() => {
                            if (action.label !== "Like") return;
                            const nextLiked = !post.liked;
                            setPosts((prev) =>
                              prev.map((item) =>
                                item.id === post.id
                                  ? {
                                      ...item,
                                      liked: nextLiked,
                                      like_count: Math.max(
                                        0,
                                        (item.like_count || 0) +
                                          (nextLiked ? 1 : -1)
                                      ),
                                    }
                                  : item
                              )
                            );
                            const existing = likeDebounceRef.current.get(post.id);
                            if (existing?.timeoutId) {
                              clearTimeout(existing.timeoutId);
                            }
                            const timeoutId = setTimeout(() => {
                              fetch(`${API_BASE}/api/posts/${post.id}/like`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                credentials: "include",
                                body: JSON.stringify({ liked: nextLiked }),
                              })
                                .then((res) => res.json().catch(() => ({})))
                                .then((data) => {
                                  setPosts((prev) =>
                                    prev.map((item) =>
                                      item.id === post.id
                                        ? {
                                            ...item,
                                            liked: data?.liked ?? item.liked,
                                            like_count:
                                              typeof data?.like_count === "number"
                                                ? data.like_count
                                                : item.like_count,
                                          }
                                        : item
                                    )
                                  );
                                })
                                .catch(() => {});
                              likeDebounceRef.current.delete(post.id);
                            }, 2000);
                            likeDebounceRef.current.set(post.id, {
                              timeoutId,
                              liked: nextLiked,
                            });
                          }}
                          className={`w-full rounded-lg py-1.5 hover:bg-slate-900/60 transition flex items-center justify-center gap-1.5 sm:gap-2 ${
                            action.label === "Like" && post.liked
                              ? "text-cyan-300"
                              : "hover:text-cyan-300"
                          }`}
                        >
                          {action.icon}
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      {coverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={handleCoverCancel}
            role="presentation"
          />
          <div className="relative w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Adjust cover</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Drag to frame your cover. Recommended 1500x500.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCoverCancel}
                className="rounded-full border border-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100 transition"
              >
                Close
              </button>
            </div>
            <div className="mt-5">
              <div className="relative h-56 sm:h-64 w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                <Cropper
                  image={coverSource}
                  crop={coverCrop}
                  zoom={coverZoom}
                  aspect={3 / 1}
                  onCropChange={setCoverCrop}
                  onZoomChange={setCoverZoom}
                  onCropComplete={(_, pixels) => setCoverCroppedArea(pixels)}
                />
              </div>
              <div className="mt-5 space-y-2">
                <label className="text-xs text-slate-400" htmlFor="cover-zoom">
                  Zoom
                </label>
                <input
                  id="cover-zoom"
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={coverZoom}
                  onChange={(event) => setCoverZoom(Number(event.target.value))}
                  className="w-full accent-cyan-500"
                />
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCoverCancel}
                  disabled={coverSaving}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:border-slate-500 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCoverSave}
                  disabled={coverSaving}
                  className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
                >
                  {coverSaving ? "Saving..." : "Save"}
                </button>
              </div>
              {coverError && (
                <div className="mt-3 text-xs text-rose-300">{coverError}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {deletePostId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setDeletePostId(null)}
            role="presentation"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="text-lg font-semibold">Delete post?</div>
            <p className="text-sm text-slate-400 mt-2">
              This action cannot be undone.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletePostId(null)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:border-slate-500 transition"
              >
                Cancel
              </button>
                <button
                  type="button"
                  onClick={() => {
                    fetch(`${API_BASE}/api/posts/${deletePostId}`, {
                      method: "DELETE",
                      credentials: "include",
                    })
                      .then((res) => res.json().catch(() => ({})))
                      .then((data) => {
                        if (!data?.ok) return;
                        setPosts((prev) =>
                          prev.filter((item) => item.id !== deletePostId)
                        );
                        setDeletePostId(null);
                        setPostMessage("Post deleted.");
                      })
                      .catch(() => {});
                  }}
                  className="px-4 py-2 rounded-lg bg-rose-500 text-white font-medium hover:bg-rose-400 transition"
                >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setCreateModalOpen(false)}
            role="presentation"
          />
          <div className="relative w-full max-w-xl max-h-[80vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Create post</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Share an update with your followers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="rounded-full border border-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100 transition"
              >
                Close
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <textarea
                value={newPostBody}
                onChange={(event) => setNewPostBody(event.target.value)}
                rows={4}
                placeholder="What's on your mind?"
                className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
              />
              {newPostGif && (
                <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/40">
                  <img
                    src={newPostGif.previewUrl || newPostGif.url}
                    alt={newPostGif.alt || "GIF"}
                    className="w-full max-h-64 object-contain"
                  />
                  <div className="flex justify-end p-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setNewPostGif(null)}
                      className="text-xs text-slate-300 hover:text-slate-100 transition"
                    >
                      Remove GIF
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setGifOpen((prev) => !prev);
                  setGifError("");
                }}
                className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:border-slate-500 transition"
              >
                {gifOpen ? "Hide GIFs" : "Add GIF"}
              </button>
              {gifOpen && (
                <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <form
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const trimmed = gifQuery.trim();
                      if (!trimmed) return;
                      setGifLoading(true);
                      setGifError("");
                      if (gifAbortRef.current) {
                        gifAbortRef.current.abort();
                      }
                      const controller = new AbortController();
                      gifAbortRef.current = controller;
                      try {
                        const results = await fetchKlipySearch(
                          trimmed,
                          controller.signal
                        );
                        setGifResults(results);
                      } catch (err) {
                        if (err?.name !== "AbortError") {
                          setGifError(err.message || "Unable to load GIFs.");
                        }
                      } finally {
                        setGifLoading(false);
                      }
                    }}
                    className="flex gap-2"
                  >
                    <input
                      value={gifQuery}
                      onChange={(event) => setGifQuery(event.target.value)}
                      placeholder="Search GIFs"
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-sm font-medium hover:bg-cyan-400 transition"
                    >
                      Search
                    </button>
                  </form>
                  {gifLoading ? (
                    <div className="text-xs text-slate-400">Loading GIFs...</div>
                  ) : gifError ? (
                    <div className="text-xs text-rose-300">{gifError}</div>
                  ) : gifResults.length === 0 ? (
                    <div className="text-xs text-slate-400">
                      No GIFs yet. Try searching for something.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                      {gifResults.map((gif) => (
                        <button
                          key={gif.id}
                          type="button"
                          onClick={() => {
                            setNewPostGif(gif);
                            setGifOpen(false);
                          }}
                          className="rounded-lg overflow-hidden border border-slate-800 hover:border-cyan-400/60 transition"
                        >
                          <img
                            src={gif.previewUrl || gif.url}
                            alt={gif.alt || "GIF"}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div>{newPostBody.trim().length}/280</div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:border-slate-500 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = newPostBody.trim();
                    if (!trimmed && !newPostGif) return;
                    fetch(`${API_BASE}/api/posts`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({
                        body: trimmed,
                        gif: newPostGif || null,
                      }),
                    })
                      .then((res) => res.json().catch(() => ({})))
                      .then((data) => {
                        if (!data?.post) return;
                        setPosts((prev) => [data.post, ...prev]);
                        setCreateModalOpen(false);
                        setNewPostBody("");
                        setNewPostGif(null);
                        setGifOpen(false);
                        setGifQuery("");
                        setGifResults([]);
                        setGifError("");
                        setPostMessage("Post created.");
                      })
                      .catch(() => {});
                  }}
                  className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
                >
                  Post
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
