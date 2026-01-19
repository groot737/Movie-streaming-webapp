import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';

export const VideoPlayer = ({ src, poster }) => {
    const videoRef = useRef(null);
    const hlsRef = useRef(null);

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
};

export default VideoPlayer;
