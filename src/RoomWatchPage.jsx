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
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [isRoomClosed, setIsRoomClosed] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [activeTab, setActiveTab] = useState("chat"); // 'chat' or 'details'
  const [currentUser, setCurrentUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const abortRef = useRef(null);
  const channelRef = useRef(null);
  const roomPausedRef = useRef(false);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const remoteAudioRef = useRef(new Map());
  const remoteAudioContainerRef = useRef(null);
  const pendingIceCandidatesRef = useRef(new Map());
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
  const hasTrackedPresenceRef = useRef(false);

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
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chatMessages]);

  useEffect(() => {
    const fetchSessionInitial = async () => {
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
    fetchSessionInitial();
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

        let user = currentUser;
        if (!user) {
          const meResponse = await fetch(`${API_BASE}/api/auth/me`, {
            credentials: "include",
          });
          const meData = await meResponse.json().catch(() => ({}));

          if (!meData?.user) {
            setShowAuthModal(true);
            setLoading(false);
            return;
          }
          user = meData.user;
          setCurrentUser(user);
        }

        const meId = Number(user?.id);
        const username =
          user?.username ||
          (typeof user?.email === "string"
            ? user.email.split("@")[0]
            : "");
        if (username) {
          setDisplayName(username);
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

        const ownerId = Number(roomData.user_id);
        if (Number.isFinite(meId) && meId === ownerId) {
          setIsHost(true);
          if (!username) {
            setDisplayName("Host");
          }
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
  }, [code, currentUser]);

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

    // Set srcObject and handle playback
    if (audioEl.srcObject !== stream) {
      audioEl.srcObject = stream;
    }

    // Ensure audio plays with better error handling
    const playAudio = async () => {
      try {
        await audioEl.play();
      } catch (err) {
        // Broadly detect autoplay/interaction issues
        if (err.name === "NotAllowedError" || err.name === "NotSupportedError") {
          setIsAudioBlocked(true);
        }
        // Retry after a short delay if autoplay fails
        setTimeout(() => {
          audioEl.play().catch(() => {
            console.warn(`Failed to play audio for peer ${peerId}`);
            setIsAudioBlocked(true);
          });
        }, 100);
      }
    };
    playAudio();
  };

  const handleUnmuteAll = async () => {
    setIsAudioBlocked(false);
    const audioEls = Array.from(remoteAudioRef.current.values());
    for (const el of audioEls) {
      try {
        await el.play();
      } catch (err) {
        console.error("Failed to unmute audio element:", err);
        setIsAudioBlocked(true);
      }
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
      if (pc.connectionState === "connected") {
        console.log(`Peer ${peerId} connected`);
      } else if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        console.log(`Peer ${peerId} ${pc.connectionState}`);
        if (pc.connectionState === "failed") {
          cleanupPeer(peerId);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        console.log(`ICE connection failed for peer ${peerId}`);
        cleanupPeer(peerId);
      }
    };

    peerConnectionsRef.current.set(peerId, pc);
    setVoicePeers(peerConnectionsRef.current.size);
    return pc;
  };

  const ensureRecvOnlyAudio = (pc) => {
    if (!pc?.getTransceivers || !pc?.addTransceiver) return;

    const transceivers = pc.getTransceivers();
    const audioTransceiver = transceivers.find((t) => t.receiver?.track?.kind === "audio");

    if (audioTransceiver) {
      // Only set to recvonly if we're not currently sending
      // and the current direction allows receiving
      const currentDir = audioTransceiver.direction;
      if (currentDir === "inactive" || currentDir === "sendonly") {
        audioTransceiver.direction = "recvonly";
      }
      // If it's already sendrecv or recvonly, leave it as is to preserve remote tracks
    } else {
      // Add receive-only audio transceiver so we can hear others even if our mic is off
      pc.addTransceiver("audio", { direction: "recvonly" });
    }
  };

  const sendVoiceJoin = () => {
    if (!voiceChatAllowed || !channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "webrtc-join",
      payload: { from: clientIdRef.current },
    });
  };

  const enableMic = async () => {
    if (!voiceChatAllowed || !channelRef.current) return;
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
      const renegotiations = [];
      peerConnectionsRef.current.forEach((pc, peerId) => {
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) return;

        // Check if we already have a sender for this track
        const senders = pc.getSenders();
        const audioSender = senders.find((sender) => sender.track?.kind === "audio");

        if (audioSender) {
          // Replace the track in the existing sender
          audioSender.replaceTrack(audioTrack).catch((err) => {
            console.warn(`Failed to replace track for peer ${peerId}:`, err);
          });

          // Update transceiver direction to sendrecv
          const transceivers = pc.getTransceivers();
          const audioTransceiver = transceivers.find((t) => t.sender === audioSender);
          if (audioTransceiver && audioTransceiver.direction !== "sendrecv") {
            audioTransceiver.direction = "sendrecv";
          }
        } else {
          // Add the track if no sender exists
          pc.addTrack(audioTrack, stream);
        }

        // Renegotiate with this peer
        if (channelRef.current) {
          renegotiations.push(
            pc
              .createOffer()
              .then((offer) => pc.setLocalDescription(offer))
              .then(() => {
                channelRef.current.send({
                  type: "broadcast",
                  event: "webrtc-offer",
                  payload: {
                    from: clientIdRef.current,
                    to: peerId,
                    sdp: pc.localDescription,
                  },
                });
              })
              .catch((err) => {
                console.error(`Failed to renegotiate with peer ${peerId}:`, err);
              })
          );
        }
      });
      if (renegotiations.length === 0) {
        sendVoiceJoin();
      } else {
        await Promise.all(renegotiations);
      }
    } catch (err) {
      setMicStatus("error");
      setMicError(err.message || "Microphone unavailable.");
    }
  };

  const disableMic = () => {
    // Stop the local stream
    stopLocalStream();

    // Update all peer connections to receive-only
    peerConnectionsRef.current.forEach((pc, peerId) => {
      const senders = pc.getSenders();
      const audioSender = senders.find((sender) => sender.track?.kind === "audio");

      if (audioSender) {
        // Remove the track from the sender
        audioSender.replaceTrack(null).catch((err) => {
          console.warn(`Failed to remove track for peer ${peerId}:`, err);
        });

        // Update transceiver direction to recvonly so we can still hear others
        const transceivers = pc.getTransceivers();
        const audioTransceiver = transceivers.find((t) => t.sender === audioSender);
        if (audioTransceiver && audioTransceiver.direction !== "recvonly") {
          audioTransceiver.direction = "recvonly";
        }

        // Renegotiate with this peer
        if (channelRef.current) {
          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              channelRef.current.send({
                type: "broadcast",
                event: "webrtc-offer",
                payload: {
                  from: clientIdRef.current,
                  to: peerId,
                  sdp: pc.localDescription,
                },
              });
            })
            .catch((err) => {
              console.error(`Failed to renegotiate after muting with peer ${peerId}:`, err);
            });
        }
      }
    });

    setMicStatus("idle");
  };

  const stopVoiceSession = () => {
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
      config: {
        broadcast: { self: true },
        presence: { key: clientIdRef.current }
      },
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
      if (!voiceChatAllowed) return;

      const pc = createPeerConnection(peerId);

      try {
        // Always add a receive-only audio transceiver first
        // This ensures we can receive audio even if our mic is off
        if (!pc.getTransceivers().some((t) => t.receiver?.track?.kind === "audio")) {
          pc.addTransceiver("audio", { direction: "recvonly" });
        }

        // If mic is enabled, add our audio track and change direction to sendrecv
        if (voiceChatEnabledRef.current) {
          const stream = await ensureLocalStream();
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            const transceivers = pc.getTransceivers();
            const audioTransceiver = transceivers.find((t) => t.receiver?.track?.kind === "audio");
            if (audioTransceiver) {
              // Replace the track and change direction to sendrecv
              const sender = audioTransceiver.sender;
              await sender.replaceTrack(audioTrack);
              audioTransceiver.direction = "sendrecv";
            } else {
              // Fallback: add track normally
              pc.addTrack(audioTrack, stream);
            }
          }
        }

        // Always create offer if we have lower client ID
        // This establishes the connection even if neither has mic enabled
        if (clientIdRef.current < peerId) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          console.log(`Sending offer to ${peerId}, mic enabled: ${voiceChatEnabledRef.current}`);
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
        console.error(`Error handling webrtc-join from ${peerId}:`, err);
        // Only set error status if we were trying to enable mic
        if (voiceChatEnabledRef.current) {
          setMicStatus("error");
          setMicError(err.message || "Microphone unavailable.");
        }
      }
    });

    channel.on("broadcast", { event: "webrtc-offer" }, async (payload) => {
      const data = payload?.payload || {};
      const peerId = data?.from;
      if (!peerId || peerId === clientIdRef.current) return;
      if (data?.to && data.to !== clientIdRef.current) return;
      if (!voiceChatAllowed) return;

      const pc = createPeerConnection(peerId);

      try {
        console.log(`Received offer from ${peerId}`);
        await pc.setRemoteDescription(data.sdp);

        // Process any pending ICE candidates now that remote description is set
        const pendingCandidates = pendingIceCandidatesRef.current.get(peerId) || [];
        for (const candidate of pendingCandidates) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (err) {
            console.warn(`Failed to add pending ICE candidate for ${peerId}:`, err);
          }
        }
        pendingIceCandidatesRef.current.delete(peerId);

        // Check if we need to add receive-only transceiver
        const transceivers = pc.getTransceivers();
        if (!transceivers.some((t) => t.receiver?.track?.kind === "audio")) {
          pc.addTransceiver("audio", { direction: "recvonly" });
        }

        // If mic is enabled, add our audio track
        if (voiceChatEnabledRef.current) {
          const stream = await ensureLocalStream();
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            const audioTransceiver = transceivers.find((t) => t.receiver?.track?.kind === "audio");
            if (audioTransceiver && audioTransceiver.sender) {
              await audioTransceiver.sender.replaceTrack(audioTrack);
              audioTransceiver.direction = "sendrecv";
            } else {
              pc.addTrack(audioTrack, stream);
            }
          }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log(`Sending answer to ${peerId}, mic enabled: ${voiceChatEnabledRef.current}`);
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
        console.error(`Error handling webrtc-offer from ${peerId}:`, err);
        // Only set error status if we were trying to enable mic
        if (voiceChatEnabledRef.current) {
          setMicStatus("error");
          setMicError(err.message || "Microphone unavailable.");
        }
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

        // Process any pending ICE candidates now that remote description is set
        const pendingCandidates = pendingIceCandidatesRef.current.get(peerId) || [];
        for (const candidate of pendingCandidates) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (err) {
            console.warn(`Failed to add pending ICE candidate for ${peerId}:`, err);
          }
        }
        pendingIceCandidatesRef.current.delete(peerId);
      } catch (err) {
        console.error(`Error setting remote description from ${peerId}:`, err);
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
        // Only add ICE candidate if remote description is set
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(data.candidate);
        } else {
          // Buffer the candidate until remote description is set
          const pending = pendingIceCandidatesRef.current.get(peerId) || [];
          pending.push(data.candidate);
          pendingIceCandidatesRef.current.set(peerId, pending);
        }
      } catch (err) {
        console.warn(`Failed to add ICE candidate for ${peerId}:`, err);
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

    channel.on("presence", { event: "join" }, ({ newPresences }) => {
      newPresences.forEach((p) => {
        const name = p.name || "A user";
        setChatMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (
            lastMsg &&
            lastMsg.tone === "system-join" &&
            lastMsg.message === `${name} joined the room` &&
            Date.now() - (parseInt(lastMsg.id.split("-").pop()) || 0) < 5000
          ) {
            return prev;
          }
          return [
            ...prev,
            {
              id: `system-join-${p.id || Math.random()}-${Date.now()}`,
              name: "System",
              message: `${name} joined the room`,
              tone: "system-join",
            },
          ];
        });
      });
    });

    channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
      leftPresences.forEach((p) => {
        const name = p.name || "A user";
        setChatMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (
            lastMsg &&
            lastMsg.tone === "system-leave" &&
            lastMsg.message === `${name} left the room` &&
            Date.now() - (parseInt(lastMsg.id.split("-").pop()) || 0) < 5000
          ) {
            return prev;
          }
          return [
            ...prev,
            {
              id: `system-leave-${p.id || Math.random()}-${Date.now()}`,
              name: "System",
              message: `${name} left the room`,
              tone: "system-leave",
            },
          ];
        });
      });
    });

    channel.on("broadcast", { event: "room_closed" }, () => {
      if (!isHost) {
        setIsRoomClosed(true);
      }
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setChannelReady(true);
        // Presence tracking is handled by the useEffect below when displayName is ready
        channel.send({
          type: "broadcast",
          event: "state_request",
          payload: {},
        });
      }
    });

    channelRef.current = channel;

    return () => {
      stopVoiceSession();
      channelRef.current = null;
      setChannelReady(false);
      hasTrackedPresenceRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [code, isHost, voiceChatAllowed]);

  useEffect(() => {
    if (channelReady && channelRef.current && displayName && !hasTrackedPresenceRef.current) {
      channelRef.current.track({
        name: displayName,
        id: clientIdRef.current,
      });
      hasTrackedPresenceRef.current = true;
    }
  }, [displayName, channelReady]);

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
    if (voiceChatAllowed) {
      sendVoiceJoin();
    } else {
      stopVoiceSession();
    }
  }, [voiceChatAllowed, channelReady]);

  useEffect(() => {
    if (!channelReady || !voiceChatAllowed) return;
    if (voiceChatEnabled) {
      enableMic();
    } else {
      disableMic();
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
      ? `https://vidsrc.cc/v2/embed/tv/${mediaId}/${selectedSeason}/${selectedEpisode}`
      : imdbId
        ? `https://vidsrc.cc/v2/embed/movie/${imdbId}`
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
      // Notify other participants that the room is closing
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "room_closed",
          payload: { from: clientIdRef.current },
        });
      }

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
    // Message will be added via broadcast listener (self: true is enabled)
    setChatInput("");
  };

  const chatAvailable = textChatEnabled && channelReady;

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

      <main className="relative max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-10 pt-2 pb-8">
        <div className="grid gap-10 lg:grid-cols-[2.5fr_0.5fr]">
          <section className={`space-y-6 transition-all duration-500 ${isTheaterMode ? "lg:col-span-2" : ""}`}>
            <motion.div
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="relative group pr-0"
            >
              {/* Ambient Glow */}
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-blue-500/20 rounded-2xl blur-3xl opacity-0 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 pointer-events-none hidden lg:block" />

              <div className="relative rounded-2xl lg:rounded-3xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl flex flex-col-reverse lg:flex-col">
                <div className="flex items-center justify-between px-4 lg:px-6 py-3 lg:py-4 border-t lg:border-t-0 lg:border-b border-slate-800/50 bg-slate-900/40 backdrop-blur-md">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setIsTheaterMode(!isTheaterMode)}
                      className={`hidden lg:flex h-8 w-8 rounded-lg border items-center justify-center transition-all ${isTheaterMode ? "bg-cyan-500 border-cyan-400 text-slate-950" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}
                      title={isTheaterMode ? "Exit Theater Mode" : "Theater Mode"}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M15 3v18" />
                      </svg>
                    </button>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-cyan-500/80">
                        {roomTitle}
                      </div>
                      <div className="text-sm font-bold text-slate-100 mt-0.5 tracking-tight">
                        {title}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex bg-slate-800/50 rounded-full p-1 border border-slate-700/50">
                      {isHost && (
                        <>
                          <button
                            type="button"
                            onClick={handleTogglePause}
                            className="h-8 px-4 rounded-full text-[10px] uppercase tracking-wider font-bold text-slate-200 hover:bg-slate-700 transition"
                          >
                            {roomPaused ? "Resume" : "Pause"}
                          </button>
                          <button
                            type="button"
                            onClick={handleShare}
                            className="h-8 px-4 rounded-full text-[10px] uppercase tracking-wider font-bold text-slate-200 hover:bg-slate-700 transition"
                          >
                            {shareMessage ? shareMessage : "Share"}
                          </button>
                        </>
                      )}
                    </div>

                    {isHost && (
                      <button
                        type="button"
                        onClick={handleCloseRoom}
                        className="h-9 px-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-[10px] uppercase tracking-wider font-bold text-rose-400 hover:bg-rose-500 hover:text-white transition-all"
                      >
                        End Session
                      </button>
                    )}

                    <div className="h-4 w-px bg-slate-800 mx-1" />

                    <button
                      type="button"
                      onClick={() => {
                        if (!voiceChatAllowed) return;
                        setVoiceChatEnabled((prev) => !prev);
                      }}
                      disabled={!voiceChatAllowed}
                      className={`h-9 w-9 rounded-xl border text-xs transition-all flex items-center justify-center ${voiceChatEnabled
                        ? "border-cyan-400 bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                        : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500"
                        } ${voiceChatAllowed ? "" : "opacity-30 cursor-not-allowed"}`}
                      aria-pressed={voiceChatEnabled}
                    >
                      <MicIcon muted={!voiceChatEnabled} />
                    </button>
                  </div>
                </div>

                <div className="relative aspect-video bg-black group-hover:shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-shadow duration-700">
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
                        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-6">
                          <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-500 mb-4 animate-pulse">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <rect x="6" y="4" width="4" height="16" />
                              <rect x="14" y="4" width="4" height="16" />
                            </svg>
                          </div>
                          <div className="text-lg font-bold text-white tracking-tight">Stream Paused</div>
                          <div className="text-sm text-slate-400 mt-1">Waiting for host to resume...</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin" />
                        <div className="text-sm text-slate-500 font-medium animate-pulse">Initializing screen...</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {error && (
              <div className="text-sm text-slate-300">{error}</div>
            )}
            {hostError && (
              <div className="text-sm text-rose-300 mt-2">{hostError}</div>
            )}
            {loading && !error && (
              <div className="text-sm text-slate-400">Loading details...</div>
            )}
            {/* Mobile Tab Switcher */}
            <div className="flex lg:hidden bg-slate-900 border border-slate-800 rounded-2xl p-1 gap-1">
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'chat' ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Chat
              </button>
              <button
                onClick={() => setActiveTab("details")}
                className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'details' ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Details
              </button>
            </div>

            <div className={`rounded-3xl border border-slate-800/50 bg-slate-900/40 backdrop-blur-xl p-6 lg:p-8 transition-all duration-500 overflow-hidden relative group/meta ${isTheaterMode ? "opacity-20 lg:hover:opacity-100 lg:scale-95 origin-top" : "opacity-100 scale-100"} ${activeTab !== 'details' ? 'hidden lg:block' : 'block'}`}>
              {/* Decorative background element */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-[100px] rounded-full pointer-events-none" />

              {!loading && !error && (
                <div className="flex flex-wrap gap-8 items-start relative z-10">
                  <div className="w-[140px] shrink-0 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-slate-700/50 group/poster">
                    {poster ? (
                      <img
                        src={poster}
                        alt={title}
                        className="w-full h-auto transition-transform duration-700 group-hover/poster:scale-110"
                      />
                    ) : (
                      <div className="aspect-[2/3] bg-slate-800 flex items-center justify-center text-[10px] text-slate-500">
                        No poster
                      </div>
                    )}
                  </div>
                  <div className="space-y-4 flex-1 min-w-[200px]">
                    <div>
                      <h1 className="text-2xl lg:text-4xl font-black text-white tracking-tighter leading-tight mb-2">
                        {title}
                      </h1>
                      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase tracking-widest">
                          {mediaType}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          {year || "----"}
                        </span>
                        <span className="hidden sm:block h-1 w-1 rounded-full bg-slate-800" />
                        <span className="text-xs font-bold text-slate-500">
                          {details?.runtime ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m` : "Duration N/A"}
                        </span>
                      </div>
                    </div>

                    <div className="text-base italic text-slate-300 font-medium leading-relaxed max-w-2xl border-l-2 border-cyan-500/30 pl-4">
                      "{details?.tagline || "Watching together with friends."}"
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      {details?.genres?.map(g => (
                        <span key={g.id} className="px-3.5 py-1.5 rounded-xl text-[10px] font-bold bg-slate-800/80 text-slate-300 border border-slate-700/50 uppercase tracking-tighter">
                          {g.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!loading && !error && (
                <div className="mt-8 pt-6 lg:pt-8 border-t border-slate-800/50 relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="h-0.5 w-4 lg:w-6 bg-cyan-500 rounded-full" />
                    <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-slate-500">The Story</h3>
                  </div>
                  <p className="text-sm lg:text-base text-slate-300 leading-relaxed max-w-4xl font-medium antialiased">
                    {details?.overview || "No overview available for this title."}
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside className={`transition-all duration-500 ${isTheaterMode ? "opacity-0 scale-95 pointer-events-none translate-x-12 absolute" : "opacity-100 scale-100 relative translate-x-0"} ${activeTab !== 'chat' ? 'hidden lg:flex flex-col' : 'flex flex-col'}`}>
            <div className="rounded-3xl border border-slate-800 bg-slate-900/40 backdrop-blur-xl flex flex-col h-[450px] sm:h-[500px] lg:h-[600px] overflow-hidden shadow-2xl">
              <div className="px-6 py-4 border-b border-slate-800/50 bg-slate-900/60 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">
                    Live Chat
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
                    <span className="text-[11px] font-medium text-slate-300">
                      Connected
                    </span>
                  </div>
                </div>
                <div className="px-2 py-1 rounded bg-slate-800/50 border border-slate-700/50 text-[10px] font-bold text-slate-400">
                  {voicePeers} {voicePeers === 1 ? 'Peer' : 'Peers'}
                </div>
              </div>
              <div
                ref={chatScrollRef}
                className="flex-1 px-4 py-4 space-y-4 overflow-y-auto scrollbar-slate"
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

      <AnimatePresence>
        {isRoomClosed && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl"
            >
              <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 mb-6">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-slate-100 mb-2">Room closed</h2>
              <p className="text-slate-400 text-sm mb-8">
                The host has closed this room. You can find more titles to watch in the browse section.
              </p>
              <button
                onClick={() => {
                  window.location.hash = "#browse";
                  window.location.reload();
                }}
                className="w-full py-4 rounded-2xl bg-cyan-500 text-slate-950 font-semibold hover:bg-cyan-400 transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
              >
                Go to Browse
              </button>
            </motion.div>
          </div>
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
      <div ref={remoteAudioContainerRef} className="sr-only" />
    </div>
  );
}

function ChatBubble({ name, message, tone = "default" }) {
  const isSystem = name === "System";

  return (
    <div className="flex flex-col gap-1 items-start">
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">
        {name}
      </span>
      <div
        className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed relative ${isSystem
          ? tone === "system-join"
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium"
            : tone === "system-leave"
              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium"
              : "bg-slate-800/20 text-slate-500 font-medium border-none"
          : tone === "accent"
            ? "border border-cyan-500/30 bg-gradient-to-br from-cyan-500/20 to-blue-600/10 text-cyan-50"
            : "border border-slate-700/50 bg-slate-800/40 text-slate-200"
          }`}
      >
        {message}
      </div>
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
    const passwordStrong =
      password.length >= 8 && passwordHasLetter && passwordHasNumber;

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
      setFormError(
        "Password must be at least 8 characters and include a letter and a number."
      );
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
        : {
          email: trimmedEmail,
          username: trimmedUsername,
          password,
          confirmPassword,
        };
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormError(
          data?.message || "Unable to authenticate. Please try again."
        );
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
              <label className="text-xs text-slate-400" htmlFor="auth-confirm">
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

export default RoomWatchPage;
