const { Store } = require('../../src/shared/core.js');
const { storage } = require('./storage.cjs');
const Tracker = require('../../src/content/tracker.js');
const flush = () => new Promise(resolve => setImmediate(resolve));
class Video extends EventTarget {
  paused = true; ended = false; seeking = false; readyState = 4; pauses = 0;
  emit(name) { this.dispatchEvent(new Event(name)); }
  play() { this.paused = false; this.emit('play'); this.emit('playing'); }
  pause() { this.pauses++; this.paused = true; this.emit('pause'); }
}
function fixture(time = new Date(2026, 8, 22, 12).getTime()) {
  let wall = time, mono = 0, video = new Video(), nextId = 0, videoId = null;
  const timers = new Map(), disk = storage(), store = new Store(disk, () => wall), messages = [], errors = [];
  const tracker = new Tracker({ findVideo: () => video, getVideoId: () => videoId, now: () => wall, monotonic: () => mono,
    schedule: fn => { const id = ++nextId; timers.set(id, fn); return id; }, cancel: id => timers.delete(id),
    send: async message => { messages.push(message); return { state: await store.request(message) }; }, onError: e => errors.push(e),
  });
  return { tracker, disk, store, messages, errors, timers, get video() { return video; }, setVideoId(id) { videoId = id; }, replace(v) { video = v; },
    advance(ms) { wall += ms; mono += ms; }, async tick(ms = 1000) { this.advance(ms); for (const fn of timers.values()) fn(); await flush(); },
    async usage() { return (await disk.get()).usage; },
  };
}

module.exports = { flush, Video, storage, fixture };
