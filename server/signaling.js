const { WebSocketServer } = require('ws');
const mediasoupManager = require('./mediasoupManager');

class SignalingServer {
  constructor(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.rooms = new Map(); // roomId -> { clients: Map(ws -> clientInfo), senders: Map, tally: Map, mode: 'sfu' }
    this.init();
  }

  init() {
    this.wss.on('connection', (ws, req) => {
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleMessage(ws, data);
        } catch (err) {
          console.error('[Signaling Error]', err.message);
          this.send(ws, { type: 'error', error: err.message });
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });
    });

    // Heartbeat watchdog every 5 seconds
    this.pingInterval = setInterval(() => {
      for (const client of this.wss.clients) {
        if (!client.isAlive) {
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, 5000);
  }

  send(ws, data) {
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  broadcastToRoom(roomId, data, excludeWs = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const [ws] of room.clients) {
      if (ws !== excludeWs && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(data));
      }
    }
  }

  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        roomId,
        clients: new Map(),
        senders: new Map(), // peerId -> senderMetadata
        tally: new Map(),   // streamId -> 'program' | 'preview' | 'standby'
        mode: 'sfu'         // 'sfu' or 'p2p'
      });
    }
    return this.rooms.get(roomId);
  }

  async handleMessage(ws, data) {
    const { type, roomId = 'studio' } = data;
    const room = this.getOrCreateRoom(roomId);
    const client = room.clients.get(ws);
    const peerId = data.peerId || client?.peerId || `peer_${Math.random().toString(36).substring(2, 9)}`;

    switch (type) {
      case 'join': {
        const { role = 'receiver', label = 'Camera', streamId, mode } = data;
        const clientInfo = {
          ws,
          peerId,
          role,
          label,
          streamId: streamId || peerId,
          roomId,
          connectedAt: Date.now()
        };

        room.clients.set(ws, clientInfo);
        if (mode && (mode === 'sfu' || mode === 'p2p')) {
          room.mode = mode;
        }

        if (role === 'sender') {
          room.senders.set(peerId, {
            peerId,
            label,
            streamId: clientInfo.streamId,
            settings: data.settings || {},
            tally: room.tally.get(clientInfo.streamId) || 'standby'
          });

          // Notify receivers about new sender
          this.broadcastToRoom(roomId, {
            type: 'sender-joined',
            sender: room.senders.get(peerId)
          }, ws);
        } else {
          // Notify senders about new receiver or viewer
          this.broadcastToRoom(roomId, {
            type: 'receiver-joined',
            receiver: {
              peerId,
              role,
              label,
              streamId: clientInfo.streamId
            }
          }, ws);
        }

        // Send back join acknowledgment with current room state
        const existingSenders = Array.from(room.senders.values());
        const producers = mediasoupManager.getProducers(roomId);

        this.send(ws, {
          type: 'joined',
          roomId,
          peerId,
          role,
          mode: room.mode,
          senders: existingSenders,
          producers,
          tally: Object.fromEntries(room.tally)
        });

        console.log(`[Signaling] Peer ${peerId} (${role} - "${label}") joined room "${roomId}" [Total: ${room.clients.size}]`);
        break;
      }

      case 'sender-joined':
      case 'sender-register': {
        const senderInfo = data.sender || {};
        const effectivePeerId = senderInfo.peerId || peerId;
        const label = senderInfo.label || client?.label || 'Camera';
        const streamId = senderInfo.streamId || client?.streamId || effectivePeerId;
        const settings = senderInfo.settings || {};

        if (client) {
          client.role = 'sender';
          client.label = label;
          client.streamId = streamId;
        }

        const senderData = {
          peerId: effectivePeerId,
          label,
          streamId,
          settings,
          tally: room.tally.get(streamId) || 'standby'
        };

        room.senders.set(effectivePeerId, senderData);
        console.log(`[Signaling] Sender registered & broadcasting: ${effectivePeerId} ("${label}") in room "${roomId}"`);

        // Broadcast sender-joined to all receivers and viewers
        this.broadcastToRoom(roomId, {
          type: 'sender-joined',
          sender: senderData
        }, ws);

        // Also notify the broadcasting sender of all currently active receivers
        for (const [rWs, rInfo] of room.clients) {
          if (rWs !== ws && (rInfo.role === 'receiver' || rInfo.role === 'viewer')) {
            this.send(ws, {
              type: 'receiver-joined',
              receiver: {
                peerId: rInfo.peerId,
                role: rInfo.role,
                label: rInfo.label,
                streamId: rInfo.streamId
              }
            });
          }
        }
        break;
      }

      case 'sender-left':
      case 'sender-unregister': {
        const effectivePeerId = data.peerId || peerId;
        room.senders.delete(effectivePeerId);
        if (client) client.role = 'receiver';
        console.log(`[Signaling] Sender stopped: ${effectivePeerId} in room "${roomId}"`);
        this.broadcastToRoom(roomId, {
          type: 'sender-left',
          peerId: effectivePeerId,
          streamId: effectivePeerId
        }, ws);
        break;
      }

      case 'get-senders': {
        const existingSenders = Array.from(room.senders.values());
        this.send(ws, {
          type: 'senders-list',
          senders: existingSenders
        });
        break;
      }

      // --- Mediasoup SFU Signaling ---
      case 'get-rtp-capabilities': {
        await mediasoupManager.getOrCreateRoom(roomId);
        const rtpCapabilities = mediasoupManager.getRtpCapabilities(roomId);
        this.send(ws, { type: 'rtp-capabilities', rtpCapabilities });
        break;
      }

      case 'create-transport': {
        const { direction } = data; // 'send' or 'recv'
        const transportParams = await mediasoupManager.createWebRtcTransport(roomId, peerId, direction);
        this.send(ws, {
          type: 'transport-created',
          direction,
          transportParams
        });
        break;
      }

      case 'get-producers': {
        const producers = mediasoupManager.getProducers(roomId);
        for (const p of producers) {
          this.send(ws, {
            type: 'new-producer',
            producerId: p.producerId,
            peerId: p.peerId,
            kind: p.kind,
            streamId: p.streamId,
            label: p.label,
            appData: p.appData
          });
        }
        break;
      }

      case 'connect-transport': {
        const { transportId, dtlsParameters } = data;
        await mediasoupManager.connectTransport(roomId, transportId, dtlsParameters);
        this.send(ws, { type: 'transport-connected', transportId });
        break;
      }

      case 'produce': {
        const { transportId, kind, rtpParameters, appData = {} } = data;
        appData.peerId = peerId;
        const producerId = await mediasoupManager.produce(roomId, transportId, kind, rtpParameters, appData);

        this.send(ws, {
          type: 'produced',
          producerId,
          kind,
          streamId: appData.streamId
        });

        // Broadcast new producer to all receivers in room
        this.broadcastToRoom(roomId, {
          type: 'new-producer',
          producerId,
          peerId,
          kind,
          streamId: appData.streamId,
          label: appData.label || 'Camera Feed',
          appData
        }, ws);
        break;
      }

      case 'consume': {
        const { transportId, producerId, rtpCapabilities } = data;
        const consumerParams = await mediasoupManager.consume(roomId, transportId, producerId, rtpCapabilities);
        this.send(ws, {
          type: 'consumed',
          consumerParams
        });
        break;
      }

      // --- Direct P2P Signaling ---
      case 'offer': {
        const { targetPeerId, sdp, label } = data;
        const senderPeerId = data.senderPeerId || peerId;
        console.log(`[Signaling] Offer: ${senderPeerId} -> ${targetPeerId}`);
        this.routeToPeer(roomId, targetPeerId, {
          type: 'offer',
          senderPeerId,
          peerId: senderPeerId,
          label: label || 'Camera',
          sdp
        }, ws);
        break;
      }

      case 'answer': {
        const { targetPeerId, sdp } = data;
        const senderPeerId = data.senderPeerId || peerId;
        console.log(`[Signaling] Answer: ${senderPeerId} -> ${targetPeerId}`);
        this.routeToPeer(roomId, targetPeerId, {
          type: 'answer',
          senderPeerId,
          peerId: senderPeerId,
          sdp
        }, ws);
        break;
      }

      case 'ice-candidate': {
        const { targetPeerId, candidate } = data;
        const senderPeerId = data.senderPeerId || peerId;
        this.routeToPeer(roomId, targetPeerId, {
          type: 'ice-candidate',
          senderPeerId,
          peerId: senderPeerId,
          candidate
        }, ws);
        break;
      }

      case 'request-stream': {
        const { targetPeerId } = data;
        const requesterPeerId = data.requesterPeerId || peerId;
        console.log(`[Signaling] Request-stream: ${requesterPeerId} -> ${targetPeerId}`);
        this.routeToPeer(roomId, targetPeerId, {
          type: 'request-stream',
          requesterPeerId,
          peerId: requesterPeerId
        }, ws);
        break;
      }

      case 'request-active-receivers': {
        const room = this.rooms.get(roomId);
        if (room) {
          for (const [rWs, rInfo] of room.clients) {
            if (rWs !== ws && (rInfo.role === 'receiver' || rInfo.role === 'viewer')) {
              this.send(ws, {
                type: 'receiver-joined',
                receiver: {
                  peerId: rInfo.peerId,
                  role: rInfo.role,
                  label: rInfo.label,
                  streamId: rInfo.streamId
                }
              });
            }
          }
        }
        break;
      }

      // --- Studio Controls: Remote Control, Tally, Cues ---
      case 'remote-control': {
        const { targetPeerId, command, payload } = data;
        this.routeToPeer(roomId, targetPeerId, {
          type: 'remote-control',
          command,
          payload,
          fromPeerId: peerId
        });
        break;
      }

      case 'tally-update': {
        const { streamId, tallyState } = data; // 'program' | 'preview' | 'standby'
        room.tally.set(streamId, tallyState);

        // Broadcast tally state update to everyone in room
        this.broadcastToRoom(roomId, {
          type: 'tally-changed',
          streamId,
          tallyState
        });
        break;
      }

      case 'cue-message': {
        const { targetPeerId, message, duration = 5000 } = data;
        if (targetPeerId === 'all') {
          this.broadcastToRoom(roomId, {
            type: 'cue-message',
            message,
            duration,
            from: 'Director'
          });
        } else {
          this.routeToPeer(roomId, targetPeerId, {
            type: 'cue-message',
            message,
            duration,
            from: 'Director'
          });
        }
        break;
      }

      case 'update-metadata': {
        const sender = room.senders.get(peerId);
        if (sender) {
          sender.settings = { ...sender.settings, ...data.settings };
          if (data.label) sender.label = data.label;
          this.broadcastToRoom(roomId, {
            type: 'sender-updated',
            sender
          }, ws);
        }
        break;
      }

      case 'mode-override': {
        const { mode } = data;
        if (mode === 'sfu' || mode === 'p2p') {
          room.mode = mode;
          this.broadcastToRoom(roomId, {
            type: 'mode-changed',
            mode
          });
        }
        break;
      }
    }
  }

  routeToPeer(roomId, targetPeerId, payload, excludeWs = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (targetPeerId === 'all' || !targetPeerId) {
      for (const [ws, info] of room.clients) {
        if (ws !== excludeWs && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(payload));
        }
      }
      return;
    }
    for (const [ws, info] of room.clients) {
      if (info.peerId === targetPeerId && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(payload));
        return;
      }
    }
    console.warn(`[Signaling] targetPeerId "${targetPeerId}" not found in room "${roomId}"`);
  }

  handleDisconnect(ws) {
    for (const [roomId, room] of this.rooms) {
      if (room.clients.has(ws)) {
        const client = room.clients.get(ws);
        room.clients.delete(ws);

        if (client.role === 'sender') {
          room.senders.delete(client.peerId);
          this.broadcastToRoom(roomId, {
            type: 'sender-left',
            peerId: client.peerId,
            streamId: client.streamId
          });
        }

        console.log(`[Signaling] Peer ${client.peerId} disconnected from room "${roomId}"`);

        if (room.clients.size === 0) {
          // Keep room state alive briefly for quick reconnection
          setTimeout(() => {
            if (room.clients.size === 0) {
              this.rooms.delete(roomId);
            }
          }, 30000);
        }
      }
    }
  }

  getStats() {
    let totalSenders = 0;
    let totalReceivers = 0;
    const roomStats = [];

    for (const [roomId, room] of this.rooms) {
      let rSenders = 0;
      let rReceivers = 0;
      for (const [, info] of room.clients) {
        if (info.role === 'sender') rSenders++;
        else rReceivers++;
      }
      totalSenders += rSenders;
      totalReceivers += rReceivers;
      roomStats.push({
        roomId,
        mode: room.mode,
        senders: rSenders,
        receivers: rReceivers,
        total: room.clients.size
      });
    }

    return {
      activeRooms: this.rooms.size,
      totalSenders,
      totalReceivers,
      rooms: roomStats
    };
  }
}

module.exports = SignalingServer;
