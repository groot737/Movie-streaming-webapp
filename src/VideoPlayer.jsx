import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import Hls from 'hls.js';

export const VideoPlayer = forwardRef(({
    src,
    poster,
    shouldPlay = null,
    seekToTime = null,
    onPlay = null,
    onPause = null,
    onSeeking = null,
    onTimeUpdate = null
}, ref) => {
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const isRemoteActionRef = useRef(false);
    const lastSeekTimeRef = useRef(null);
    const seekTimeoutRef = useRef(null);

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

    // Handle external play/pause control
    useEffect(() => {
        const video = videoRef.current;
        if (!video || shouldPlay === null) return;

        isRemoteActionRef.current = true;

        if (shouldPlay && video.paused) {
            video.play().catch(err => console.warn('Remote play failed:', err));
        } else if (!shouldPlay && !video.paused) {
            video.pause();
        }

        // Clear remote action flag after a short delay
        const timeout = setTimeout(() => {
            isRemoteActionRef.current = false;
        }, 500);

        return () => clearTimeout(timeout);
    }, [shouldPlay]);

    // Handle external seek control
    useEffect(() => {
        const video = videoRef.current;
        if (!video || seekToTime === null || isNaN(seekToTime)) return;

        // Only seek if the difference is significant (> 1 second)
        const currentTime = video.currentTime;
        const timeDiff = Math.abs(currentTime - seekToTime);

        if (timeDiff > 1) {
            isRemoteActionRef.current = true;
            lastSeekTimeRef.current = seekToTime;
            video.currentTime = seekToTime;

            // Clear remote action flag after a short delay
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
            if (!isRemoteActionRef.current && onPlay) {
                onPlay();
            }
        };

        const handlePause = () => {
            if (!isRemoteActionRef.current && onPause) {
                onPause();
            }
        };

        const handleSeeking = () => {
            if (!isRemoteActionRef.current && onSeeking) {
                // Debounce seeking events
                if (seekTimeoutRef.current) {
                    clearTimeout(seekTimeoutRef.current);
                }

                seekTimeoutRef.current = setTimeout(() => {
                    const currentTime = video.currentTime;
                    // Only notify if seek is significant
                    if (lastSeekTimeRef.current === null ||
                        Math.abs(currentTime - lastSeekTimeRef.current) > 1) {
                        lastSeekTimeRef.current = currentTime;
                        onSeeking(currentTime);
                    }
                }, 300); // Debounce for 300ms
            }
        };

        const handleTimeUpdate = () => {
            if (onTimeUpdate) {
                onTimeUpdate(video.currentTime);
            }
        };

        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('seeking', handleSeeking);
        video.addEventListener('timeupdate', handleTimeUpdate);

        return () => {
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('seeking', handleSeeking);
            video.removeEventListener('timeupdate', handleTimeUpdate);
            if (seekTimeoutRef.current) {
                clearTimeout(seekTimeoutRef.current);
            }
        };
    }, [onPlay, onPause, onSeeking, onTimeUpdate]);

    return (
        <div className="relative w-full h-full rounded-2xl overflow-hidden border border-slate-800/50 shadow-lg bg-black">
            <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full bg-black"
                poster={poster}
                controls
                playsInline
                style={{ objectFit: 'contain' }}
            />
        </div>
    );
});

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;
