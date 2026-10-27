/**
 * Lightweight in-memory room manager for LiveLink signaling
 * Eliminates heavy C++ native worker compilation, ensuring fast builds and low memory on cloud platforms (Render, Railway).
 */
class MediasoupManager {
  constructor() {
    this.rooms = new Map();
  }

  async init() {
    // Pure Direct WebRTC mode - 0 native compile time
    return true;
  }

  async getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        router: null,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map()
      });
    }
    return this.rooms.get(roomId);
  }

  getRtpCapabilities(roomId) {
    return { codecs: [], headerExtensions: [] };
  }

  async createWebRtcTransport(roomId, peerId, direction) {
    return {
      id: `transport_${Math.random().toString(36).substring(2, 9)}`,
      iceParameters: {},
      iceCandidates: [],
      dtlsParameters: {}
    };
  }

  getProducers(roomId) {
    return [];
  }

  async connectTransport(roomId, transportId, dtlsParameters) {
    return true;
  }

  async produce(roomId, transportId, kind, rtpParameters, appData = {}) {
    return `producer_${Math.random().toString(36).substring(2, 9)}`;
  }

  async consume(roomId, transportId, producerId, rtpCapabilities) {
    return {
      id: `consumer_${Math.random().toString(36).substring(2, 9)}`,
      producerId,
      kind: 'video',
      rtpParameters: {}
    };
  }
}

const instance = new MediasoupManager();
module.exports = instance;
