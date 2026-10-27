import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { CameraStream, TallyState, CueMessage, RemoteControlPayload, ServerInfo } from '../types';
import { AudioMixerNode } from '../utils/audio';
import { mungeSdp, tuneReceiverJitterBuffer, collectStreamStats, applySenderEncodingParameters } from '../utils/webrtc';
import { createSyntheticStream } from '../utils/syntheticStream';

interface LiveLinkContextType {
  isConnected: boolean;
  isReconnecting: boolean;
  roomId: string;
  peerId: string;
  role: 'sender' | 'receiver' | 'viewer';
  mode: 'sfu' | 'p2p';
  serverInfo: ServerInfo | null;
  cameraStreams: CameraStream[];
  programStreamId: string | null;
  previewStreamId: string | null;
  cues: CueMessage[];
  joinRoom: (roomId: string, role: 'sender' | 'receiver' | 'viewer', label?: string, streamId?: string, mode?: 'sfu' | 'p2p') => void;
  leaveRoom: () => void;
  sendRemoteControl: (targetPeerId: string, command: string, payload: any) => void;
  updateTally: (streamId: string, tallyState: TallyState) => void;
  sendCue: (targetPeerId: string, message: string, duration?: number) => void;
  setProgramStream: (streamId: string) => void;
  setPreviewStream: (streamId: string) => void;
  cutProgramPreview: () => void;
  setStreamVolume: (streamId: string, volume: number) => void;
  toggleStreamMute: (streamId: string) => void;
  toggleStreamSolo: (streamId: string) => void;
  setStreamAudioDelay: (streamId: string, delayMs: number) => void;
  onRemoteControlReceived?: (callback: (payload: RemoteControlPayload) => void) => void;
  onCueReceived?: (callback: (cue: CueMessage) => void) => void;
  wsSend: (data: any) => void;
  registerLocalSenderStream: (stream: MediaStream, settings?: any) => void;
  unregisterLocalSenderStream: () => void;
  getPrimarySenderPeerConnection: () => RTCPeerConnection | null;
  addSyntheticStream: (label: string, width?: number, height?: number, fps?: number) => void;
}

const LiveLinkContext = createContext<LiveLinkContextType | null>(null);

