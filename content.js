/**
 * This script is injected into YouTube watch pages.
 *
 * When a user opens a YouTube video page,
 * Chrome injects this script after the page is fully loaded
 * (configured via manifest.json content_scripts).
 */

(() => {
  const LOG_PREFIX = "[YT LIMITER]";
  const MAX_ATTEMPTS = 15;
  const RETRY_INTERVAL_MS = 1000;

  function log(message) {
    console.log(`${LOG_PREFIX} ${message}`);
  }

  //detect video
  function getVideoElement() {
    //document: current page
    const video = document.querySelector("video");
    return video instanceof HTMLVideoElement ? video : null;
  }

  function detectVideoElement() {
    let attempts = 0;

    // retry logic
    //setInterval: Runs a function repeatedly every X milliseconds
    const intervalId = window.setInterval(() => {
      attempts += 1;

      const video = getVideoElement();

      if (video) {
        log("video element found");
        window.clearInterval(intervalId);
        return;
      }

      if (attempts >= MAX_ATTEMPTS) {
        log("video element not found after retry limit");
        window.clearInterval(intervalId);
      }
    }, RETRY_INTERVAL_MS);
  }

  log("content script loaded");
  detectVideoElement();
})();