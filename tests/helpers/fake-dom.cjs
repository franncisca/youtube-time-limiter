class Element extends EventTarget {
  constructor(tag = 'div') {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.attributes = {};
    this.parentNode = null; this.hidden = false; this.open = false; this.shows = 0; this.textContent = '';
  }
  append(...children) { for (const child of children) { child.remove(); this.children.push(child); child.parentNode = this; } }
  replaceChildren(...children) { for (const child of [...this.children]) child.remove(); this.append(...children); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  attachShadow() { this.shadowRoot = new Element('shadow-root'); return this.shadowRoot; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  showModal() { this.open = true; this.shows++; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  click() { this.dispatchEvent(new Event('click')); }
}
function createDocument() {
  const document = new EventTarget(); document.documentElement = new Element('html');
  document.createElement = tag => new Element(tag); document.fullscreenElement = null;
  return document;
}
module.exports = { Element, createDocument };
