import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "./supabaseClient.js";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

const POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

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
  getRoomByCode: async (code, signal) => {
    return fetchApiJson(`/api/rooms/code/${code}`, signal);
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

function RoomWatchPage({ code = "" }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [voiceChatAllowed, setVoiceChatAllowed] = useState(true);
  const [voiceChatEnabled, setVoiceChatEnabled] = useState(false);
  const [textChatEnabled, setTextChatEnabled] = useState(true);
  const [roomTitle, setRoomTitle] = useState("Room");
  const [mediaId, setMediaId] = useState(null);
  const [mediaType, setMediaType] = useState("movie");
  const [roomId, setRoomId] = useState(null);
  const [roomCode, setRoomCode] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [displayName, setDisplayName] = useState("Guest");
  const [shareMessage, setShareMessage] = useState("");
  const [hostError, setHostError] = useState("");
  const [roomPaused, setRoomPaused] = useState(false);
  const [micStatus, setMicStatus] = useState("idle");
  const [micError, setMicError] = useState("");
  const [voicePeers, setVoicePeers] = useState(0);
  const [selectedSeason] = useState(1);
  const [selectedEpisode] = useState(1);
  const abortRef = useRef(null);
  const channelRef = useRef(null);
  const roomPausedRef = useRef(false);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const remoteAudioRef = useRef(new Map());
  const remoteAudioContainerRef = useRef(null);
  const clientIdRef = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `guest-${Math.random().toString(16).slice(2)}`
  );
  const [channelReady, setChannelReady] = useState(false);
  const voiceChatEnabledRef = useRef(voiceChatEnabled);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef(null);

  useEffect(() => {
    voiceChatEnabledRef.current = voiceChatEnabled;
  }, [voiceChatEnabled]);

  useEffect(() => {
    if (!voiceChatAllowed && voiceChatEnabled) {
      setVoiceChatEnabled(false);
    }
  }, [voiceChatAllowed, voiceChatEnabled]);

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
    setDetails(null);
    setMediaId(null);
    setMediaType("movie");
    setRoomTitle("Room");
    setRoomId(null);
    setRoomCode("");
    setIsHost(false);
    setShareMessage("");
    setHostError("");
    setRoomPaused(false);

    const run = async () => {
      try {
        if (!code) {
          throw new Error("Room code is required.");
        }
        const room = await tmdbClient.getRoomByCode(code, controller.signal);
        const roomData = room?.room;
        if (!roomData?.media_id || !roomData?.media_type) {
          throw new Error("Room data is incomplete.");
        }
        setRoomId(roomData.id);
        setRoomCode(roomData.room_code || code);
        setRoomTitle(roomData.title || "Room");
        setVoiceChatAllowed(Boolean(roomData.voice_chat_enabled));
        setTextChatEnabled(Boolean(roomData.text_chat_enabled));
        setMediaId(roomData.media_id);
        setMediaType(roomData.media_type === "tv" ? "tv" : "movie");
        try {
          const meResponse = await fetch(`${API_BASE}/api/auth/me`, {
            credentials: "include",
          });
          const meData = await meResponse.json().catch(() => ({}));
          const meId = Number(meData?.user?.id);
          const ownerId = Number(roomData.user_id);
          const username =
            meData?.user?.username ||
            (typeof meData?.user?.email === "string"
              ? meData.user.email.split("@")[0]
              : "");
          if (username) {
            setDisplayName(username);
          }
          if (meResponse.ok && Number.isFinite(meId) && meId === ownerId) {
            setIsHost(true);
            if (!username) {
              setDisplayName("Host");
            }
          }
        } catch (err) {
          // Ignore auth lookup errors for guests.
        }
        const detailData = await tmdbClient.getDetails(
          roomData.media_type === "tv" ? "tv" : "movie",
          roomData.media_id,
          controller.signal
        );
        setDetails(detailData);
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
  }, [code]);

  useEffect(() => {
    roomPausedRef.current = roomPaused;
  }, [roomPaused]);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  const cleanupPeer = (peerId) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try {
        pc.close();
      } catch (err) {
        // Ignore close errors.
      }
      peerConnectionsRef.current.delete(peerId);
    }
    const audioEl = remoteAudioRef.current.get(peerId);
    if (audioEl && audioEl.parentNode) {
      audioEl.parentNode.removeChild(audioEl);
    }
    remoteAudioRef.current.delete(peerId);
    setVoicePeers(peerConnectionsRef.current.size);
  };

  const stopLocalStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    localStreamRef.current = null;
  };

  const closeAllPeers = () => {
    Array.from(peerConnectionsRef.current.keys()).forEach((peerId) =>
      cleanupPeer(peerId)
    );
  };

  const ensureLocalStream = async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }
    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error("Microphone not supported.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    return stream;
  };

  const attachRemoteStream = (peerId, stream) => {
    if (!remoteAudioContainerRef.current || !stream) return;
    let audioEl = remoteAudioRef.current.get(peerId);
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.muted = false;
      audioEl.volume = 1;
      audioEl.setAttribute("data-peer", peerId);
      remoteAudioContainerRef.current.appendChild(audioEl);
      remoteAudioRef.current.set(peerId, audioEl);
    }
    audioEl.srcObject = stream;
    const playPromise = audioEl.play?.();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  };

  const createPeerConnection = (peerId) => {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (event) => {
      if (!event.candidate || !channelRef.current) return;
      channelRef.current.send({
        type: "broadcast",
        event: "webrtc-ice",
        payload: {
          from: clientIdRef.current,
          to: peerId,
          candidate: event.candidate,
        },
      });
    };
    pc.ontrack = (event) => {
      const [stream] = event.streams || [];
      if (stream) {
        attachRemoteStream(peerId, stream);
      }
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        cleanupPeer(peerId);
      }
    };
    peerConnectionsRef.current.set(peerId, pc);
    setVoicePeers(peerConnectionsRef.current.size);
    return pc;
  };

  const startVoiceChat = async () => {
    if (!voiceChatAllowed || !voiceChatEnabled || !channelRef.current) return;
    setMicError("");
    setMicStatus("starting");
    try {
      const stream = await ensureLocalStream();
      stream.getTracks().forEach((track) => {
        if (track.kind === "audio") {
          track.enabled = true;
        }
      });
      setMicStatus("active");
      channelRef.current.send({
        type: "broadcast",
        event: "webrtc-join",
        payload: { from: clientIdRef.current },
      });
    } catch (err) {
      setMicStatus("error");
      setMicError(err.message || "Microphone unavailable.");
    }
  };

  const stopVoiceChat = () => {
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "webrtc-leave",
        payload: { from: clientIdRef.current },
      });
    }
    closeAllPeers();
    stopLocalStream();
    setVoicePeers(0);
    setMicStatus("idle");
  };

  useEffect(() => {
    if (!code || !supabase) {
      return undefined;
    }
    const channel = supabase.channel(`room-watch:${code}`, {
      config: { broadcast: { self: true } },
    });

    channel.on("broadcast", { event: "playback" }, (payload) => {
      const paused = payload?.payload?.paused;
      if (typeof paused === "boolean") {
        setRoomPaused(paused);
      }
    });

    channel.on("broadcast", { event: "state_sync" }, (payload) => {
      const paused = payload?.payload?.paused;
      if (typeof paused === "boolean") {
        setRoomPaused(paused);
      }
    });

    channel.on("broadcast", { event: "state_request" }, () => {
      if (!isHost) return;
      channel.send({
        type: "broadcast",
        event: "state_sync",
        payload: { paused: roomPausedRef.current },
      });
    });

    channel.on("broadcast", { event: "webrtc-join" }, async (payload) => {
      const data = payload?.payload || {};
      const peerId = data?.from;
      if (!peerId || peerId === clientIdRef.current) return;
      if (!voiceChatAllowed || !voiceChatEnabledRef.current) return;
      const pc = createPeerConnection(peerId);
      try {
        const stream = await ensureLocalStream();
        stream.getTracks().forEach((track) => {
          const hasTrack = pc
            .getSenders()
            .some((sender) => sender.track === track);
          if (!hasTrack) {
            pc.addTrack(track, stream);
          }
        });
        if (clientIdRef.current < peerId) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          channel.send({
            type: "broadcast",
            event: "webrtc-offer",
            payload: {
              from: clientIdRef.current,
              to: peerId,
              sdp: pc.localDescription,
            },
          });
        }
      } catch (err) {
        setMicStatus("error");
        setMicError(err.message || "Microphone unavailable.");
      }
    });

    channel.on("broadcast", { event: "webrtc-offer" }, async (payload) => {
      const data = payload?.payload || {};
      const peerId = data?.from;
      if (!peerId || peerId === clientIdRef.current) return;
      if (data?.to && data.to !== clientIdRef.current) return;
      if (!voiceChatAllowed || !voiceChatEnabledRef.current) return;
      const pc = createPeerConnection(peerId);
      try {
        await pc.setRemoteDescription(data.sdp);
        const stream = await ensureLocalStream();
        stream.getTracks().forEach((track) => {
          const hasTrack = pc
            .getSenders()
            .some((sender) => sender.track === track);
          if (!hasTrack) {
            pc.addTrack(track, stream);
          }
        });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        channel.send({
          type: "broadcast",
          event: "webrtc-answer",
          payload: {
            from: clientIdRef.current,
            to: peerId,
            sdp: pc.localDescription,
          },
        });
      } catch (err) {
        setMicStatus("error");
        setMicError(err.message || "Microphone unavailable.");
      }
    });

    channel.on("broadcast", { event: "webrtc-answer" }, async (payload) => {
      const data = payload?.payload || {};
      const peerId = data?.from;
      if (!peerId || peerId === clientIdRef.current) return;
      if (data?.to && data.to !== clientIdRef.current) return;
      const pc = peerConnectionsRef.current.get(peerId);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(data.sdp);
      } catch (err) {
        // Ignore bad answers.
      }
    });

    channel.on("broadcast", { event: "webrtc-ice" }, async (payload) => {
      const data = payload?.payload || {};
      const peerId = data?.from;
      if (!peerId || peerId === clientIdRef.current) return;
      if (data?.to && data.to !== clientIdRef.current) return;
      const pc = peerConnectionsRef.current.get(peerId);
      if (!pc || !data?.candidate) return;
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        // Ignore ICE failures.
      }
    });

    channel.on("broadcast", { event: "webrtc-leave" }, (payload) => {
      const data = payload?.payload || {};
      const peerId = data?.from;
      if (!peerId || peerId === clientIdRef.current) return;
      cleanupPeer(peerId);
    });

    channel.on("broadcast", { event: "chat" }, (payload) => {
      const data = payload?.payload || {};
      const message = typeof data?.message === "string" ? data.message : "";
      if (!message.trim()) return;
      setChatMessages((prev) => {
        if (data?.id && prev.some((item) => item.id === data.id)) {
          return prev;
        }
        return [
          ...prev,
          {
            id: data?.id || `${data?.from || "guest"}-${Date.now()}`,
            name: data?.name || "Guest",
            message,
            tone: data?.tone || "default",
          },
        ];
      });
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setChannelReady(true);
        channel.send({
          type: "broadcast",
          event: "state_request",
          payload: {},
        });
      }
    });

    channelRef.current = channel;

    return () => {
      stopVoiceChat();
      channelRef.current = null;
      setChannelReady(false);
      supabase.removeChannel(channel);
    };
  }, [code, isHost, voiceChatAllowed]);

  useEffect(() => {
    if (!isHost || !channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "playback",
      payload: { paused: roomPaused },
    });
  }, [isHost, roomPaused]);

  useEffect(() => {
    if (!channelReady) return;
    if (voiceChatAllowed && voiceChatEnabled) {
      startVoiceChat();
    } else {
      stopVoiceChat();
    }
  }, [voiceChatAllowed, voiceChatEnabled, channelReady]);

  const title = details?.title || details?.name || "Loading...";
  const releaseDate = details?.release_date || details?.first_air_date || "";
  const year = releaseDate ? releaseDate.slice(0, 4) : null;
  const runtime = formatRuntime(details, mediaType);
  const genres = details?.genres?.length
    ? details.genres.map((g) => g.name).join(" / ")
    : null;
  const rating = details?.vote_average
    ? details.vote_average.toFixed(1)
    : null;
  const imdbId = details?.imdb_id;
  const poster = details?.poster_path
    ? `${POSTER_BASE}${details.poster_path}`
    : null;
  const playerUrl =
    mediaId && mediaType === "tv"
      ? `https://vidsrc-embed.ru/embed/tv?tmdb=${mediaId}&season=${selectedSeason}&episode=${selectedEpisode}`
      : imdbId
      ? `https://vidsrc-embed.ru/embed/movie/${imdbId}`
      : "";

  const summary = useMemo(
    () =>
      [year, runtime, genres, rating && `${rating} rating`]
        .filter(Boolean)
        .join(" / "),
    [genres, rating, runtime, year]
  );

  const handleShare = async () => {
    if (!roomCode) return;
    const url = `${window.location.origin}${window.location.pathname}#room-watch?code=${roomCode}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setShareMessage("Copied");
      setTimeout(() => setShareMessage(""), 1500);
    } catch (err) {
      setShareMessage("Copy failed");
      setTimeout(() => setShareMessage(""), 1500);
    }
  };

  const handleTogglePause = () => {
    if (!isHost) return;
    setRoomPaused((prev) => !prev);
  };

  const handleCloseRoom = async () => {
    if (!roomId) return;
    setHostError("");
    try {
      const response = await fetch(`${API_BASE}/api/rooms/${roomId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || "Unable to close room.");
      }
      window.location.hash = "#account?tab=rooms";
    } catch (err) {
      setHostError(err.message || "Unable to close room.");
    }
  };

  const handleSendMessage = () => {
    if (!textChatEnabled || !supabase || !channelRef.current) return;
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    const messageId = `${clientIdRef.current}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    const payload = {
      id: messageId,
      from: clientIdRef.current,
      name: displayName || (isHost ? "Host" : "Guest"),
      message: trimmed,
      tone: isHost ? "accent" : "default",
    };
    channelRef.current.send({
      type: "broadcast",
      event: "chat",
      payload,
    });
    setChatMessages((prev) => [
      ...prev,
      {
        id: payload.id,
        name: payload.name,
        message: payload.message,
        tone: payload.tone,
      },
    ]);
    setChatInput("");
  };

  const chatAvailable = textChatEnabled && Boolean(supabase);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="sticky top-0 z-40 backdrop-blur bg-slate-950/70 border-b border-slate-900/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a
              href="#browse"
              className="h-9 w-9 rounded-full border border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-600 transition flex items-center justify-center"
              aria-label="Back to browse"
            >
              <ArrowLeftIcon />
            </a>
            <div className="text-lg font-semibold tracking-tight">Giostream</div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
            <a href="#" className="hover:text-slate-100 transition">
              Home
            </a>
            <a href="#browse" className="hover:text-slate-100 transition">
              Browse
            </a>
          </nav>
          <div className="text-xs text-slate-400">Room watch</div>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-[1.6fr_0.7fr]">
          <section className="space-y-6">
            <motion.div
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    {roomTitle}
                  </div>
                  <div className="text-sm font-semibold text-slate-100 mt-1">
                    {title}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isHost && (
                    <>
                      <button
                        type="button"
                        onClick={handleTogglePause}
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-slate-500 transition"
                      >
                        {roomPaused ? "Resume" : "Pause"}
                      </button>
                      <button
                        type="button"
                        onClick={handleShare}
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-slate-500 transition"
                      >
                        {shareMessage ? shareMessage : "Share"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCloseRoom}
                        className="rounded-full border border-rose-400/50 px-3 py-1 text-xs text-rose-100 hover:border-rose-300 transition"
                      >
                        Close
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!voiceChatAllowed) return;
                      setVoiceChatEnabled((prev) => !prev);
                    }}
                    disabled={!voiceChatAllowed}
                    className={`h-9 w-9 rounded-full border text-xs transition flex items-center justify-center ${
                      voiceChatEnabled
                        ? "border-cyan-400 bg-cyan-500 text-slate-950"
                        : "border-slate-700 bg-slate-900/70 text-slate-200"
                    } ${
                      voiceChatAllowed
                        ? ""
                        : "opacity-50 cursor-not-allowed"
                    }`}
                    aria-pressed={voiceChatEnabled}
                    title={
                      !voiceChatAllowed
                        ? "Voice chat disabled for this room"
                        : voiceChatEnabled
                        ? micStatus === "active"
                          ? "Mic on"
                          : micStatus === "starting"
                          ? "Starting mic"
                          : micStatus === "error"
                          ? "Mic blocked"
                          : "Mic on"
                        : "Mic off"
                    }
                  >
                    <MicIcon muted={!voiceChatEnabled} />
                  </button>
                </div>
              </div>
              <div className="px-4 pb-3 text-xs text-slate-500 flex items-center justify-between">
                <span>
                  Voice:{" "}
                  {!voiceChatAllowed
                    ? "off"
                    : micStatus === "active"
                    ? "on"
                    : micStatus === "starting"
                    ? "starting"
                    : micStatus === "error"
                    ? "blocked"
                    : "off"}
                </span>
                <span>Peers: {voicePeers}</span>
              </div>
              {micError && (
                <div className="px-4 pb-3 text-xs text-rose-300">
                  {micError}
                </div>
              )}
              <div className="aspect-[16/9] bg-slate-900">
                {playerUrl ? (
                  <div className="relative h-full w-full">
                    <iframe
                      title="Player"
                      src={playerUrl}
                      className="h-full w-full"
                      frameBorder="0"
                      sandbox="allow-scripts allow-same-origin allow-presentation"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                    />
                    {roomPaused && (
                      <div className="absolute inset-0 bg-slate-950/70 flex items-center justify-center text-sm text-slate-200">
                        Playback paused by host.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-sm text-slate-400">
                    Player is loading...
                  </div>
                )}
              </div>
            </motion.div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              {error && (
                <div className="text-sm text-slate-300">{error}</div>
              )}
              {hostError && (
                <div className="text-sm text-rose-300 mt-2">{hostError}</div>
              )}
              {loading && !error && (
                <div className="text-sm text-slate-400">Loading details...</div>
              )}
              {!loading && !error && (
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
                      {details?.tagline || "Room is live. Share the code below."}
                    </div>
                    {summary && (
                      <div className="text-xs text-slate-400">{summary}</div>
                    )}
                  </div>
                </div>
              )}
              {!loading && !error && (
                <p className="mt-4 text-sm text-slate-300">
                  {details?.overview || "No overview available."}
                </p>
              )}
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 flex flex-col min-h-[520px] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80">
              <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
                Room chat
              </div>
              <div className="text-sm text-slate-300 mt-1">
                {!supabase
                  ? "Chat unavailable (realtime not configured)."
                  : textChatEnabled
                  ? "Chat is live."
                  : "Chat is paused."}
              </div>
            </div>
            <div
              ref={chatScrollRef}
              className="flex-1 px-4 py-4 space-y-4 overflow-y-auto"
            >
              {chatMessages.length === 0 ? (
                <div className="text-xs text-slate-500">
                  No messages yet.
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <ChatBubble
                    key={msg.id}
                    name={msg.name}
                    message={msg.message}
                    tone={msg.tone}
                  />
                ))
              )}
            </div>
            <div className="p-4 border-t border-slate-800 bg-slate-900/80">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder={
                    chatAvailable ? "Send a message" : "Chat is off"
                  }
                  disabled={!chatAvailable}
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60 disabled:opacity-60"
                />
                <button
                  type="button"
                  disabled={!chatAvailable}
                  onClick={handleSendMessage}
                  className="px-4 py-2 rounded-full bg-cyan-500 text-slate-950 text-sm font-medium hover:bg-cyan-400 transition disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </div>
          </aside>
        </div>
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
      <div ref={remoteAudioContainerRef} className="sr-only" />
    </div>
  );
}

function ChatBubble({ name, message, tone = "default" }) {
  return (
    <div
      className={`rounded-2xl border px-3 py-2 text-xs ${
        tone === "accent"
          ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
          : "border-slate-800 bg-slate-900/60 text-slate-200"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
        {name}
      </div>
      <div className="mt-1">{message}</div>
    </div>
  );
}

function MicIcon({ muted }) {
  return muted ? (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <path d="M15 9V6a3 3 0 0 0-5.42-1.68" />
      <path d="M19 11a7 7 0 0 1-7 7" />
      <path d="M5 11a7 7 0 0 0 7 7" />
      <line x1="4" y1="4" x2="20" y2="20" />
    </svg>
  ) : (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
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

export default RoomWatchPage;
