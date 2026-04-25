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

  let videoElement = null;
  let playbackState = "unkown";
  let listenerAttached = false;

  function log(message) {
    console.log(`${LOG_PREFIX} ${message}`);
  }

  //detect video
  function getVideoElement() {
    //document: current page
    const video = document.querySelector("video");
    return video instanceof HTMLVideoElement ? video : null;
  }

  function updatePlaybackState(newState) {
    playbackState = newState;
    log(`Playback state changed : ${playbackState}`);
  }

  function attachPlaybackListener(video) {
    if(listenerAttached) {
        log("Playback listeners already attached.");
        return;
    }

    // 1. Listen for future changes
    video.addEventListener("play", () => {
        updatePlaybackState("playing");
    });

    video.addEventListener("pause", () => {
        updatePlaybackState("paused");
    });

    video.addEventListener("ended", () => {
        updatePlaybackState("ended");
    });


    // 2. Set current state 
    if (video.ended) {
        updatePlaybackState("ended");
    } 
    else if(video.pause) {
        updatePlaybackState("paused");
    }
    else {
        updatePlaybackState("playing");
    }
  }

  function detectVideoElement() {
    let attempts = 0;

    // retry logic
    //setInterval: Runs a function repeatedly every X milliseconds
    const intervalId = window.setInterval(() => {
      attempts += 1;

      const video = getVideoElement();

      if (video) {
        videoElement = video;
        log(`video element found after ${attempts} attempts`);

        attachPlaybackListener(video);

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