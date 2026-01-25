import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

export const VideoPlayer = forwardRef(({
    src,
    poster,
    shouldPlay = null,
    seekToTime = null,
    onPlay = null,
    onPause = null,
    onSeeking = null,
    onTimeUpdate = null,
    onLoadedMetadata = null,
    loadingMessages = null,
    loadingMessageInterval = 2200
}, ref) => {
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const isRemoteActionRef = useRef(false);
    const lastSeekTimeRef = useRef(null);
    const seekTimeoutRef = useRef(null);
    const containerRef = useRef(null);
    const shouldPlayRef = useRef(shouldPlay);
    const autoplayRetryRef = useRef(false);

    // Custom controls state
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [buffered, setBuffered] = useState(0);
    const controlsTimeoutRef = useRef(null);
    const [showRewind, setShowRewind] = useState(false);
    const [showForward, setShowForward] = useState(false);
    const lastClickTimeRef = useRef(0);
    const clickTimeoutRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingIndex, setLoadingIndex] = useState(0);
    const loadingTimerRef = useRef(null);
    const defaultLoadingMessages = useRef([
        'Just a sec, getting things ready…',
        'Grab some popcorn 🍿',
        'Warming up the screen…',
        'Almost there…',
        'Movie magic loading…',
        'Setting things up for you…',
        'Getting comfy…',
        'Lights dimming…',
        'Hang tight, starting soon!',
        'Good things take a moment 🙂'
    ]);

    // Expose video control methods to parent
    useImperativeHandle(ref, () => ({
        play: () => {
            if (videoRef.current) {
                videoRef.current.play().catch(err => console.warn('Play failed:', err));
            }
        },
        pause: () => {
            if (videoRef.current) {
                videoRef.current.pause();
            }
        },
        seek: (time) => {
            if (videoRef.current && !isNaN(time)) {
                videoRef.current.currentTime = time;
            }
        },
        getCurrentTime: () => {
            return videoRef.current?.currentTime || 0;
        },
        isPaused: () => {
            return videoRef.current?.paused ?? true;
        }
    }));

    // Handle HLS setup
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        if (Hls.isSupported() && src) {
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
            });
            hlsRef.current = hls;

            hls.loadSource(src);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('HLS manifest parsed');
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                console.warn('HLS error:', data);
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            hls.destroy();
                            break;
                    }
                }
            });

        } else if (video.canPlayType('application/vnd.apple.mpegurl') && src) {
            video.src = src;
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
            }
        };
    }, [src]);

    useEffect(() => {
        setIsLoading(Boolean(src));
        setLoadingIndex(0);
    }, [src]);

    useEffect(() => {
        if (!isLoading) {
            if (loadingTimerRef.current) {
                clearInterval(loadingTimerRef.current);
                loadingTimerRef.current = null;
            }
            return;
        }
        const messages = Array.isArray(loadingMessages) && loadingMessages.length
            ? loadingMessages
            : defaultLoadingMessages.current;
        if (messages.length <= 1) return;
        loadingTimerRef.current = setInterval(() => {
            setLoadingIndex((prev) => (prev + 1) % messages.length);
        }, Math.max(800, loadingMessageInterval));
        return () => {
            if (loadingTimerRef.current) {
                clearInterval(loadingTimerRef.current);
                loadingTimerRef.current = null;
            }
        };
    }, [isLoading, loadingMessages, loadingMessageInterval]);

    // Handle external play/pause control
    useEffect(() => {
        const video = videoRef.current;
        if (!video || shouldPlay === null) return;

        isRemoteActionRef.current = true;
        shouldPlayRef.current = shouldPlay;

        const attemptPlay = async (reason) => {
            try {
                await video.play();
            } catch (err) {
                if (!video.muted && !autoplayRetryRef.current) {
                    autoplayRetryRef.current = true;
                    video.muted = true;
                    setIsMuted(true);
                    try {
                        await video.play();
                        return;
                    } catch (retryErr) {
                        console.warn(`Autoplay retry failed (${reason}):`, retryErr);
                    }
                } else {
                    console.warn(`Remote play failed (${reason}):`, err);
                }
            }
        };

        if (shouldPlay && video.paused) {
            attemptPlay('shouldPlay');
        } else if (!shouldPlay && !video.paused) {
            video.pause();
        }

        const timeout = setTimeout(() => {
            isRemoteActionRef.current = false;
        }, 500);

        return () => clearTimeout(timeout);
    }, [shouldPlay]);

    useEffect(() => {
        shouldPlayRef.current = shouldPlay;
    }, [shouldPlay]);

    // Handle external seek control
    useEffect(() => {
        const video = videoRef.current;
        if (!video || seekToTime === null || isNaN(seekToTime)) return;

        const currentTime = video.currentTime;
        const timeDiff = Math.abs(currentTime - seekToTime);

        if (timeDiff > 1) {
            isRemoteActionRef.current = true;
            lastSeekTimeRef.current = seekToTime;
            video.currentTime = seekToTime;

            const timeout = setTimeout(() => {
                isRemoteActionRef.current = false;
            }, 500);

            return () => clearTimeout(timeout);
        }
    }, [seekToTime]);

    // Set up video event listeners
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlePlay = () => {
            setIsPlaying(true);
            setIsLoading(false);
            if (!isRemoteActionRef.current && onPlay) {
                onPlay();
            }
        };

        const handlePause = () => {
            setIsPlaying(false);
            if (!isRemoteActionRef.current && onPause) {
                onPause();
            }
        };

        const handleSeeking = () => {
            if (!isRemoteActionRef.current && onSeeking) {
                if (seekTimeoutRef.current) {
                    clearTimeout(seekTimeoutRef.current);
                }

                seekTimeoutRef.current = setTimeout(() => {
                    const currentTime = video.currentTime;
                    if (lastSeekTimeRef.current === null ||
                        Math.abs(currentTime - lastSeekTimeRef.current) > 1) {
                        lastSeekTimeRef.current = currentTime;
                        onSeeking(currentTime);
                    }
                }, 300);
            }
        };

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime);
            if (onTimeUpdate) {
                onTimeUpdate(video.currentTime);
            }
        };

        const handleLoadedMetadata = () => {
            setDuration(video.duration);
            setIsLoading(false);
            if (onLoadedMetadata) {
                onLoadedMetadata(video.duration);
            }
            if (shouldPlayRef.current && video.paused) {
                video.play().catch(async (err) => {
                    if (!video.muted && !autoplayRetryRef.current) {
                        autoplayRetryRef.current = true;
                        video.muted = true;
                        setIsMuted(true);
                        try {
                            await video.play();
                            return;
                        } catch (retryErr) {
                            console.warn('Autoplay retry after metadata failed:', retryErr);
                        }
                    }
                    console.warn('Autoplay after metadata failed:', err);
                });
            }
        };

        const handleCanPlay = () => {
            setIsLoading(false);
            if (shouldPlayRef.current && video.paused) {
                video.play().catch(async (err) => {
                    if (!video.muted && !autoplayRetryRef.current) {
                        autoplayRetryRef.current = true;
                        video.muted = true;
                        setIsMuted(true);
                        try {
                            await video.play();
                            return;
                        } catch (retryErr) {
                            console.warn('Autoplay retry on canplay failed:', retryErr);
                        }
                    }
                    console.warn('Autoplay on canplay failed:', err);
                });
            }
        };

        const handleProgress = () => {
            if (video.buffered.length > 0) {
                const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                const duration = video.duration;
                if (duration > 0) {
                    setBuffered((bufferedEnd / duration) * 100);
                }
            }
        };
        const handleWaiting = () => setIsLoading(true);
        const handleStalled = () => setIsLoading(true);
        const handlePlaying = () => setIsLoading(false);

        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('seeking', handleSeeking);
        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('progress', handleProgress);
        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('stalled', handleStalled);
        video.addEventListener('playing', handlePlaying);

        return () => {
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('seeking', handleSeeking);
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('canplay', handleCanPlay);
            video.removeEventListener('progress', handleProgress);
            video.removeEventListener('waiting', handleWaiting);
            video.removeEventListener('stalled', handleStalled);
            video.removeEventListener('playing', handlePlaying);
            if (seekTimeoutRef.current) {
                clearTimeout(seekTimeoutRef.current);
            }
        };
    }, [onPlay, onPause, onSeeking, onTimeUpdate, onLoadedMetadata]);

    // Custom control handlers
    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    }, []);

    const handleSeek = useCallback((e) => {
        const video = videoRef.current;
        if (!video) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        video.currentTime = pos * video.duration;
    }, []);

    const handleVolumeChange = useCallback((e) => {
        const video = videoRef.current;
        if (!video) return;

        const newVolume = parseFloat(e.target.value);
        video.volume = newVolume;
        setVolume(newVolume);
        setIsMuted(newVolume === 0);
    }, []);

    const toggleMute = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        video.muted = !video.muted;
        setIsMuted(!isMuted);
    }, [isMuted]);

    const toggleFullscreen = useCallback(() => {
        if (!containerRef.current) return;

        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen?.();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen?.();
            setIsFullscreen(false);
        }
    }, []);

    const formatTime = (seconds) => {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleMouseMove = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }
        controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) {
                setShowControls(false);
            }
        }, 3000);
    };

    const handleRewind = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.max(0, video.currentTime - 10);
        setShowRewind(true);
        setTimeout(() => setShowRewind(false), 800);
    }, []);

    const handleForward = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.min(video.duration, video.currentTime + 10);
        setShowForward(true);
        setTimeout(() => setShowForward(false), 800);
    }, []);

    const handleVideoClick = (e) => {
        const now = Date.now();
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const isLeftSide = clickX < rect.width / 2;

        if (now - lastClickTimeRef.current < 300) {
            // Double click detected
            if (clickTimeoutRef.current) {
                clearTimeout(clickTimeoutRef.current);
                clickTimeoutRef.current = null;
            }
            if (isLeftSide) {
                handleRewind();
            } else {
                handleForward();
            }
            lastClickTimeRef.current = 0;
        } else {
            // Single click - just update the timestamp for double-click detection
            lastClickTimeRef.current = now;
        }
    };

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    handleRewind();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    handleForward();
                    break;
                case ' ':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleRewind, handleForward, togglePlay, toggleFullscreen]);

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full bg-black rounded-xl overflow-hidden group"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => isPlaying && setShowControls(false)}
        >
            <video
                ref={videoRef}
                className="w-full h-full bg-black object-contain min-h-full"
                playsInline
                onClick={handleVideoClick}
            />

            {isLoading && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-6 max-w-md text-center p-6">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                            </div>
                        </div>



                        <div className="min-h-[3rem] flex items-center justify-center">
                            <p className="text-lg md:text-xl text-slate-300 font-sans font-medium leading-relaxed">
                                <span className="mr-2 text-cyan-500">{'>'}</span>
                                <span className="animate-[typing_2s_steps(20,_end)]">
                                    {(Array.isArray(loadingMessages) && loadingMessages.length
                                        ? loadingMessages
                                        : defaultLoadingMessages.current)[loadingIndex]}
                                </span>
                                <span className="ml-1 inline-block w-2.5 h-5 bg-cyan-500 animate-pulse align-middle" />
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Controls */}
            <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                <div className="px-4 pb-3 pt-8">
                    {/* Progress Bar */}
                    <div className="mb-3 group/progress">
                        <div
                            className="relative h-1 bg-slate-700/50 rounded-full cursor-pointer hover:h-1.5 transition-all"
                            onClick={handleSeek}
                        >
                            {/* Buffered */}
                            <div
                                className="absolute h-full bg-slate-600/50 rounded-full"
                                style={{ width: `${buffered}%` }}
                            />
                            {/* Progress */}
                            <div
                                className="absolute h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full"
                                style={{ width: `${(currentTime / duration) * 100}%` }}
                            />
                            {/* Thumb */}
                            <div
                                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-cyan-400 rounded-full shadow-lg shadow-cyan-500/50 opacity-0 group-hover/progress:opacity-100 transition-opacity"
                                style={{ left: `${(currentTime / duration) * 100}%`, transform: 'translate(-50%, -50%)' }}
                            />
                        </div>
                    </div>

                    {/* Controls Row */}
                    <div className="flex items-center gap-3">
                        {/* Play/Pause */}
                        <button
                            onClick={togglePlay}
                            className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800/50 hover:bg-cyan-500 text-white transition-all hover:scale-105"
                        >
                            {isPlaying ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="6" y="4" width="4" height="16" rx="1" />
                                    <rect x="14" y="4" width="4" height="16" rx="1" />
                                </svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            )}
                        </button>

                        {/* Time */}
                        <div className="text-xs font-medium text-slate-300 tabular-nums">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </div>

                        <div className="flex-1" />

                        {/* Volume */}
                        <div className="flex items-center gap-2 group/volume">
                            <button
                                onClick={toggleMute}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800/50 text-slate-300 hover:text-white transition-all"
                            >
                                {isMuted || volume === 0 ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M11 5L6 9H2v6h4l5 4V5z" />
                                        <line x1="23" y1="9" x2="17" y2="15" />
                                        <line x1="17" y1="9" x2="23" y2="15" />
                                    </svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M11 5L6 9H2v6h4l5 4V5z" />
                                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                                    </svg>
                                )}
                            </button>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={isMuted ? 0 : volume}
                                onChange={handleVolumeChange}
                                className="w-0 group-hover/volume:w-20 transition-all opacity-0 group-hover/volume:opacity-100 h-1 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:cursor-pointer"
                            />
                        </div>

                        {/* Fullscreen */}
                        <button
                            onClick={toggleFullscreen}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800/50 text-slate-300 hover:text-white transition-all"
                        >
                            {isFullscreen ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                                </svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Rewind Animation */}
            {showRewind && (
                <div className="absolute left-1/4 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50">
                    <div className="flex flex-col items-center gap-3 animate-[fadeInOut_0.8s_ease-in-out]">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="11 17 6 12 11 7"></polyline>
                            <polyline points="18 17 13 12 18 7"></polyline>
                        </svg>
                        <div className="text-white text-lg font-bold bg-black/80 px-4 py-2 rounded-full shadow-2xl">10 sec</div>
                    </div>
                </div>
            )}

            {/* Forward Animation */}
            {showForward && (
                <div className="absolute right-1/4 top-1/2 translate-x-1/2 -translate-y-1/2 pointer-events-none z-50">
                    <div className="flex flex-col items-center gap-3 animate-[fadeInOut_0.8s_ease-in-out]">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="13 17 18 12 13 7"></polyline>
                            <polyline points="6 17 11 12 6 7"></polyline>
                        </svg>
                        <div className="text-white text-lg font-bold bg-black/80 px-4 py-2 rounded-full shadow-2xl">10 sec</div>
                    </div>
                </div>
            )}

            {/* Center Play Button (when paused) */}
            {!isPlaying && (
                <button
                    onClick={togglePlay}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 flex items-center justify-center rounded-full bg-cyan-500/90 hover:bg-cyan-500 text-white shadow-2xl shadow-cyan-500/50 transition-all hover:scale-110"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="ml-1">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </button>
            )}
        </div>
    );
});

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;
