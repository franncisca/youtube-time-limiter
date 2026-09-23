(function (root) {
  class Tracker {
    // Browser timer APIs need the global receiver, not a Tracker instance.
    constructor({ findVideo, getVideoId = () => null, send, now = Date.now, monotonic = () => performance.now(), schedule = (callback, delay) => root.setInterval(callback, delay), cancel = id => root.clearInterval(id), onState = () => {}, onError = () => {} }) {
      Object.assign(this, { findVideo, getVideoId, send, now, monotonic, schedule, cancel, onState, onError });
      this.videoId = null;
      this.video = null; this.active = false; this.disposed = false; this.navigating = false;
      this.state = null; this.listeners = []; this.timer = null; this.lastStatusDay = null;
    }
    start() {
      if (this.timer !== null || this.disposed) return;
      this.request({ type: 'status' });
      this.sync();
      this.timer = this.schedule(() => this.tick(), 1000);
    }
    request(message) {
      return Promise.resolve().then(() => this.send(message)).then(result => {
        if (result.error) throw new Error(result.error);
        if (!this.disposed) this.updateState(result.state);
      }).catch(error => this.onError(error));
    }
    updateState(state) {
      const changedExclusion = this.excluded() !== root.YTLCore.isExcluded(state, this.videoId);
      if (changedExclusion) this.settle();
      this.state = state;
      this.enforce();
      this.onState(state);
    }
    excluded() { return root.YTLCore.isExcluded(this.state, this.videoId); }
    blocked() {
      return this.state && !this.excluded() ? root.YTLCore.currentUsage(this.state, this.now()).blocked : false;
    }
    enforce() { if (this.blocked() && this.video && !this.video.paused) this.video.pause(); }
    settle() {
      const end = this.now(), mono = this.monotonic();
      if (this.active && !this.excluded()) {
        const elapsed = Math.max(0, mono - this.lastMono);
        if (elapsed) this.request({ type: 'usage', videoId: this.videoId, start: this.lastWall, end, elapsed });
      }
      this.lastWall = end; this.lastMono = mono;
    }
    setActive(active) { this.settle(); this.active = active; }
    attach(video) {
      if (video === this.video) return;
      this.setActive(false);
      for (const [event, handler] of this.listeners) this.video.removeEventListener(event, handler);
      this.listeners = []; this.video = video;
      if (!video) return;
      const listen = (event, handler) => { video.addEventListener(event, handler); this.listeners.push([event, handler]); };
      listen('playing', () => { this.enforce(); this.setActive(!video.paused && !video.ended && !this.blocked()); });
      // play expresses intent; only playing confirms frames can advance.
      listen('play', () => this.enforce());
      for (const event of ['pause', 'ended', 'waiting', 'seeking', 'emptied', 'error']) listen(event, () => this.setActive(false));
      this.enforce();
      this.setActive(!video.paused && !video.ended && !video.seeking && video.readyState >= 3 && !this.blocked());
    }
    sync() {
      const id = this.navigating ? null : this.getVideoId();
      const changed = id !== this.videoId;
      if (changed) { this.attach(null); this.videoId = id; }
      this.attach(this.navigating ? null : this.findVideo());
      if (changed && this.state) this.onState(this.state);
    }
    tick() {
      this.sync();
      if (this.video && (this.video.paused || this.video.ended || this.video.seeking || this.video.readyState < 3)) this.setActive(false);
      else this.settle();
      const day = root.YTLCore.dayKey(this.now());
      if (day !== this.lastStatusDay) { this.lastStatusDay = day; this.request({ type: 'status' }); }
      this.enforce();
    }
    navigationStart() { this.navigating = true; this.attach(null); }
    navigationEnd() { this.navigating = false; this.sync(); }
    dispose() {
      if (this.disposed) return;
      this.attach(null); this.disposed = true;
      if (this.timer !== null) this.cancel(this.timer);
      this.timer = null;
    }
  }
  root.YTLTracker = Tracker;
  if (typeof module !== 'undefined') module.exports = Tracker;
})(globalThis);
