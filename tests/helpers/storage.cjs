function storage(initial) {
  let data = initial ? { usage: initial } : {};
  return { writes: 0, async get() { return structuredClone(data); }, async set(value) { this.writes++; data = structuredClone(value); } };
}

module.exports = { storage };
