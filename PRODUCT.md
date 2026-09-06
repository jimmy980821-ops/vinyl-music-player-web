# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

The product has two implementations: Swift 5/SwiftUI/WebKit for iOS 17+, and a dependency-free static PWA for GitHub Pages. Both must work without committed credentials.

## Users

People who want a tactile, focused way to discover and play permitted YouTube music videos inside a native iPhone app.

## Product Purpose

Vinyl Music Player turns foreground YouTube playback into a modern turntable interaction: playback, the tonearm, and record motion remain synchronized while the official embedded player stays visible and usable.

## Positioning

The tonearm is the transport: placing it on the record plays, and returning it to its rest pauses, while the visible YouTube player preserves the standard viewing experience.

## Operating Context

Foreground use on iPhone, iPad, and desktop browsers with a visible embedded YouTube player, a tactile turntable, and a simple queue. The web version can be installed as a home-screen or desktop shortcut.

## Capabilities and Constraints

- YouTube IFrame Player API hosted in `WKWebView`; no audio extraction, downloads, DRM/ad bypass, private URL schemes, or direct YouTube Music app control.
- Embedded video remains visible, unobscured, and at least 200×200 points.
- Playback pauses when the app leaves the foreground; background playback and lock-screen remote commands are intentionally excluded.
- Search uses YouTube Data API v3 only when a user-provided key is present; demo mode works without secrets.
- Playback, record rotation, and tonearm state synchronize bidirectionally and avoid command feedback loops.
- The static web build is deployed directly through GitHub Pages and stores no API secrets.

## Brand Commitments

The working name is “Vinyl Music Player.” The visual character is an uncluttered, dark, modern turntable: black and charcoal surfaces, restrained system material, soft shadows, realistic pivot motion, and no excessive skeuomorphism.

## Evidence on Hand

No brand assets, production screenshots, commercial claims, or private media were supplied. Demo content uses public YouTube video identifiers and is clearly labeled.

## Product Principles

- Preserve the standard YouTube viewing and advertising experience.
- Make physical interaction legible: the needle position always matches playback.
- Prefer native iOS behavior, accessibility, and motion settings.
- Remain useful and buildable without credentials.
- Fail clearly and recoverably.

## Accessibility & Inclusion

Use Dynamic Type, VoiceOver labels and values, 44-point touch targets, semantic colors, Reduce Motion behavior, and non-color status cues.
