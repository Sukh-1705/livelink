const mediasoup = require('mediasoup');
const { getPrimaryLanIp } = require('./network');

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    parameters: {
      useinbandfec: 1,
      minptime: 10,
      stereo: 1,
      'sprop-stereo': 1,
      maxaveragebitrate: 256000
    }
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '64002a', // High Profile 4.2 - hardware accelerated (NVENC / QuickSync)
      'level-asymmetry-allowed': 1
    }
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f', // Baseline profile fallback
      'level-asymmetry-allowed': 1
    }
  },
  {
    kind: 'video',
    mimeType: 'video/VP9',
    clockRate: 90000,
    parameters: {
      'profile-id': 0
    }
  },
  {
    kind: 'video',
    mimeType: 'video/AV1',
    clockRate: 90000
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000
  }
];

class MediasoupManager {
  constructor() {
    this.worker = null;
    this.rooms = new Map(); // roomId -> { router, transports: Map, producers: Map, consumers: Map }
    this.primaryIp = getPrimaryLanIp();
  }

  async init() {
    if (this.worker) return;

    this.worker = await mediasoup.createWorker({
      rtcMinPort: 20000,
      rtcMaxPort: 29999,
      logLevel: 'warn',
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp']
    });

    this.worker.on('died', () => {
      console.error('Mediasoup Worker died! Restarting...');
      setTimeout(() => {
        this.worker = null;
        this.init();
      }, 2000);
    });

    console.log(`[Mediasoup] C++ Worker initialized (PID: ${this.worker.pid})`);
  }

  async getOrCreateRoom(roomId) {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId);
    }

    if (!this.worker) {
      await this.init();
    }

    const router = await this.worker.createRouter({ mediaCodecs });
    const roomState = {
      router,
      transports: new Map(), // transportId -> transport
      producers: new Map(),  // producerId -> { producer, peerId, kind, streamId, label }
      consumers: new Map()   // consumerId -> consumer
    };

    this.rooms.set(roomId, roomState);
    console.log(`[Mediasoup] Router created for room "${roomId}"`);
    return roomState;
  }

  async createWebRtcTransport(roomId, peerId, direction) {
    const room = await this.getOrCreateRoom(roomId);
    const listenIps = [
      { ip: '0.0.0.0', announcedIp: this.primaryIp },
      { ip: '127.0.0.1', announcedIp: '127.0.0.1' }
    ];

    const transport = await room.router.createWebRtcTransport({
      listenIps,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 60000000, // 60 Mbps initial bandwidth for LAN
      maxSctpMessageSize: 262144
    });

    // Auto close transport on disconnect
    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        transport.close();
      }
    });

    transport.on('close', () => {
      room.transports.delete(transport.id);
    });

    room.transports.set(transport.id, transport);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    };
  }

  async connectTransport(roomId, transportId, dtlsParameters) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);
    const transport = room.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    await transport.connect({ dtlsParameters });
  }

  async produce(roomId, transportId, kind, rtpParameters, appData = {}) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);
    const transport = room.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    const producer = await transport.produce({ kind, rtpParameters, appData });

    producer.on('transportclose', () => {
      room.producers.delete(producer.id);
    });

    room.producers.set(producer.id, {
      producer,
      peerId: appData.peerId,
      streamId: appData.streamId || producer.id,
      label: appData.label || 'Camera Feed',
      kind,
      appData
    });

    return producer.id;
  }

  async consume(roomId, transportId, producerId, rtpCapabilities) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error(`Cannot consume producer ${producerId} with provided capabilities`);
    }

    const transport = room.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false
    });

    consumer.on('transportclose', () => {
      room.consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
      room.consumers.delete(consumer.id);
    });

    room.consumers.set(consumer.id, consumer);

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      appData: consumer.appData
    };
  }

  async closeProducer(roomId, producerId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const entry = room.producers.get(producerId);
    if (entry && entry.producer) {
      entry.producer.close();
      room.producers.delete(producerId);
    }
  }

  getProducers(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    const list = [];
    for (const [id, entry] of room.producers) {
      list.push({
        producerId: id,
        peerId: entry.peerId,
        streamId: entry.streamId,
        label: entry.label,
        kind: entry.kind,
        appData: entry.appData
      });
    }
    return list;
  }

  getRtpCapabilities(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return room.router.rtpCapabilities;
  }
}

const instance = new MediasoupManager();
module.exports = instance;
