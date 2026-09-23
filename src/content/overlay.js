(function (root) {
  const css = `
    :host { all: initial; color-scheme: light; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .panel { position: fixed; top: 96px; right: 16px; width: 232px; z-index: 2147483646; border: 1px solid #456553; border-radius: 16px; color: #f1f7ef; background: #244e3ef5; box-shadow: 0 8px 32px #0003; font: 13px/1.5 system-ui, sans-serif; padding: 14px; }
    button { font: inherit; cursor: pointer; border: 0; border-radius: 8px; padding: 7px 10px; }
    button:focus-visible { outline: 3px solid #d9ebac; outline-offset: 3px; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .header span { font-weight: 600; font-size: 12px; }
    .icon { background: #ffffff16; color: white; padding: 2px 8px; }
    .label { margin: 12px 0 0; color: #ccdecf; font-size: 11px; }
    .time { font-size: 32px; line-height: 1.4; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: 1px; }
    .detail { margin: 6px 0 10px; font-size: 11px; color: #c9dbcd; }
    progress { appearance: none; display: block; width: 100%; height: 5px; border: 0; border-radius: 8px; overflow: hidden; background: #ffffff24; }
    progress::-webkit-progress-bar { background: #ffffff24; }
    progress::-webkit-progress-value { background: #c9e5a8; }
    .actions { display: flex; gap: 8px; margin-top: 12px; }
    .actions button { flex: 1; font-size: 11px; background: #ffffff16; color: white; }
    .panel[data-blocked="true"] { border-color: #e6b475; }
    .panel[data-blocked="true"] .time { color: #ffda9c; }
    .compact-time { font-variant-numeric: tabular-nums; font-size: 13px; margin-top: 6px; }
    .exclude-button { width: 100%; margin-top: 8px; background: #ffffff16; color: white; font-size: 11px; }
    .error { color: #ffe0ac; font-size: 11px; margin: 10px 0 0; }
    dialog { padding: 30px; width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; margin: auto; border: 1px solid #dce6da; border-radius: 22px; color: #243d2e; background: #f7f9f3; box-shadow: 0 24px 80px #0005; font: 14px/1.7 system-ui, sans-serif; }
    dialog::backdrop { background: #101e18a6; }
    .badge { display: inline-block; padding: 5px 12px; background: #e2eadc; border-radius: 20px; color: #3d6249; font-size: 12px; }
    h2 { font-size: 25px; line-height: 1.3; margin: 18px 0 12px; }
    dialog p { margin: 10px 0; }
    .summary { padding: 12px; background: #eaf0e4; border-radius: 10px; font-variant-numeric: tabular-nums; }
    .hint { color: #64755e; font-size: 12px; }
    .dialog-actions { display: flex; gap: 10px; margin-top: 20px; }
    .dialog-actions button { flex: 1; padding: 11px; background: #e3eadc; color: #304f39; }
    .dialog-actions .primary { background: #315f47; color: #fff; }
    @media (max-width: 600px) { .panel { top: auto; bottom: 16px; width: 206px; } }
  `;
  class Overlay {
    constructor({ document, openSettings, navigate, getVideoId = () => null, toggleExclusion, now = Date.now }) {
      Object.assign(this, { document, openSettings, navigate, getVideoId, toggleExclusion, now });
      this.t = (key, values) => root.YTLI18n.t(key, this.state?.language || 'en', values);
      this.labels = []; this.errorKey = null;
      this.visible = false; this.state = null; this.shownKey = null; this.collapsed = false; this.left = false;
      this.host = document.createElement('div');
      this.host.id = 'ytl-overlay';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      const style = document.createElement('style'); style.textContent = css; this.shadow.append(style);
      const el = (tag, parent, text, className) => {
        const node = document.createElement(tag); if (text) { node.textContent = this.t(text); this.labels.push({ node, key: text }); }
        if (className) node.className = className; parent.append(node); return node;
      };
      this.panel = el('section', this.shadow, '', 'panel'); this.panel.setAttribute('aria-label', this.t('ui.youtubeWatchTimer'));
      const header = el('div', this.panel, '', 'header');
      this.mode = el('span', header, 'ui.watchTimer');
      this.toggle = el('button', header, '−', 'icon'); this.toggle.setAttribute('aria-label', this.t('ui.collapseTimer')); this.toggle.setAttribute('aria-expanded', 'true');
      this.compact = el('div', this.panel, '', 'compact-time'); this.compact.hidden = true;
      this.body = el('div', this.panel);
      this.label = el('p', this.body, 'ui.watchTimeLeft', 'label'); this.remaining = el('div', this.body, '--:--:--', 'time');
      this.progress = el('progress', this.body); this.progress.max = 100; this.progress.value = 0; this.progress.setAttribute('aria-label', this.t('ui.allowanceUsedText'));
      this.detail = el('p', this.body, '', 'detail');
      const actions = el('div', this.body, '', 'actions');
      this.settingsButton = el('button', actions, 'ui.settings'); this.sideButton = el('button', actions, 'ui.left');
      this.excludeButton = el('button', this.body, 'ui.exclude', 'exclude-button');
      this.excludeButton.addEventListener('click', async () => {
        if (!this.toggleExclusion || this.excludeButton.disabled) return;
        this.excludeButton.disabled = true;
        try { await this.toggleExclusion(); }
        catch { this.showError('ui.couldNotUpdateTheListRetryOrOpen'); }
        finally { this.excludeButton.disabled = false; }
      });
      this.error = el('p', this.panel, '', 'error'); this.error.hidden = true; this.error.setAttribute('role', 'status');
      this.dialog = el('dialog', this.shadow); this.dialog.setAttribute('aria-labelledby', 'ytl-title'); this.dialog.setAttribute('aria-describedby', 'ytl-message');
      el('span', this.dialog, 'ui.watchTimeReminder', 'badge'); el('h2', this.dialog, 'ui.timeSUpTakeABreak').id = 'ytl-title';
      this.message = el('p', this.dialog); this.message.id = 'ytl-message';
      this.summary = el('p', this.dialog, '', 'summary');
      el('p', this.dialog, 'ui.dismissingThisReminderKeepsTheLimitInPlace', 'hint');
      const dialogActions = el('div', this.dialog, '', 'dialog-actions');
      this.dismiss = el('button', dialogActions, 'ui.gotIt', 'primary'); this.dismiss.autofocus = true;
      this.dialogSettings = el('button', dialogActions, 'ui.settings');
      this.dismiss.addEventListener('click', () => this.closeDialog());
      this.settingsButton.addEventListener('click', () => this.open());
      this.dialogSettings.addEventListener('click', () => this.open());
      this.toggle.addEventListener('click', () => {
        this.collapsed = !this.collapsed; this.body.hidden = this.collapsed; this.compact.hidden = !this.collapsed;
        this.toggle.textContent = this.collapsed ? '+' : '−';
        this.toggle.setAttribute('aria-label', this.collapsed ? this.t('ui.expandTimer') : this.t('ui.collapseTimer'));
        this.toggle.setAttribute('aria-expanded', String(!this.collapsed));
      });
      this.sideButton.addEventListener('click', () => {
        this.left = !this.left; this.panel.style.left = this.left ? '16px' : 'auto'; this.panel.style.right = this.left ? 'auto' : '16px';
        this.sideButton.textContent = this.left ? this.t('ui.right') : this.t('ui.left');
      });
      this.panel.hidden = true; this.reparent();
    }
    reparent() {
      // YouTube full screen uses a player container. Native video full screen cannot contain UI.
      const full = this.document.fullscreenElement;
      const parent = full && full.tagName !== 'VIDEO' ? full : this.document.documentElement;
      if (this.host.parentNode !== parent) {
        const wasOpen = this.dialog.open; this.closeDialog(); parent.append(this.host);
        if (wasOpen && this.visible) this.dialog.showModal();
      }
    }
    closeDialog() { if (this.dialog.open) this.dialog.close(); }
    setVisible(visible) {
      this.visible = visible; this.panel.hidden = !visible;
      if (!visible) this.closeDialog();
      else if (this.state) this.update(this.state);
    }
    update(state) {
      this.state = state;
      const normalized = root.YTLCore.normalize(state, this.now());
      for (const { node, key } of this.labels) node.textContent = this.t(key);
      this.host.setAttribute('lang', normalized.language);
      this.panel.setAttribute('aria-label', this.t('ui.youtubeWatchTimer'));
      this.progress.setAttribute('aria-label', this.t('ui.allowanceUsedText'));
      this.toggle.textContent = this.collapsed ? '+' : '−';
      this.toggle.setAttribute('aria-label', this.t(this.collapsed ? 'ui.expandTimer' : 'ui.collapseTimer'));
      this.sideButton.textContent = this.t(this.left ? 'ui.right' : 'ui.left');
      if (this.errorKey) this.error.textContent = this.t(this.errorKey);
      const id = this.getVideoId();
      const excluded = root.YTLCore.isExcluded(normalized, id);
      this.excludeButton.hidden = !id || !this.toggleExclusion;
      this.excludeButton.textContent = excluded ? this.t('ui.include') : this.t('ui.exclude');
      this.label.textContent = excluded ? this.t('ui.currentVideo') : this.t('ui.watchTimeLeft');
      this.progress.hidden = excluded;
      const usage = root.YTLCore.currentUsage(normalized, this.now());
      const format = root.YTLCore.formatTime;
      this.mode.textContent = normalized.mode === 'session' ? this.t('ui.temporaryAllowance') : this.t('ui.dailyAllowanceText');
      this.remaining.textContent = format(usage.remainingMs);
      this.compact.textContent = this.t('ui.remainingTime', { time: format(usage.remainingMs) });
      this.detail.textContent = this.t('ui.watchedUsedLimit', { used: format(usage.watchedMs), limit: format(usage.limitMs) });
      this.progress.value = Math.min(100, usage.watchedMs / usage.limitMs * 100);
      this.panel.setAttribute('data-blocked', String(usage.blocked));
      this.message.textContent = normalized.mode === 'session'
        ? this.t('ui.yourTemporaryAllowanceIsUsedUpPlaybackIs')
        : this.t('ui.todaySTotalHasReachedYourDailyLimit');
      this.summary.textContent = this.t('ui.watchedUsedLimitLimit', { used: format(usage.watchedMs), limit: format(usage.limitMs) });
      if (excluded) {
        this.mode.textContent = this.t('ui.exclude');
        this.remaining.textContent = this.t('ui.excluded');
        this.compact.textContent = this.t('ui.exclude');
        this.detail.textContent = this.t('ui.noTimeCountedNoLimitAction');
        this.panel.setAttribute('data-blocked', 'false');
        this.closeDialog(); this.shownKey = null; return;
      }
      if (!usage.blocked) { this.shownKey = null; this.closeDialog(); return; }
      const key = `${normalized.day}:${normalized.mode}:${normalized.session?.startedAt || 0}:${usage.limitMs}:${normalized.limitAction}:${normalized.redirectUrl}`;
      if (this.visible && this.shownKey !== key) {
        this.shownKey = key;
        if (normalized.limitAction === 'redirect' && this.navigate) {
          this.closeDialog();
          try { this.navigate(normalized.redirectUrl); return; }
          catch { this.showError('ui.couldNotRedirectPlaybackRemainsPausedWithThis'); }
        }
        if (!this.dialog.open) this.dialog.showModal();
      }
    }
    async open() {
      try { await this.openSettings(); this.closeDialog(); }
      catch { this.showError('ui.couldNotOpenSettingsUseTheExtensionIcon'); }
    }
    showError(message) { this.errorKey = message; this.error.textContent = this.t(message); this.error.hidden = false; }
    dispose() { this.visible = false; this.closeDialog(); this.host.remove(); }
  }
  root.YTLOverlay = Overlay;
  if (typeof module !== 'undefined') module.exports = Overlay;
})(globalThis);
