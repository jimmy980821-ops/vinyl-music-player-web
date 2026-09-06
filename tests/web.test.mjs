import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("web/index.html", "utf8");
const css = readFileSync("web/styles.css", "utf8");
const app = readFileSync("web/app.js", "utf8");
const manifest = JSON.parse(readFileSync("web/manifest.webmanifest", "utf8"));

test("all JavaScript element bindings exist in the document", () => {
  const list = app.match(/Object\.fromEntries\(\[([\s\S]*?)\]\.map/)?.[1] ?? "";
  for (const [, id] of list.matchAll(/"([\w-]+)"/g)) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
});

test("PWA manifest and install icons are complete", () => {
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  for (const icon of manifest.icons) assert.ok(existsSync(`web/${icon.src.replace("./", "")}`));
  assert.ok(existsSync("web/icons/icon-180.png"));
  assert.match(html, /rel="manifest"/);
});

test("YouTube player remains visible and policy-sized", () => {
  assert.match(css, /\.video-frame\s*\{[^}]*min-height:\s*200px/s);
  assert.doesNotMatch(css, /\.video-frame[^}]*opacity:\s*0/s);
  assert.match(app, /intersectionRatio\s*>=\s*\.5/);
  assert.doesNotMatch(app, /AIza[\w-]{20,}/);
});

test("offline shell and accessibility hooks are present", () => {
  assert.ok(existsSync("web/sw.js"));
  assert.match(html, /aria-label="唱針位置"/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(app, /visibilitychange/);
  assert.match(html, /id="connection-status"[^>]*aria-live="polite"/);
  assert.match(app, /pendingPlay\s*&&\s*playerMostlyVisible/);
  assert.match(app, /add-button"\][\s\S]*?requestPause\(\);[\s\S]*?add-dialog"\]\.showModal/);
  assert.match(app, /install-button"\][\s\S]*?requestPause\(\);[\s\S]*?install-dialog"\]\.showModal/);
  assert.doesNotMatch(app, /requestAnimationFrame\(updateProgress\)/);
});

test("playlist URLs load through the official YouTube player queue", () => {
  assert.match(html, /YouTube 單曲或播放清單網址/);
  assert.match(app, /function parsePlaylistId/);
  assert.match(app, /player\[method\]\(\{ listType: "playlist", list: playlistId/);
  assert.match(app, /player\.nextVideo\(\)/);
  assert.match(app, /player\.previousVideo\(\)/);
  assert.match(app, /player\.playVideoAt\(index\)/);
});

test("screen wake lock is opt-in and releases when playback pauses", () => {
  assert.match(html, /id="keep-awake"[^>]*checked/);
  assert.match(app, /navigator\.wakeLock\.request\("screen"\)/);
  assert.match(app, /releaseScreenWakeLock\(\)/);
  assert.match(html, /手動鎖屏仍會暫停/);
});
