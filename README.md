# Vinyl Music Player

Vinyl Music Player is a SwiftUI iOS 17+ demo that pairs a tactile, modern turntable interface with a policy-conscious, visible YouTube IFrame Player embedded in `WKWebView`.

## Web / PWA version

The recommended version is now the dependency-free static PWA in `web/`. It deploys directly to GitHub Pages, supports installation as a home-screen or desktop app, and does not use ChatGPT hosting.

After pushing to GitHub, open **Settings → Pages → Build and deployment → Source → GitHub Actions**. The checked-in `pages.yml` workflow validates and publishes `web/` on every push to `main`.

Because a public static website cannot safely contain a YouTube Data API key, the web version adds tracks by YouTube URL or Video ID. The native iOS source remains available for future development.

> This app does not directly control the YouTube Music iOS application. Playback is provided through an embedded YouTube player where permitted.

## Screenshots

Simulator screenshots are intentionally not fabricated in this repository. After opening the project on macOS, run the app and capture an iPhone screenshot with:

```sh
xcrun simctl io booted screenshot screenshot-player.png
```

## Features

- Play/pause, previous/next, scrubbing, elapsed time, and a simple playback queue.
- A draggable tonearm where **needle on vinyl = play** and **needle at rest = pause**.
- Bidirectional synchronization between YouTube state, playback intent, tonearm position, and record rotation.
- `VinylRotationController` preserves its exact angle across pause and resume.
- Visible, unobscured 16:9 YouTube player with standard YouTube controls.
- YouTube Data API v3 search when configured, and a useful demo mode when it is not.
- In-memory artwork cache, graceful placeholders, haptics, Dynamic Type, VoiceOver metadata, and Reduce Motion support.
- Unit tests for time formatting, queue bounds, player state, and rotation continuity.
- Installable web app manifest, offline application shell, desktop/mobile responsive layout, and direct GitHub Pages deployment.

## Architecture

The project uses MVVM and dependency injection. `PlayerViewModel` coordinates four independent components: `YouTubePlayerController` owns the WebKit bridge, `PlaybackQueue` owns track order, `VinylRotationController` owns animation continuity, and `YouTubeSearchService` owns authenticated search. No singleton contains mutable app state; the image loader singleton is only a process-local cache.

The native controls express user intent. JavaScript messages report the authoritative player state. The ViewModel compares those states before issuing commands, preventing play/pause callback loops.

## Requirements

- macOS with Xcode 15.4 or newer (Xcode 16 recommended)
- iOS 17.0 or newer
- An internet connection for YouTube playback
- Optional: a YouTube Data API v3 key for search

## Installation

```sh
git clone <repository-url>
cd vinyl-music-player-ios
open VinylMusicPlayer.xcodeproj
```

Choose your Apple Development team if running on a physical device, select an iPhone simulator, and press **Run**. No package installation is required.

The checked-in GitHub Actions workflow runs the app target and unit tests on a macOS iPhone Simulator for every push and pull request.

## YouTube API setup

Playback through the IFrame Player API does not use the Data API key. Search does.

1. In Google Cloud Console, create or select a project.
2. Enable **YouTube Data API v3**.
3. Create an API key and restrict it appropriately for your usage and quota plan.
4. Copy the example configuration:

   ```sh
   cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig
   ```

5. Replace `YOUR_KEY_HERE` in `Config/Secrets.xcconfig`. Never commit that file.

The app reads `YOUTUBE_API_KEY` through the built Info.plist. With no key, Search shows setup guidance and the bundled demo queue remains available.

## Project structure

```text
VinylMusicPlayer/
├── Models/          Track and playback/needle state
├── Player/          WKWebView bridge and rotation controller
├── Queue/           Bounded playback queue
├── Services/        Search and cached image loading
├── Utilities/       Time formatting
├── ViewModels/      Playback orchestration
├── Views/           Player, turntable, controls, search, and states
├── Assets.xcassets/ App icon and accent color
└── VinylMusicApp.swift
VinylMusicPlayerTests/
Config/
```

## Known limitations

- The app does not control the official YouTube Music app; no supported public SDK provides that capability.
- Background playback is deliberately disabled. Leaving the active scene sends a pause command.
- Lock-screen Now Playing and `MPRemoteCommandCenter` are omitted because they imply background/audio-focused playback that conflicts with the embedded-player policy posture used here.
- Search currently uses YouTube's `search.list` and `videos.list` endpoints, which consume API quota.
- A video's owner may disable embedding or make a video unavailable at any time.
- When a video ends, the next queue item autoplays only while more than half of the embedded player is visible. Otherwise it is queued and resumes when the user brings the player into view, matching YouTube's scripted-playback visibility rule.
- Physical-device, Simulator, and signing verification require macOS/Xcode; this repository was generated in a Windows environment and must receive its final Xcode build verification on a Mac.

## YouTube policy considerations

The implementation uses the Apple-provided `WKWebView`, supplies a referrer policy, leaves the YouTube player visible and unobscured, keeps standard controls available, and renders it above the documented 200×200 minimum. It does not download media, isolate audio, suppress advertising, bypass access restrictions, or continue playback in the background.

Review the current official policies before distribution:

- [YouTube API Services — Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [YouTube API Services — Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube IFrame Player API Reference](https://developers.google.com/youtube/iframe_api_reference)

## App Store considerations

Before submission, provide a privacy policy explaining the data sent to Google/YouTube, verify every piece of streamed content is authorized for the intended use, replace the example bundle identifier, add production screenshots and metadata, and re-check [App Review Guidelines 2.5 and 5.2](https://developer.apple.com/app-store/review/guidelines/). Apple may request proof of authorization for third-party streamed content.

## Roadmap

- Persist the queue and recent searches.
- Add user-curated playlists without downloading media.
- Add UI tests and snapshot tests on supported iPhone sizes.
- Add privacy disclosure and consent UX suitable for release regions.
- Validate embedding eligibility and quota errors more specifically.

## License

MIT. See [LICENSE](LICENSE).
