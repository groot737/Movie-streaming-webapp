import React, { useEffect, useState } from "react";
import Cropper from "react-easy-crop";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

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
    return () => {
      if (coverSource) {
        URL.revokeObjectURL(coverSource);
      }
    };
  }, [coverSource]);

  const posts = [
    {
      id: 1,
      body: "Just finished a late-night sci-fi binge. Any recs for tomorrow?",
      time: "1h",
    },
  ];

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
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
            >
              New post
            </button>
          </div>

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
                        <div className="text-[11px] sm:text-xs text-slate-400" title="Feb 4, 2026 at 9:12 PM">
                          {post.time} · Public
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100 transition"
                    >
                      ···
                    </button>
                  </div>
                  <p className="text-base sm:text-lg text-slate-100 mt-3">{post.body}</p>
                  <div className="mt-3 border-t border-slate-800 pt-2.5">
                    <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
                      <div>0 likes</div>
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
                          className="w-full rounded-lg py-1.5 hover:bg-slate-900/60 transition flex items-center justify-center gap-1.5 sm:gap-2 hover:text-cyan-300"
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
    </div>
  );
}

export default DashboardPage;