export const LiveLinkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [roomId, setRoomId] = useState('studio');
  const [peerId] = useState(() => 'peer_' + Math.random().toString(36).substring(2, 9));
  const [role, setRole] = useState<'sender' | 'receiver' | 'viewer'>('receiver');
  const [mode, setMode] = useState<'sfu' | 'p2p'>('sfu');
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [cameraStreams, setCameraStreams] = useState<CameraStream[]>([]);
  const [programStreamId, setProgramStreamId] = useState<string | null>(null);
  const [previewStreamId, setPreviewStreamId] = useState<string | null>(null);
  const [cues, setCues] = useState<CueMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const p2pConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localSenderStreamRef = useRef<MediaStream | null>(null);
  const senderSettingsRef = useRef<any>(null);
  const isBroadcastingRef = useRef<boolean>(false);
  const p2pSenderConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const mediasoupDeviceRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const sendTransportRef = useRef<any>(null);
  const audioMixersRef = useRef<Map<string, AudioMixerNode>>(new Map());
  const statsIntervalRef = useRef<any>(null);
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Synchronized refs to eliminate React stale closure bugs on WebSocket events
  const roleRef = useRef<'sender' | 'receiver' | 'viewer'>('receiver');
  const roomIdRef = useRef<string>('studio');
  const peerIdRef = useRef<string>(peerId);
  const modeRef = useRef<'sfu' | 'p2p'>('sfu');
  const handleSignalingMessageRef = useRef<((msg: any) => Promise<void>) | null>(null);

  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { peerIdRef.current = peerId; }, [peerId]);

  const remoteControlCallbacks = useRef<((payload: RemoteControlPayload) => void)[]>([]);
  const cueCallbacks = useRef<((cue: CueMessage) => void)[]>([]);

  // Fetch Server & LAN info
  useEffect(() => {
    fetch('/api/info')
      .then(res => res.json())
      .then(data => setServerInfo(data))
      .catch(() => {});
  }, []);

  const wsSend = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payload = {
        roomId: roomIdRef.current,
        peerId: peerIdRef.current,
        ...data
      };
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  // Connect sender directly to a specific receiver or viewer
  const connectSenderToReceiver = useCallback(async (receiverPeerId: string) => {
    if (!receiverPeerId || receiverPeerId === peerIdRef.current) return;
    if (!localSenderStreamRef.current) {
      console.warn('[WebRTC Sender] Cannot connect: no local sender stream available.');
      return;
    }
    const stream = localSenderStreamRef.current;
    const settings = senderSettingsRef.current;

    console.log(`[WebRTC Sender] Connecting directly to receiver: ${receiverPeerId}`);

    const existing = p2pSenderConnectionsRef.current.get(receiverPeerId);
    if (existing) {
      if (existing.connectionState === 'connected' || existing.connectionState === 'connecting' || existing.signalingState === 'have-local-offer') {
        console.log(`[WebRTC Sender] Connection with ${receiverPeerId} already active or in progress. Skipping redundant trigger.`);
        return;
      }
      existing.close();
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ],
      bundlePolicy: 'max-bundle'
    });

    p2pSenderConnectionsRef.current.set(receiverPeerId, pc);

    stream.getTracks().forEach(track => {
      console.log(`[WebRTC Sender] Attaching track ${track.kind} (${track.id}) for receiver ${receiverPeerId}`);
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsSend({
          type: 'ice-candidate',
          roomId: roomIdRef.current,
          peerId: peerIdRef.current,
          senderPeerId: peerIdRef.current,
          targetPeerId: receiverPeerId,
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Sender] Connection state with ${receiverPeerId}: ${pc.connectionState}`);
    };

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      });
      const mungedSdp = mungeSdp(offer.sdp, settings?.bitrateKbps || 30000, settings?.stereo ?? true);
      await pc.setLocalDescription(new RTCSessionDescription({ type: 'offer', sdp: mungedSdp }));

      wsSend({
        type: 'offer',
        roomId: roomIdRef.current,
        peerId: peerIdRef.current,
        senderPeerId: peerIdRef.current,
        targetPeerId: receiverPeerId,
        label: settings?.sourceLabel || 'Camera',
        sdp: pc.localDescription
      });
      console.log(`[WebRTC Sender] Dispatched offer to receiver: ${receiverPeerId}`);
    } catch (err) {
      console.error(`[WebRTC Sender] Error creating offer for ${receiverPeerId}:`, err);
    }
  }, [wsSend]);

  // Signaling message processor
  const handleSignalingMessage = useCallback(async (msg: any) => {
    switch (msg.type) {
      case 'joined': {
        setIsConnected(true);
        setIsReconnecting(false);
        setMode(msg.mode || 'sfu');

        // Restore tally states
        if (msg.tally) {
          const tallyMap: Record<string, TallyState> = msg.tally;
          setCameraStreams(prev => prev.map(s => ({
            ...s,
            tally: tallyMap[s.id] || s.tally
          })));
        }

        // If receiver or viewer: connect to all existing senders
        if (role === 'receiver' || role === 'viewer') {
          if (msg.senders && msg.senders.length > 0) {
            for (const s of msg.senders) {
              wsSend({
                type: 'request-stream',
                roomId,
                targetPeerId: s.peerId
              });
            }
          }
          if (msg.mode === 'sfu') {
            wsSend({ type: 'get-rtp-capabilities', roomId, peerId });
          }
        }
        break;
      }

      case 'rtp-capabilities':
      case 'transport-created':
      case 'new-producer':
      case 'consumed':
        break;

      // --- Direct P2P & Stream Distribution ---
      case 'sender-joined': {
        const senderId = msg.sender?.peerId;
        console.log(`[Receiver WebRTC] Sender joined notification:`, msg.sender);
        if ((roleRef.current === 'receiver' || roleRef.current === 'viewer') && senderId && senderId !== peerIdRef.current) {
          wsSend({
            type: 'request-stream',
            roomId: roomIdRef.current,
            peerId: peerIdRef.current,
            targetPeerId: senderId
          });
        }
        break;
      }

      case 'receiver-joined': {
        const receiverId = msg.receiver?.peerId || msg.peerId;
        console.log(`[Sender WebRTC] Receiver joined notification:`, receiverId);
        if (localSenderStreamRef.current && receiverId && receiverId !== peerIdRef.current) {
          connectSenderToReceiver(receiverId);
        }
        break;
      }

      case 'request-stream': {
        const requesterId = msg.requesterPeerId || msg.peerId;
        console.log(`[Sender WebRTC] Received stream request from:`, requesterId);
        if (localSenderStreamRef.current && requesterId && requesterId !== peerIdRef.current) {
          connectSenderToReceiver(requesterId);
        }
        break;
      }

      case 'offer': {
        const fromPeerId = msg.senderPeerId || msg.peerId;
        if (!fromPeerId) {
          console.warn('[Receiver WebRTC] Received offer without senderPeerId!');
          break;
        }

        console.log(`[Receiver WebRTC] Handling offer from sender: ${fromPeerId}`);

        let pc = p2pConnectionsRef.current.get(fromPeerId);
        if (pc) {
          pc.close();
        }

        pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' }
          ],
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require'
        });

        p2pConnectionsRef.current.set(fromPeerId, pc);

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            wsSend({
              type: 'ice-candidate',
              roomId: roomIdRef.current,
              peerId: peerIdRef.current,
              senderPeerId: peerIdRef.current,
              targetPeerId: fromPeerId,
              candidate: event.candidate
            });
          }
        };

        pc.ontrack = (event) => {
          console.log(`[Receiver WebRTC] ONTRACK from ${fromPeerId}:`, event.track.kind, event.track.id);
          const incomingStream = event.streams[0] || new MediaStream([event.track]);
          tuneReceiverJitterBuffer(event.receiver, 'ultra-low');

          const streamId = fromPeerId;
          const label = msg.label || `Camera ${streamId.substring(0, 4)}`;

          setCameraStreams(prev => {
            const existing = prev.find(s => s.id === streamId || s.peerId === fromPeerId);
            if (existing) {
              if (!existing.mediaStream.getTracks().some(t => t.id === event.track.id)) {
                existing.mediaStream.addTrack(event.track);
              }
              return [...prev];
            } else {
              const mixer = new AudioMixerNode();
              mixer.attachStream(incomingStream);
              audioMixersRef.current.set(streamId, mixer);

              return [
                ...prev,
                {
                  id: streamId,
                  peerId: fromPeerId,
                  label,
                  mediaStream: incomingStream,
                  tally: 'standby',
                  audioVolume: 1.0,
                  isMuted: false,
                  isSolo: false,
                  audioDelayMs: 0
                }
              ];
            }
          });
        };

        pc.onconnectionstatechange = () => {
          console.log(`[Receiver WebRTC] Connection state with ${fromPeerId}: ${pc.connectionState}`);
        };

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

          // Drain queued ICE candidates
          const queued = iceCandidateQueueRef.current.get(fromPeerId) || [];
          iceCandidateQueueRef.current.delete(fromPeerId);
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }

          const answer = await pc.createAnswer();
          const mungedAnswer = mungeSdp(answer.sdp, 30000, true);
          await pc.setLocalDescription(new RTCSessionDescription({ type: 'answer', sdp: mungedAnswer }));
          wsSend({
            type: 'answer',
            roomId: roomIdRef.current,
            peerId: peerIdRef.current,
            senderPeerId: peerIdRef.current,
            targetPeerId: fromPeerId,
            sdp: { type: 'answer', sdp: mungedAnswer }
          });
          console.log(`[Receiver WebRTC] Sent answer back to sender ${fromPeerId}`);
        } catch (err) {
          console.error(`[Receiver WebRTC] Error establishing connection with ${fromPeerId}:`, err);
        }
        break;
      }

      case 'answer': {
        const fromPeerId = msg.senderPeerId || msg.peerId;
        console.log(`[Sender WebRTC] Received answer from:`, fromPeerId);
        let pc = fromPeerId ? p2pSenderConnectionsRef.current.get(fromPeerId) : null;
        if (!pc && p2pSenderConnectionsRef.current.size === 1) {
          pc = p2pSenderConnectionsRef.current.values().next().value;
        }
        if (pc) {
          if (pc.signalingState !== 'have-local-offer') {
            console.warn(`[Sender WebRTC] Ignoring duplicate/stale answer: signalingState is already "${pc.signalingState}"`);
            break;
          }
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            console.log(`[Sender WebRTC] Remote description (answer) successfully applied for ${fromPeerId}!`);

            // Drain queued ICE candidates
            const queued = iceCandidateQueueRef.current.get(fromPeerId) || [];
            iceCandidateQueueRef.current.delete(fromPeerId);
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }

            const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (videoSender && senderSettingsRef.current) {
              applySenderEncodingParameters(videoSender, senderSettingsRef.current);
            }
          } catch (err) {
            console.error(`[Sender WebRTC] Error setting remote description for ${fromPeerId}:`, err);
          }
        } else {
          console.warn(`[Sender WebRTC] No RTCPeerConnection found for answer from ${fromPeerId}`);
        }
        break;
      }

      case 'ice-candidate': {
        const fromPeerId = msg.senderPeerId || msg.peerId;
        let pc = fromPeerId ? (p2pSenderConnectionsRef.current.get(fromPeerId) || p2pConnectionsRef.current.get(fromPeerId)) : null;
        if (!pc && p2pSenderConnectionsRef.current.size === 1) {
          pc = p2pSenderConnectionsRef.current.values().next().value;
        }
        if (!pc && p2pConnectionsRef.current.size === 1) {
          pc = p2pConnectionsRef.current.values().next().value;
        }
        if (msg.candidate) {
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch (e) {
              console.warn('[WebRTC] addIceCandidate warning:', e);
            }
          } else {
            const queue = iceCandidateQueueRef.current.get(fromPeerId) || [];
            queue.push(msg.candidate);
            iceCandidateQueueRef.current.set(fromPeerId, queue);
          }
        }
        break;
      }

      case 'sender-left': {
        setCameraStreams(prev => prev.filter(s => s.id !== msg.streamId && s.peerId !== msg.peerId));
        const mixer = audioMixersRef.current.get(msg.streamId);
        if (mixer) {
          mixer.destroy();
          audioMixersRef.current.delete(msg.streamId);
        }
        break;
      }

      case 'tally-changed': {
        setCameraStreams(prev => prev.map(s => {
          if (s.id === msg.streamId) {
            return { ...s, tally: msg.tallyState };
          }
          return s;
        }));
        break;
      }

      case 'remote-control': {
        remoteControlCallbacks.current.forEach(cb => cb({ command: msg.command, value: msg.payload }));
        break;
      }

      case 'cue-message': {
        const newCue: CueMessage = {
          id: Math.random().toString(36).substring(2, 9),
          message: msg.message,
          from: msg.from || 'Director',
          timestamp: Date.now(),
          durationMs: msg.duration || 5000
        };
        setCues(prev => [newCue, ...prev.slice(0, 4)]);
        cueCallbacks.current.forEach(cb => cb(newCue));

        // Auto remove after duration
        setTimeout(() => {
          setCues(prev => prev.filter(c => c.id !== newCue.id));
        }, newCue.durationMs);
        break;
      }

      case 'mode-changed': {
        setMode(msg.mode);
        break;
      }
    }
  }, [roomId, peerId, role, mode, wsSend]);

  handleSignalingMessageRef.current = handleSignalingMessage;

  // Setup Direct P2P connection with ultra-low latency tuning
  const setupP2PConnection = (targetPeerId: string, streamId: string, label: string, isInitiator: boolean) => {
    let pc = p2pConnectionsRef.current.get(targetPeerId);
    if (!pc) {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });

      p2pConnectionsRef.current.set(targetPeerId, pc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          wsSend({
            type: 'ice-candidate',
            roomId,
            targetPeerId,
            candidate: event.candidate
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track]);
        
        // Tune jitter buffer for receiver
        tuneReceiverJitterBuffer(event.receiver, 'ultra-low');

        setCameraStreams(prev => {
          const existing = prev.find(s => s.id === streamId || s.peerId === targetPeerId);
          if (existing) {
            existing.mediaStream.addTrack(event.track);
            return [...prev];
          } else {
            const mixer = new AudioMixerNode();
            const mixedStream = mixer.attachStream(stream);
            audioMixersRef.current.set(streamId, mixer);

            return [
              ...prev,
              {
                id: streamId,
                peerId: targetPeerId,
                label,
                mediaStream: mixedStream,
                tally: 'standby',
                audioVolume: 1.0,
                isMuted: false,
                isSolo: false,
                audioDelayMs: 0
              }
            ];
          }
        });
      };
    }

    if (isInitiator) {
      pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true })
        .then(offer => {
          const mungedOffer = mungeSdp(offer.sdp, 40000, true);
          return pc!.setLocalDescription(new RTCSessionDescription({ type: 'offer', sdp: mungedOffer }));
        })
        .then(() => {
          wsSend({
            type: 'offer',
            roomId,
            targetPeerId,
            sdp: pc!.localDescription
          });
        })
        .catch(err => console.error('[P2P Offer Error]', err));
    }

    return pc;
  };

  const connectWebSocket = useCallback((currentRoom: string, currentRole: 'sender' | 'receiver' | 'viewer', label?: string, streamId?: string, preferredMode?: 'sfu' | 'p2p') => {
    roleRef.current = currentRole;
    roomIdRef.current = currentRoom;

    // If WebSocket is already open and connected, just send the updated join registration
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'join',
        roomId: currentRoom,
        peerId,
        role: currentRole,
        label: label || (currentRole === 'sender' ? 'Camera' : 'Director Multiview'),
        streamId: streamId || peerId,
        mode: preferredMode || modeRef.current
      }));
      return;
    }

    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setIsReconnecting(false);
      ws.send(JSON.stringify({
        type: 'join',
        roomId: currentRoom,
        peerId,
        role: currentRole,
        label: label || (currentRole === 'sender' ? 'Camera' : 'Director Multiview'),
        streamId: streamId || peerId,
        mode: preferredMode || modeRef.current
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (handleSignalingMessageRef.current) {
          handleSignalingMessageRef.current(data);
        }
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsReconnecting(true);
      // Auto reconnect after 2 seconds
      setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          connectWebSocket(currentRoom, currentRole, label, streamId, preferredMode);
        }
      }, 2000);
    };

    ws.onerror = (err) => {
      console.warn('[Signaling WS Error]:', err);
    };
  }, [peerId]);

  const joinRoom = useCallback((newRoomId: string, newRole: 'sender' | 'receiver' | 'viewer', label?: string, streamId?: string, preferredMode?: 'sfu' | 'p2p') => {
    setRoomId(newRoomId);
    setRole(newRole);
    if (preferredMode) setMode(preferredMode);
    connectWebSocket(newRoomId, newRole, label, streamId, preferredMode);
  }, [connectWebSocket]);

  const leaveRoom = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    p2pConnectionsRef.current.forEach(pc => pc.close());
    p2pConnectionsRef.current.clear();
    p2pSenderConnectionsRef.current.forEach(pc => pc.close());
    p2pSenderConnectionsRef.current.clear();
    setCameraStreams([]);
    setIsConnected(false);
  }, []);

  // Remote Control command dispatcher
  const sendRemoteControl = useCallback((targetPeerId: string, command: string, payload: any) => {
    wsSend({
      type: 'remote-control',
      roomId,
      targetPeerId,
      command,
      payload
    });
  }, [roomId, wsSend]);

  // Tally state dispatcher
  const updateTally = useCallback((streamId: string, tallyState: TallyState) => {
    wsSend({
      type: 'tally-update',
      roomId,
      streamId,
      tallyState
    });

    setCameraStreams(prev => prev.map(s => {
      if (s.id === streamId) return { ...s, tally: tallyState };
      return s;
    }));
  }, [roomId, wsSend]);

  // Director Cue dispatcher
  const sendCue = useCallback((targetPeerId: string, message: string, duration = 5000) => {
    wsSend({
      type: 'cue-message',
      roomId,
      targetPeerId,
      message,
      duration
    });
  }, [roomId, wsSend]);

  // Switching Bus (Program / Preview)
  const setProgramStream = useCallback((streamId: string) => {
    setProgramStreamId(streamId);
    updateTally(streamId, 'program');
    if (previewStreamId === streamId) {
      setPreviewStreamId(null);
    }
  }, [previewStreamId, updateTally]);

  const setPreviewStream = useCallback((streamId: string) => {
    setPreviewStreamId(streamId);
    updateTally(streamId, 'preview');
  }, [updateTally]);

  const cutProgramPreview = useCallback(() => {
    const currentProgram = programStreamId;
    const currentPreview = previewStreamId;

    if (currentPreview) {
      setProgramStreamId(currentPreview);
      updateTally(currentPreview, 'program');
    }
    if (currentProgram) {
      setPreviewStreamId(currentProgram);
      updateTally(currentProgram, 'preview');
    }
  }, [programStreamId, previewStreamId, updateTally]);

  // Audio Mixer operations
  const setStreamVolume = useCallback((streamId: string, volume: number) => {
    const mixer = audioMixersRef.current.get(streamId);
    if (mixer) mixer.setVolume(volume);
    setCameraStreams(prev => prev.map(s => s.id === streamId ? { ...s, audioVolume: volume } : s));
  }, []);

  const toggleStreamMute = useCallback((streamId: string) => {
    setCameraStreams(prev => prev.map(s => {
      if (s.id === streamId) {
        const nextMuted = !s.isMuted;
        const mixer = audioMixersRef.current.get(streamId);
        if (mixer) mixer.setVolume(nextMuted ? 0 : s.audioVolume);
        return { ...s, isMuted: nextMuted };
      }
      return s;
    }));
  }, []);

  const toggleStreamSolo = useCallback((streamId: string) => {
    setCameraStreams(prev => {
      const target = prev.find(s => s.id === streamId);
      const nextSolo = !target?.isSolo;

      return prev.map(s => {
        const isCurrent = s.id === streamId;
        const mixer = audioMixersRef.current.get(s.id);
        if (nextSolo) {
          if (isCurrent) {
            if (mixer) mixer.setVolume(s.audioVolume);
            return { ...s, isSolo: true, isMuted: false };
          } else {
            if (mixer) mixer.setVolume(0);
            return { ...s, isSolo: false, isMuted: true };
          }
        } else {
          // Unsolo all
          if (mixer) mixer.setVolume(s.audioVolume);
          return { ...s, isSolo: false, isMuted: false };
        }
      });
    });
  }, []);

  const setStreamAudioDelay = useCallback((streamId: string, delayMs: number) => {
    const mixer = audioMixersRef.current.get(streamId);
    if (mixer) mixer.setDelayMs(delayMs);
    setCameraStreams(prev => prev.map(s => s.id === streamId ? { ...s, audioDelayMs: delayMs } : s));
  }, []);

  // Add a local high-fidelity synthetic stream (for demo & studio testing)
  const addSyntheticStream = useCallback((label: string, width = 1920, height = 1080, fps = 60) => {
    const id = `cam_${Math.random().toString(36).substring(2, 8)}`;
    const { stream } = createSyntheticStream(label, width, height, fps);
    const mixer = new AudioMixerNode();
    const mixedStream = mixer.attachStream(stream);
    audioMixersRef.current.set(id, mixer);

    const newCamera: CameraStream = {
      id,
      peerId: id,
      label,
      mediaStream: mixedStream,
      tally: 'standby',
      audioVolume: 1.0,
      isMuted: false,
      isSolo: false,
      audioDelayMs: 0,
      stats: {
        fps,
        bitrateKbps: 30000,
        width,
        height,
        rttMs: 2,
        packetLossPercent: 0,
        jitterMs: 1,
        encoder: 'NVENC H.264 High (Synthetic)',
        decoder: 'Direct GPU Pipeline',
        droppedFrames: 0,
        health: 'green',
        timestamp: Date.now()
      }
    };

    setCameraStreams(prev => [...prev, newCamera]);
  }, []);

  // Periodic Telemetry polling
  useEffect(() => {
    const lastStatsMap = new Map<string, any>();

    statsIntervalRef.current = setInterval(async () => {
      if (p2pConnectionsRef.current.size === 0) return;

      for (const [peerId, pc] of p2pConnectionsRef.current.entries()) {
        try {
          const lastStats = lastStatsMap.get(peerId);
          const stats = await collectStreamStats(pc, lastStats);
          lastStatsMap.set(peerId, {
            bytesReceived: stats.bytesNow,
            framesDecoded: stats.framesNow,
            timestamp: stats.timestamp
          });

          const health: 'green' | 'yellow' | 'red' =
            stats.packetLossPercent > 5 || stats.fps < 20 ? 'red' :
            stats.packetLossPercent > 1 || stats.fps < 45 ? 'yellow' : 'green';

          setCameraStreams(prev => prev.map(s => {
            if (s.peerId === peerId) {
              return {
                ...s,
                stats: {
                  fps: stats.fps || 60,
                  bitrateKbps: stats.bitrateKbps || 25000,
                  width: stats.width || 1920,
                  height: stats.height || 1080,
                  rttMs: stats.rttMs || 4,
                  packetLossPercent: stats.packetLossPercent,
                  jitterMs: stats.jitterMs,
                  encoder: stats.encoder,
                  decoder: stats.decoder,
                  droppedFrames: stats.droppedFrames,
                  health,
                  timestamp: stats.timestamp
                }
              };
            }
            return s;
          }));
        } catch (e) {
          // stats collection error
        }
      }
    }, 1000);

    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, []);

  // Sender registration methods for multi-peer broadcasting
  const registerLocalSenderStream = useCallback((stream: MediaStream, settings?: any) => {
    localSenderStreamRef.current = stream;
    senderSettingsRef.current = settings;
    isBroadcastingRef.current = true;
    roleRef.current = 'sender';

    console.log('[Sender] Registered stream with pipeline. Tracks:', stream.getTracks().map(t => `${t.kind}:${t.id}`));

    // Broadcast sender-joined to any receivers currently in the room
    wsSend({
      type: 'sender-joined',
      roomId: roomIdRef.current,
      sender: {
        peerId: peerIdRef.current,
        label: settings?.sourceLabel || 'Camera',
        streamId: peerIdRef.current,
        settings
      }
    });

    // Request active receivers to immediately connect
    wsSend({
      type: 'request-active-receivers',
      roomId: roomIdRef.current
    });
  }, [wsSend]);

  const unregisterLocalSenderStream = useCallback(() => {
    isBroadcastingRef.current = false;
    localSenderStreamRef.current = null;
    wsSend({
      type: 'sender-left',
      roomId: roomIdRef.current,
      peerId: peerIdRef.current
    });
    p2pSenderConnectionsRef.current.forEach(pc => pc.close());
    p2pSenderConnectionsRef.current.clear();
  }, [wsSend]);

  const getPrimarySenderPeerConnection = useCallback(() => {
    for (const [, pc] of p2pSenderConnectionsRef.current) {
      if (pc.connectionState === 'connected' || pc.connectionState === 'connecting') {
        return pc;
      }
    }
    const first = p2pSenderConnectionsRef.current.values().next().value;
    return first || null;
  }, []);

  return (
    <LiveLinkContext.Provider
      value={{
        isConnected,
        isReconnecting,
        roomId,
        peerId,
        role,
        mode,
        serverInfo,
        cameraStreams,
        programStreamId,
        previewStreamId,
        cues,
        joinRoom,
        leaveRoom,
        sendRemoteControl,
        updateTally,
        sendCue,
        setProgramStream,
        setPreviewStream,
        cutProgramPreview,
        setStreamVolume,
        toggleStreamMute,
        toggleStreamSolo,
        setStreamAudioDelay,
        addSyntheticStream,
        registerLocalSenderStream,
        unregisterLocalSenderStream,
        getPrimarySenderPeerConnection,
        onRemoteControlReceived: (cb) => { remoteControlCallbacks.current.push(cb); },
        onCueReceived: (cb) => { cueCallbacks.current.push(cb); },
        wsSend
      }}
    >
      {children}
    </LiveLinkContext.Provider>
  );
};

export const useLiveLink = () => {
  const ctx = useContext(LiveLinkContext);
  if (!ctx) throw new Error('useLiveLink must be used within a LiveLinkProvider');
  return ctx;
};
