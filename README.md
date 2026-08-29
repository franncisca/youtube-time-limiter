# YouTube Time Limiter

Status: MVP in progress

A Chrome extension experiment that helps reduce YouTube overconsumption by tracking active watch time and enforcing a configurable daily limit.

## Why I Built This

YouTube can easily turn into passive overconsumption. This project explores a simple browser-level intervention: track time only when a video is actually playing, store daily usage locally, and stop playback when the daily limit is reached.

## Current Features

- Detect YouTube video playback from a content script
- Track watch time only while the video is actively playing
- Store usage data locally in the browser
- Provide the foundation for a configurable daily limit
- Include an options page skeleton for future settings

## Tech Stack

- JavaScript
- Chrome Extensions API
- HTML
- CSS

## Project Structure

- `manifest.json` - Chrome extension configuration
- `content.js` - YouTube page detection and watch-time tracking logic
- `background.js` - background script placeholder
- `options.html` - settings page skeleton
- `options.js` - options page script placeholder
- `styles.css` - styles placeholder

## What This Shows

- Browser extension architecture
- DOM interaction through content scripts
- Local state management for daily usage tracking
- Product thinking around a small personal productivity tool

## No Live Demo Yet

This project is not deployed as a public Chrome Web Store extension. It can be tested locally as an unpacked Chrome extension during development.

## Roadmap

- Finish the settings page
- Let users configure the daily limit
- Enforce blocking behavior when the limit is reached
- Add reset behavior per calendar day
- Improve UI feedback when the limit is close or reached
- Add manual local installation instructions
