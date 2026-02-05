import React, { useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { AuthModal } from "./BrowsePage.jsx";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";
const KLIPY_API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_KLIPY_API) || "";
const KLIPY_API_BASE = "https://api.klipy.com/api/v1";
const POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const COMMENT_COLLAPSE_THRESHOLD = 2;
const REPLY_COLLAPSE_THRESHOLD = 3;
const COMMENT_BODY_PREVIEW_LIMIT = 220;

const countCommentThreads = (comments = []) =>
  comments.reduce(
    (total, comment) =>
      total + 1 + countCommentThreads(comment.replies || []),
    0
  );

const resolveMediaUrl = (src) => {
  if (!src) return "";
  if (src.startsWith("http") || src.startsWith("data:")) return src;
  return `${API_BASE}${src}`;
};

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

function DashboardPage({ userId = null }) {
  const [activeTab, setActiveTab] = useState("Posts");
  const [user, setUser] = useState({
    id: null,
    username: "",
    avatar: "",
    bio: "",
    cover: "",
  });
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [viewingUserId, setViewingUserId] = useState(
    userId ? Number(userId) : null
  );
  const [isFollowing, setIsFollowing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
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
  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [profileNotFound, setProfileNotFound] = useState(false);

  const fetchCurrentUser = async (activeFlag = { active: true }) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: "include",
      });
      if (!response.ok) {
        if (activeFlag.active) {
          setLoading(false);
        }
        return null;
      }
      const data = await response.json().catch(() => ({}));
      if (!activeFlag.active) return null;
      const me = data?.user || null;
      setCurrentUser(me);
      if (me?.id) {
        setCurrentUserId(me.id);
        if (!userId) {
          setViewingUserId(me.id);
          if (!window.location.hash.includes("userId=")) {
            window.location.hash = `#dashboard?userId=${me.id}`;
          }
        }
      }
      if (activeFlag.active) {
        setLoading(false);
      }
      return me;
    } catch (err) {
      if (activeFlag.active) {
        setLoading(false);
      }
      return null;
    }
  };

  useEffect(() => {
    const activeFlag = { active: true };
    fetchCurrentUser(activeFlag);
    return () => {
      activeFlag.active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (userId) {
      setViewingUserId(Number(userId));
    }
  }, [userId]);

  useEffect(() => {
    setIsFollowing(false);
  }, [viewingUserId]);

  const handleRequireAuth = () => {
    setAuthMode("signin");
    setShowAuthModal(true);
  };

  const handleAuthSuccess = async () => {
    setShowAuthModal(false);
    const activeFlag = { active: true };
    await fetchCurrentUser(activeFlag);
  };

  const isOwner =
    currentUserId && viewingUserId
      ? Number(currentUserId) === Number(viewingUserId)
      : false;

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      if (!viewingUserId) return;
      setLoading(true);
      setProfileNotFound(false);
      if (isOwner && currentUser) {
        if (!active) return;
        setUser({
          id: currentUser.id || null,
          username: currentUser.username || "User",
          avatar: currentUser.avatar || "",
          bio: currentUser.bio || "",
          cover: currentUser.cover || "",
        });
        setProfileNotFound(false);
        setLoading(false);
        return;
      }
      let notFound = false;
      try {
        const response = await fetch(
          `${API_BASE}/api/users/${viewingUserId}/profile`,
          { credentials: "include" }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          notFound = response.status === 404 || response.status === 400;
          throw new Error(data?.message || "Unable to load profile.");
        }
        if (!active) return;
        const profile = data?.user || null;
        if (!profile) {
          notFound = true;
          return;
        }
        setUser({
          id: profile.id || null,
          username: profile.username || "User",
          avatar: profile.avatar || "",
          bio: profile.bio || "",
          cover: profile.cover || "",
        });
      } catch (err) {
        if (!active) return;
      } finally {
        if (active) {
          setProfileNotFound(notFound);
          setLoading(false);
        }
      }
    };
    loadProfile();
    return () => {
      active = false;
    };
  }, [viewingUserId, isOwner, currentUser]);

  useEffect(() => {
    let active = true;
    const loadLists = async () => {
      if (!viewingUserId) return;
      setListsLoading(true);
      try {
        const endpoint = isOwner
          ? `${API_BASE}/api/lists`
          : `${API_BASE}/api/users/${viewingUserId}/lists`;
        const response = await fetch(endpoint, {
          credentials: "include",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.message || "Unable to load lists.");
        }
        if (!active) return;
        const publicLists = (data?.lists || []).filter(
          (list) => list.public !== false
        );
        setLists(publicLists);
      } catch (err) {
        if (active) {
          setLists([]);
        }
      } finally {
        if (active) {
          setListsLoading(false);
        }
      }
    };
    loadLists();
    return () => {
      active = false;
    };
  }, [viewingUserId, isOwner]);

  useEffect(() => {
    let active = true;
    const loadPosts = async () => {
      if (!viewingUserId) return;
      try {
        const endpoint = isOwner
          ? `${API_BASE}/api/posts`
          : `${API_BASE}/api/users/${viewingUserId}/posts`;
        const response = await fetch(endpoint, {
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
  }, [viewingUserId, isOwner]);

  useEffect(() => {
    return () => {
      if (coverSource) {
        URL.revokeObjectURL(coverSource);
      }
    };
  }, [coverSource]);

  const [posts, setPosts] = useState([]);
  const [commentThreadsByPost, setCommentThreadsByPost] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [commentsExpandedByPost, setCommentsExpandedByPost] = useState({});
  const [commentListExpandedByPost, setCommentListExpandedByPost] = useState({});
  const [commentGifByPost, setCommentGifByPost] = useState({});
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyOpenByComment, setReplyOpenByComment] = useState({});
  const [repliesExpandedByComment, setRepliesExpandedByComment] = useState({});
  const [replyGifByComment, setReplyGifByComment] = useState({});
  const [expandedCommentBodyById, setExpandedCommentBodyById] = useState({});
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [gifPickerTarget, setGifPickerTarget] = useState(null);
  const [gifPickerQuery, setGifPickerQuery] = useState("");
  const [gifPickerResults, setGifPickerResults] = useState([]);
  const [gifPickerLoading, setGifPickerLoading] = useState(false);
  const [gifPickerError, setGifPickerError] = useState("");
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState("");
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
  const commentLikeDebounceRef = useRef(new Map());
  const commentInputRefs = useRef({});
  const gifPickerAbortRef = useRef(null);

  useEffect(() => {
    if (posts.length === 0) return undefined;
    let active = true;
    const loadComments = async () => {
      try {
        const results = await Promise.all(
          posts.map(async (post) => {
            const response = await fetch(
              `${API_BASE}/api/posts/${post.id}/comments`,
              { credentials: "include" }
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              return { postId: post.id, comments: [] };
            }
            const rawComments = Array.isArray(data?.comments)
              ? data.comments
              : [];
            return {
              postId: post.id,
              comments: buildCommentTree(
                rawComments.map((comment) => mapApiComment(comment))
              ),
            };
          })
        );
        if (!active) return;
        setCommentThreadsByPost((prev) => {
          const next = { ...prev };
          results.forEach((result) => {
            next[result.postId] = result.comments;
          });
          return next;
        });
      } catch (err) {
        if (!active) return;
      }
    };
    loadComments();
    return () => {
      active = false;
    };
  }, [posts]);

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

  const mapApiComment = (comment) => ({
    id: comment.id,
    parentId: comment.parent_comment_id || null,
    body: comment.body || "",
    gif: comment.gif_url
      ? {
          url: comment.gif_url,
          previewUrl: comment.gif_preview_url || comment.gif_url,
          alt: comment.gif_alt || "GIF",
        }
      : null,
    time: formatPostTime(comment.created_at),
    createdAt: comment.created_at,
    author: {
      id: comment.user_id,
      name: comment.username || "User",
      avatar: comment.avatar || "",
    },
    likes: typeof comment.like_count === "number" ? comment.like_count : 0,
    liked: Boolean(comment.liked),
    replies: [],
  });

  const buildCommentTree = (comments = []) => {
    const byId = new Map();
    comments.forEach((comment) => {
      byId.set(comment.id, { ...comment, replies: [] });
    });
    const roots = [];
    byId.forEach((comment) => {
      if (comment.parentId && byId.has(comment.parentId)) {
        byId.get(comment.parentId).replies.push(comment);
      } else {
        roots.push(comment);
      }
    });
    return roots;
  };

  const handlePostComment = async (postId) => {
    if (!currentUserId) {
      handleRequireAuth();
      return;
    }
    const trimmed = (commentDrafts[postId] || "").trim();
    const selectedGif = commentGifByPost[postId] || null;
    if (!trimmed && !selectedGif) return;
    try {
      const response = await fetch(`${API_BASE}/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          body: trimmed,
          gif: selectedGif || null,
          parentCommentId: null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.comment) return;
      const newComment = mapApiComment(data.comment);
      setCommentThreadsByPost((prev) => ({
        ...prev,
        [postId]: [newComment, ...(prev[postId] || [])],
      }));
      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
      setCommentGifByPost((prev) => ({ ...prev, [postId]: null }));
    } catch (err) {
      // ignore for now
    }
  };

  const insertReply = (comments, parentId, reply) => {
    let updated = false;
    const next = comments.map((comment) => {
      if (comment.id === parentId) {
        updated = true;
        return {
          ...comment,
          replies: [...(comment.replies || []), reply],
        };
      }
      if (comment.replies?.length) {
        const [childReplies, childUpdated] = insertReply(
          comment.replies,
          parentId,
          reply
        );
        if (childUpdated) {
          updated = true;
          return { ...comment, replies: childReplies };
        }
      }
      return comment;
    });
    return [updated ? next : comments, updated];
  };

  const handleReplyComment = async (postId, parentId) => {
    if (!currentUserId) {
      handleRequireAuth();
      return;
    }
    const trimmed = (replyDrafts[parentId] || "").trim();
    const selectedGif = replyGifByComment[parentId] || null;
    if (!trimmed && !selectedGif) return;
    try {
      const response = await fetch(`${API_BASE}/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          body: trimmed,
          gif: selectedGif || null,
          parentCommentId: parentId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.comment) return;
      const newReply = mapApiComment(data.comment);
      setCommentThreadsByPost((prev) => {
        const current = prev[postId] || [];
        const [nextThreads, updated] = insertReply(
          current,
          parentId,
          newReply
        );
        if (!updated) return prev;
        return { ...prev, [postId]: nextThreads };
      });
      setReplyDrafts((prev) => ({ ...prev, [parentId]: "" }));
      setReplyOpenByComment((prev) => ({ ...prev, [parentId]: false }));
      setRepliesExpandedByComment((prev) => ({ ...prev, [parentId]: true }));
      setReplyGifByComment((prev) => ({ ...prev, [parentId]: null }));
    } catch (err) {
      // ignore for now
    }
  };

  const openGifPicker = (target) => {
    setGifPickerTarget(target);
    setGifPickerOpen(true);
    setGifPickerQuery("");
    setGifPickerResults([]);
    setGifPickerError("");
    setGifPickerLoading(false);
    if (gifPickerAbortRef.current) {
      gifPickerAbortRef.current.abort();
      gifPickerAbortRef.current = null;
    }
  };

  const closeGifPicker = () => {
    setGifPickerOpen(false);
    setGifPickerTarget(null);
    setGifPickerQuery("");
    setGifPickerResults([]);
    setGifPickerError("");
    setGifPickerLoading(false);
    if (gifPickerAbortRef.current) {
      gifPickerAbortRef.current.abort();
      gifPickerAbortRef.current = null;
    }
  };

  const updateCommentBody = (comments, targetId, body) => {
    let updated = false;
    const next = comments.map((comment) => {
      if (comment.id === targetId) {
        updated = true;
        return {
          ...comment,
          body,
          time: "now",
        };
      }
      if (comment.replies?.length) {
        const [childReplies, childUpdated] = updateCommentBody(
          comment.replies,
          targetId,
          body
        );
        if (childUpdated) {
          updated = true;
          return { ...comment, replies: childReplies };
        }
      }
      return comment;
    });
    return [updated ? next : comments, updated];
  };

  const removeCommentThread = (comments, targetId) => {
    let removed = false;
    const next = comments
      .filter((comment) => {
        if (comment.id === targetId) {
          removed = true;
          return false;
        }
        return true;
      })
      .map((comment) => {
        if (!comment.replies?.length) return comment;
        const [childReplies, childRemoved] = removeCommentThread(
          comment.replies,
          targetId
        );
        if (childRemoved) {
          removed = true;
          return { ...comment, replies: childReplies };
        }
        return comment;
      });
    return [removed ? next : comments, removed];
  };

  const updateCommentLike = (comments, targetId, liked) => {
    let updated = false;
    const next = comments.map((comment) => {
      if (comment.id === targetId) {
        updated = true;
        const currentLikes = comment.likes || 0;
        return {
          ...comment,
          liked,
          likes: Math.max(0, currentLikes + (liked ? 1 : -1)),
        };
      }
      if (comment.replies?.length) {
        const [childReplies, childUpdated] = updateCommentLike(
          comment.replies,
          targetId,
          liked
        );
        if (childUpdated) {
          updated = true;
          return { ...comment, replies: childReplies };
        }
      }
      return comment;
    });
    return [updated ? next : comments, updated];
  };

  const updateCommentLikeWithCount = (comments, targetId, liked, likeCount) => {
    let updated = false;
    const next = comments.map((comment) => {
      if (comment.id === targetId) {
        updated = true;
        return {
          ...comment,
          liked,
          likes:
            typeof likeCount === "number" ? likeCount : comment.likes || 0,
        };
      }
      if (comment.replies?.length) {
        const [childReplies, childUpdated] = updateCommentLikeWithCount(
          comment.replies,
          targetId,
          liked,
          likeCount
        );
        if (childUpdated) {
          updated = true;
          return { ...comment, replies: childReplies };
        }
      }
      return comment;
    });
    return [updated ? next : comments, updated];
  };

  const handleStartEditComment = (comment) => {
    if (!currentUserId) {
      handleRequireAuth();
      return;
    }
    setEditingCommentId(comment.id);
    setEditingCommentDraft(comment.body || "");
  };

  const handleSaveCommentEdit = async (postId, commentId) => {
    if (!currentUserId) {
      handleRequireAuth();
      return;
    }
    const trimmed = editingCommentDraft.trim();
    if (!trimmed) return;
    try {
      const response = await fetch(`${API_BASE}/api/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: trimmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.comment) return;
      const updatedComment = mapApiComment(data.comment);
      setCommentThreadsByPost((prev) => {
        const current = prev[postId] || [];
        const [nextThreads, updated] = updateCommentBody(
          current,
          commentId,
          updatedComment.body
        );
        if (!updated) return prev;
        return { ...prev, [postId]: nextThreads };
      });
      setEditingCommentId(null);
      setEditingCommentDraft("");
    } catch (err) {
      // ignore for now
    }
  };

  const handleDeleteComment = async (postId, commentId) => {
    if (!currentUserId) {
      handleRequireAuth();
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/comments/${commentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) return;
      setCommentThreadsByPost((prev) => {
        const current = prev[postId] || [];
        const [nextThreads, removed] = removeCommentThread(current, commentId);
        if (!removed) return prev;
        return { ...prev, [postId]: nextThreads };
      });
      if (editingCommentId === commentId) {
        setEditingCommentId(null);
        setEditingCommentDraft("");
      }
      setReplyOpenByComment((prev) => {
        if (!prev[commentId]) return prev;
        const { [commentId]: _, ...rest } = prev;
        return rest;
      });
      setReplyDrafts((prev) => {
        if (!prev[commentId]) return prev;
        const { [commentId]: _, ...rest } = prev;
        return rest;
      });
    } catch (err) {
      // ignore for now
    }
  };

  const isCommentOwner = (comment) => {
    if (!currentUserId) return false;
    const authorId = comment.author?.id;
    if (authorId && currentUserId) {
      return Number(authorId) === Number(currentUserId);
    }
    const name = comment.author?.name;
    if (currentUser?.username && name === currentUser.username) return true;
    return name === "You";
  };

  const renderCommentThread = (comment, depth = 0, postId, isPostOwner) => {
    const authorName = comment.author?.name || "User";
    const authorId = comment.author?.id;
    const authorAvatar = resolveMediaUrl(comment.author?.avatar);
    const likeCount = comment.likes || 0;
    const hasReplies = (comment.replies || []).length > 0;
    const replyOpen = !!replyOpenByComment[comment.id];
    const replyDraft = replyDrafts[comment.id] || "";
    const isEditing = editingCommentId === comment.id;
    const canEdit = isCommentOwner(comment);
    const canDelete = isPostOwner || canEdit;
    const replyGif = replyGifByComment[comment.id] || null;
    const commentBody = comment.body || "";
    const isLongComment = commentBody.length > COMMENT_BODY_PREVIEW_LIMIT;
    const commentExpanded = !!expandedCommentBodyById[comment.id];
    const commentPreview = isLongComment
      ? `${commentBody.slice(0, COMMENT_BODY_PREVIEW_LIMIT)}…`
      : commentBody;
    const replyCount = comment.replies?.length || 0;
    const shouldCollapseReplies = replyCount > REPLY_COLLAPSE_THRESHOLD;
    const repliesExpanded =
      repliesExpandedByComment[comment.id] ?? !shouldCollapseReplies;
    let visibleReplies = [];
    if (repliesExpanded) {
      visibleReplies = comment.replies || [];
    } else if (shouldCollapseReplies) {
      visibleReplies = (comment.replies || []).slice(
        0,
        REPLY_COLLAPSE_THRESHOLD
      );
    }
    const remainingReplyCount = replyCount - visibleReplies.length;
    return (
      <div
        key={comment.id}
        className={depth > 0 ? "pl-4 border-l border-slate-800" : ""}
      >
        <div className="flex gap-3">
          <div className="h-8 w-8 rounded-full border border-slate-800 bg-slate-900/70 flex items-center justify-center text-xs font-semibold text-slate-200 overflow-hidden">
            {authorAvatar ? (
              <img
                src={authorAvatar}
                alt={authorName}
                className="h-full w-full object-cover"
              />
            ) : (
              authorName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                {authorId ? (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.hash = `#dashboard?userId=${authorId}`;
                    }}
                    className="font-semibold text-slate-100 hover:text-cyan-300 transition"
                  >
                    {authorName}
                  </button>
                ) : (
                  <span className="font-semibold text-slate-100">
                    {authorName}
                  </span>
                )}
                <span>{comment.time}</span>
              </div>
              {isEditing ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editingCommentDraft}
                    onChange={(event) =>
                      setEditingCommentDraft(event.target.value)
                    }
                    rows={2}
                    className="w-full resize-none rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                  />
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <button
                      type="button"
                      onClick={() => handleSaveCommentEdit(postId, comment.id)}
                      disabled={!editingCommentDraft.trim()}
                      className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60 transition"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCommentId(null);
                        setEditingCommentDraft("");
                      }}
                      className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200 hover:border-slate-500 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-1 text-sm text-slate-200 break-all whitespace-pre-wrap">
                    {commentExpanded ? commentBody : commentPreview}
                    {isLongComment && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCommentBodyById((prev) => ({
                            ...prev,
                            [comment.id]: !commentExpanded,
                          }))
                        }
                        className="ml-2 inline whitespace-nowrap text-[11px] text-slate-400 hover:text-slate-200 transition align-baseline"
                      >
                        {commentExpanded ? "See less" : "See more"}
                      </button>
                    )}
                  </p>
                </>
              )}
              {comment.gif && (
                <div className="mt-2 max-w-[75%] overflow-hidden rounded-lg mx-auto">
                  <img
                    src={comment.gif.previewUrl || comment.gif.url}
                    alt={comment.gif.alt || "GIF"}
                    className="w-full max-h-56 object-contain"
                    loading="lazy"
                  />
                </div>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
              <button
                type="button"
                onClick={() =>
                  setReplyOpenByComment((prev) =>
                    prev[comment.id] ? {} : { [comment.id]: true }
                  )
                }
                className="hover:text-slate-200 transition"
              >
                Reply
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!currentUserId) {
                    handleRequireAuth();
                    return;
                  }
                  const nextLiked = !comment.liked;
                  setCommentThreadsByPost((prev) => {
                    const current = prev[postId] || [];
                    const [nextThreads, updated] = updateCommentLike(
                      current,
                      comment.id,
                      nextLiked
                    );
                    if (!updated) return prev;
                    return { ...prev, [postId]: nextThreads };
                  });
                  const existing = commentLikeDebounceRef.current.get(
                    comment.id
                  );
                  if (existing?.timeoutId) {
                    clearTimeout(existing.timeoutId);
                  }
                  const timeoutId = setTimeout(() => {
                    fetch(`${API_BASE}/api/comments/${comment.id}/like`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ liked: nextLiked }),
                    })
                      .then((res) => res.json().catch(() => ({})))
                      .then((data) => {
                        if (!data) return;
                        setCommentThreadsByPost((prev) => {
                          const current = prev[postId] || [];
                          const [nextThreads, updated] =
                            updateCommentLikeWithCount(
                              current,
                              comment.id,
                              data?.liked ?? nextLiked,
                              data?.like_count
                            );
                          if (!updated) return prev;
                          return { ...prev, [postId]: nextThreads };
                        });
                      })
                      .catch(() => {});
                    commentLikeDebounceRef.current.delete(comment.id);
                  }, 2000);
                  commentLikeDebounceRef.current.set(comment.id, {
                    timeoutId,
                    liked: nextLiked,
                  });
                }}
                className={`transition ${
                  comment.liked ? "text-cyan-300" : "hover:text-slate-200"
                }`}
              >
                Like
              </button>
              {!isEditing && canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => handleStartEditComment(comment)}
                    className="hover:text-slate-200 transition"
                  >
                    Edit
                  </button>
                </>
              )}
              {!isEditing && canDelete && (
                <button
                  type="button"
                  onClick={() => handleDeleteComment(postId, comment.id)}
                  className="hover:text-rose-300 transition"
                >
                  Delete
                </button>
              )}
              {likeCount > 0 && (
                <span>
                  {likeCount} {likeCount === 1 ? "like" : "likes"}
                </span>
              )}
            </div>
            {replyOpen && (
              <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                <div className="relative">
                  <textarea
                    value={replyDraft}
                    onChange={(event) =>
                      setReplyDrafts((prev) => ({
                        ...prev,
                        [comment.id]: event.target.value,
                      }))
                    }
                    rows={2}
                    placeholder={
                      currentUserId ? "Write a reply..." : "Sign in to reply"
                    }
                    disabled={!currentUserId}
                    className="w-full resize-none rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1 pr-12 pb-8 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openGifPicker({ type: "reply", commentId: comment.id })
                    }
                    className="absolute bottom-1.5 right-1.5 px-2 py-0.5 text-[10px] text-slate-300 hover:text-slate-100 transition"
                  >
                    GIF
                  </button>
                </div>
                {replyGif && (
                  <div className="mt-2 max-w-[75%] overflow-hidden rounded-lg mx-auto">
                    <img
                      src={replyGif.previewUrl || replyGif.url}
                      alt={replyGif.alt || "GIF"}
                      className="w-full max-h-48 object-contain"
                      loading="lazy"
                    />
                    <div className="flex justify-end p-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setReplyGifByComment((prev) => ({
                            ...prev,
                            [comment.id]: null,
                          }))
                        }
                        className="text-[11px] text-slate-300 hover:text-slate-100 transition"
                      >
                        Remove GIF
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    {currentUserId
                      ? `Replying as ${viewerName}`
                      : "Sign in to reply."}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleReplyComment(postId, comment.id)}
                    disabled={
                      !currentUserId || (!replyDraft.trim() && !replyGif)
                    }
                    className="px-2.5 py-1 rounded-full border border-slate-700 text-[11px] text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60 transition"
                  >
                    Reply
                  </button>
                </div>
              </div>
            )}
            {hasReplies && (
              <div className="mt-3 space-y-3">
                {visibleReplies.length > 0 && (
                  <div className="space-y-3">
                    {visibleReplies.map((reply) =>
                      renderCommentThread(reply, depth + 1, postId, isPostOwner)
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setRepliesExpandedByComment((prev) => ({
                      ...prev,
                      [comment.id]: !repliesExpanded,
                    }))
                  }
                  className="text-[11px] text-slate-400 hover:text-slate-200 transition"
                >
                  {repliesExpanded
                    ? "Hide replies"
                    : shouldCollapseReplies
                      ? `View ${remainingReplyCount} more ${
                          remainingReplyCount === 1 ? "reply" : "replies"
                        }`
                      : `View ${replyCount} ${
                          replyCount === 1 ? "reply" : "replies"
                        }`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const displayName = user.username || "User";
  const displayBio = loading
    ? "Loading your profile..."
    : user.bio || (isOwner ? "No bio yet. Add one in settings." : "No bio yet.");
  const displayAvatarUrl = resolveMediaUrl(user.avatar);
  const coverUrl = resolveMediaUrl(user.cover);
  const viewerName = currentUser?.username || "Guest";
  const viewerAvatarUrl = resolveMediaUrl(currentUser?.avatar);

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

  if (profileNotFound) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-2xl font-semibold">Page not found</div>
        </div>
      </div>
    );
  }

  const mainPaddingClass = isOwner ? "pt-20 sm:pt-24" : "pt-28 sm:pt-32";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div
        className={`relative h-44 xs:h-52 sm:h-64 lg:h-72 bg-gradient-to-br from-cyan-500/40 via-slate-900 to-slate-950 ${coverUrl ? "bg-cover bg-center" : ""} group`}
        style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_55%)]" />
        <div className="absolute inset-x-0 bottom-0 h-16 sm:h-20 bg-gradient-to-t from-slate-950 to-transparent" />
        {isOwner && (
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
        )}
        <div className="absolute inset-x-0 bottom-0 translate-y-1/3">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center gap-3 sm:gap-6 text-center">
            <div className="flex flex-col items-center gap-3 sm:gap-4 mt-3">
              <div className="h-20 w-20 sm:h-28 sm:w-28 lg:h-32 lg:w-32 rounded-full border-4 border-slate-950 bg-slate-900/80 overflow-hidden flex items-center justify-center text-xl sm:text-2xl font-semibold text-slate-300 shadow-xl">
                {displayAvatarUrl ? (
                  <img
                    src={displayAvatarUrl}
                    alt={displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  displayName.slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="space-y-1">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold">
                  {displayName}
                </h1>
                <p className="text-sm sm:text-base text-slate-100/90 font-medium max-w-2xl">
                  {displayBio}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm text-slate-300">
                  <div>
                    <span className="text-slate-100 font-semibold">0</span>{" "}
                    followers
                  </div>
                  <div>
                    <span className="text-slate-100 font-semibold">0</span>{" "}
                    following
                  </div>
                </div>
              </div>
              {!isOwner && (
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUserId) {
                        handleRequireAuth();
                        return;
                      }
                      setIsFollowing((prev) => !prev);
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      isFollowing
                        ? "border border-slate-700 text-slate-100 hover:border-slate-500"
                        : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                    }`}
                  >
                    {isFollowing ? "Following" : "Follow"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className={`max-w-6xl mx-auto px-4 sm:px-6 ${mainPaddingClass} pb-12`}>
        <div className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-slate-900">
          <div className="max-w-2xl mx-auto flex flex-wrap justify-center gap-2 sm:gap-3 py-4 sm:py-3">
            {["Posts", "Lists"].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setActiveTab(label)}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm border transition ${
                  label === activeTab
                    ? "bg-cyan-500 text-slate-950 border-cyan-400"
                    : "border-slate-800 text-slate-300 hover:border-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "Posts" && (
          <section className="p-0">
          {isOwner && (
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
          )}

          {isOwner && postMessage && (
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
              {posts.map((post) => {
                const comments = commentThreadsByPost[post.id] || [];
                const commentCount = countCommentThreads(comments);
                const topLevelCommentCount = comments.length;
                const commentDraft = commentDrafts[post.id] || "";
                const commentGif = commentGifByPost[post.id] || null;
                const commentsVisible = commentsExpandedByPost[post.id] ?? false;
                const commentListExpanded =
                  commentListExpandedByPost[post.id] ?? false;
                const shouldCollapseComments =
                  topLevelCommentCount > COMMENT_COLLAPSE_THRESHOLD;
                const visibleComments =
                  commentListExpanded || !shouldCollapseComments
                    ? comments
                    : comments.slice(0, COMMENT_COLLAPSE_THRESHOLD);
                const remainingCommentCount =
                  topLevelCommentCount - visibleComments.length;
                const toggleCommentsVisibility = (shouldFocusInput = false) => {
                  const nextVisible = !commentsVisible;
                  setCommentsExpandedByPost((prev) => ({
                    ...prev,
                    [post.id]: nextVisible,
                  }));
                  if (!nextVisible) {
                    setCommentListExpandedByPost((prev) => ({
                      ...prev,
                      [post.id]: false,
                    }));
                  }
                  if (nextVisible && shouldFocusInput) {
                    setTimeout(() => {
                      const input = commentInputRefs.current[post.id];
                      if (input) {
                        input.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                        input.focus();
                      }
                    }, 0);
                  }
                };
                return (
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
                        {displayAvatarUrl ? (
                          <img
                            src={displayAvatarUrl}
                            alt={displayName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          displayName.slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div>
                        <div className="text-sm sm:text-base font-semibold text-slate-100">
                          {displayName}
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
                    {isOwner && (
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
                    )}
                  </div>
                  {isOwner && editingPostId === post.id ? (
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
                      <button
                        type="button"
                        onClick={() => toggleCommentsVisibility(false)}
                        className="hover:text-slate-200 transition"
                      >
                        {commentCount}{" "}
                        {commentCount === 1 ? "comment" : "comments"}
                      </button>
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
                            if (action.label === "Comment") {
                              toggleCommentsVisibility(true);
                              return;
                            }
                            if (action.label !== "Like") return;
                            if (!currentUserId) {
                              handleRequireAuth();
                              return;
                            }
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
                  <div className="mt-4 space-y-4">
                    {commentsVisible && (
                      <>
                        <div className="flex gap-3">
                          <div className="h-9 w-9 rounded-full border border-slate-800 bg-slate-900/70 flex items-center justify-center text-xs font-semibold text-slate-200 overflow-hidden">
                            {viewerAvatarUrl ? (
                              <img
                                src={viewerAvatarUrl}
                                alt={viewerName}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              viewerName.slice(0, 1).toUpperCase()
                            )}
                          </div>
                          <div className="flex-1">
                          <div className="relative">
                            <textarea
                              value={commentDraft}
                              ref={(el) => {
                                if (el) {
                                  commentInputRefs.current[post.id] = el;
                                }
                              }}
                              onChange={(event) =>
                                setCommentDrafts((prev) => ({
                                  ...prev,
                                  [post.id]: event.target.value,
                                }))
                              }
                              rows={2}
                              placeholder={
                                currentUserId
                                  ? "Write a comment..."
                                  : "Sign in to comment"
                              }
                              disabled={!currentUserId}
                              className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 pr-16 pb-10 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60 disabled:opacity-60"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                openGifPicker({ type: "comment", postId: post.id })
                              }
                              className="absolute bottom-2 right-2 px-2.5 py-1 text-[11px] text-slate-300 hover:text-slate-100 transition"
                            >
                              GIF
                            </button>
                          </div>
                          {commentGif && (
                            <div className="mt-2 rounded-lg border border-slate-800 overflow-hidden bg-slate-900/40">
                              <img
                                src={commentGif.previewUrl || commentGif.url}
                                alt={commentGif.alt || "GIF"}
                                className="w-full max-h-56 object-contain"
                                loading="lazy"
                              />
                              <div className="flex justify-end p-2 border-t border-slate-800">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCommentGifByPost((prev) => ({
                                      ...prev,
                                      [post.id]: null,
                                    }))
                                  }
                                  className="text-xs text-slate-300 hover:text-slate-100 transition"
                                >
                                  Remove GIF
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                            <span>
                              {currentUserId
                                ? `Commenting as ${viewerName}`
                                  : "Sign in to join the conversation."}
                              </span>
                              <button
                                type="button"
                                onClick={() => handlePostComment(post.id)}
                                disabled={
                                  !currentUserId ||
                                  (!commentDraft.trim() && !commentGif)
                                }
                                className="px-3 py-1 rounded-full border border-slate-700 text-[11px] text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60 transition"
                              >
                                Post
                              </button>
                            </div>
                          </div>
                        </div>
                        {comments.length === 0 ? (
                          <div className="text-xs text-slate-500">
                            No comments yet. Start the conversation.
                          </div>
                        ) : (
                          <>
                            <div className="space-y-4">
                              {visibleComments.map((comment) =>
                                renderCommentThread(comment, 0, post.id, isOwner)
                              )}
                            </div>
                            {shouldCollapseComments && (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCommentListExpandedByPost((prev) => ({
                                      ...prev,
                                      [post.id]: !commentListExpanded,
                                    }))
                                  }
                                  className="text-[11px] text-slate-400 hover:text-slate-200 transition"
                                >
                                  {commentListExpanded
                                    ? "Hide comments"
                                    : `View ${remainingCommentCount} more comments`}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </section>
        )}

        {activeTab === "Lists" && (
          <section className="mt-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between gap-3" />
            {listsLoading ? (
              <div className="mt-6 text-sm text-slate-400">Loading lists...</div>
            ) : lists.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center text-sm text-slate-400">
                No public lists yet.
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {lists.map((list) => {
                  const posters = (list.movies || [])
                    .map((movie) =>
                      movie.poster_path
                        ? `${POSTER_BASE}${movie.poster_path}`
                        : ""
                    )
                    .filter(Boolean)
                    .slice(0, 3);
                  const offsets = [
                    "left-0 -rotate-6",
                    "left-5 rotate-0",
                    "left-10 rotate-6",
                  ];
                  return (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => {
                        if (!list.shareCode) return;
                        window.location.hash = `#list?code=${list.shareCode}`;
                      }}
                      className="p-3 w-full max-w-[340px] justify-self-start text-left hover:opacity-90 transition"
                    >
                      <div className="relative h-40 w-44">
                        {posters.length === 0 ? (
                          <div className="h-40 w-24 rounded-lg border border-dashed border-slate-700 bg-slate-900/40 flex items-center justify-center text-sm text-slate-500">
                            No posters
                          </div>
                        ) : (
                          posters.map((poster, index) => (
                            <div
                              key={`${list.id}-poster-${index}`}
                              className={`absolute top-0 ${offsets[index] || "left-10"} h-40 w-24 rounded-lg border border-slate-800 bg-slate-900/70 shadow-lg overflow-hidden`}
                              style={{ zIndex: index + 1 }}
                            >
                              <img
                                src={poster}
                                alt={list.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          ))
                        )}
                      </div>
                      <div className="mt-3">
                        <div className="text-lg font-semibold text-slate-100">
                          {list.name}
                        </div>
                        <div className="text-base text-slate-400 mt-1">
                          {list.movies?.length || 0} items
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}
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

      {deletePostId !== null && isOwner && (
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

      {createModalOpen && isOwner && (
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

      {gifPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={closeGifPicker}
            role="presentation"
          />
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Select GIF</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Search and pick a GIF to add to your{" "}
                  {gifPickerTarget?.type === "reply" ? "reply" : "comment"}.
                </p>
              </div>
              <button
                type="button"
                onClick={closeGifPicker}
                className="rounded-full border border-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100 transition"
              >
                Close
              </button>
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const trimmed = gifPickerQuery.trim();
                if (!trimmed) return;
                setGifPickerLoading(true);
                setGifPickerError("");
                if (gifPickerAbortRef.current) {
                  gifPickerAbortRef.current.abort();
                }
                const controller = new AbortController();
                gifPickerAbortRef.current = controller;
                try {
                  const results = await fetchKlipySearch(
                    trimmed,
                    controller.signal
                  );
                  setGifPickerResults(results);
                } catch (err) {
                  if (err?.name !== "AbortError") {
                    setGifPickerError(err.message || "Unable to load GIFs.");
                  }
                } finally {
                  setGifPickerLoading(false);
                }
              }}
              className="mt-4 flex gap-2"
            >
              <input
                value={gifPickerQuery}
                onChange={(event) => setGifPickerQuery(event.target.value)}
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
            <div className="mt-4">
              {gifPickerLoading ? (
                <div className="text-xs text-slate-400">Loading GIFs...</div>
              ) : gifPickerError ? (
                <div className="text-xs text-rose-300">{gifPickerError}</div>
              ) : gifPickerResults.length === 0 ? (
                <div className="text-xs text-slate-400">
                  No GIFs yet. Try searching for something.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                  {gifPickerResults.map((gif) => (
                    <button
                      key={gif.id}
                      type="button"
                      onClick={() => {
                        if (!gifPickerTarget) return;
                        if (gifPickerTarget.type === "comment") {
                          setCommentGifByPost((prev) => ({
                            ...prev,
                            [gifPickerTarget.postId]: gif,
                          }));
                        } else if (gifPickerTarget.type === "reply") {
                          setReplyGifByComment((prev) => ({
                            ...prev,
                            [gifPickerTarget.commentId]: gif,
                          }));
                        }
                        closeGifPicker();
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
          </div>
        </div>
      )}

      {showAuthModal && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuthModal(false)}
          onToggleMode={() =>
            setAuthMode((prev) => (prev === "signin" ? "signup" : "signin"))
          }
          onAuthSuccess={handleAuthSuccess}
        />
      )}
    </div>
  );
}

export default DashboardPage;
