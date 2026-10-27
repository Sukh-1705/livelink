import React, { useEffect, useRef, useState } from 'react';
import { useLiveLink } from '../context/LiveLinkContext';
import { VolumeX, Volume2, Maximize2 } from 'lucide-react';

interface CleanViewProps {
  streamId?: string;
  roomId?: string;
}

export const CleanView: React.FC<CleanViewProps> = ({ streamId: propStreamId, roomId: propRoomId }) => {
  const { cameraStreams, joinRoom } = useLiveLink();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [streamId, setStreamId] = useState(propStreamId || '');
  const [roomId, setRoomId] = useState(propRoomId || 'studio');
  const [isMuted, setIsMuted] = useState(false);
  const [needsUnmuteInteraction, setNeedsUnmuteInteraction] = useState(false);

  // Extract streamId and roomId from URL path and queries
  useEffect(() => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const searchParams = new URLSearchParams(window.location.search);

    const forceMuted = searchParams.get('muted') === '1' || searchParams.get('mute') === 'true';
    setIsMuted(forceMuted);

    let parsedRoom = 'studio';
    let parsedStream = '';

    if (parts.length >= 3 && parts[0] === 'view') {
      // /view/:roomId/:streamId
      parsedRoom = parts[1];
      parsedStream = parts[2];
    } else if (parts.length === 2 && parts[0] === 'view') {
      // /view/:streamId (defaults to studio)
      parsedRoom = searchParams.get('room') || 'studio';
      parsedStream = parts[1];
    }

    if (parsedStream) {
      setStreamId(parsedStream);
      setRoomId(parsedRoom);
      joinRoom(parsedRoom, 'viewer', 'OBS Clean Feed', parsedStream);
    }
  }, [joinRoom]);

  // Find camera stream by ID or peerId, with fallback to first active stream if single stream
  const stream = cameraStreams.find(s => s.id === streamId || s.peerId === streamId) || (cameraStreams.length > 0 ? cameraStreams[0] : undefined);

  useEffect(() => {
    if (videoRef.current && stream?.mediaStream) {
      const video = videoRef.current;
      if (video.srcObject !== stream.mediaStream) {
        video.srcObject = stream.mediaStream;
      }
      video.muted = isMuted;

      const tryPlay = () => {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('[CleanView] Autoplay restricted, muting and playing video:', err);
            video.muted = true;
            setIsMuted(true);
            setNeedsUnmuteInteraction(true);
            video.play().catch(() => {});
          });
        }
      };

      tryPlay();

      const tracks = stream.mediaStream.getTracks();
      tracks.forEach(track => {
        track.onunmute = () => {
          console.log(`[CleanView] Track ${track.kind} unmuted, playing video`);
          tryPlay();
        };
      });
    }
  }, [stream?.mediaStream, isMuted]);

  const handleUnmute = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      setIsMuted(false);
      setNeedsUnmuteInteraction(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const searchParams = new URLSearchParams(window.location.search);
  const objectFit = searchParams.get('fit') === 'contain' ? 'object-contain' : 'object-cover';

  return (
    <div
      onDoubleClick={toggleFullscreen}
      className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex items-center justify-center m-0 p-0 select-none"
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isMuted}
          className={`w-full h-full ${objectFit}`}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-zinc-600 font-mono text-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span>Awaiting stream: {streamId || 'any'} in room "{roomId}"</span>
        </div>
      )}

      {/* Discreet Unmute Notification if browser required click */}
      {needsUnmuteInteraction && (
        <button
          onClick={handleUnmute}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/80 hover:bg-black/95 text-white text-xs font-semibold backdrop-blur-md border border-white/20 flex items-center gap-2 shadow-2xl transition-all"
        >
          <VolumeX className="w-4 h-4 text-amber-400" />
          <span>Click to Unmute Audio</span>
        </button>
      )}
    </div>
  );
};
