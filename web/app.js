const tracks = [
  { videoId: "M7lc1UVf-VE", title: "IFrame Player API Demo", artist: "Google for Developers" },
  { videoId: "aqz-KE-bpKQ", title: "Big Buck Bunny", artist: "Blender Foundation" },
  { videoId: "jNQXAC9IVRw", title: "Me at the zoo", artist: "jawed" }
];
const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

const els = Object.fromEntries([
  "connection-status", "player-status", "video-frame", "track-title", "track-artist", "queue-position",
  "record", "artwork", "tonearm", "progress", "elapsed", "duration", "play-button",
  "previous-button", "next-button", "queue-list", "queue-count", "add-button", "add-dialog",
  "add-form", "video-url", "video-title", "form-error", "install-button", "install-dialog", "toast"
].map(id => [id, document.getElementById(id)]));

let player;
let ready = false;
let currentIndex = 0;
let playerState = -1;
let playerMostlyVisible = false;
let pendingPlay = false;
let isSeeking = false;
let needleProgress = 0;
let draggingNeedle = false;
let dragStartProgress = 0;
let dragStartX = 0;
let recordAngle = 0;
let rotationFrame = 0;
let lastRotationTime = 0;
let deferredInstallPrompt;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player("youtube-player", {
    width: "100%",
    height: "100%",
    videoId: tracks[0].videoId,
    playerVars: { playsinline: 1, controls: 1, rel: 0, origin: location.origin },
    events: { onReady, onStateChange, onError }
  });
};

function onReady() {
  ready = true;
  els["play-button"].disabled = false;
  setStatus("已就緒", "點播放或移動唱針");
  renderQueue();
  updateProgress();
  const track = tracks[currentIndex];
  if (pendingPlay && playerMostlyVisible) {
    pendingPlay = false;
    player.loadVideoById(track.videoId);
  } else {
    player.cueVideoById(track.videoId);
  }
}

function onStateChange(event) {
  playerState = event.data;
  if (event.data === YT_STATE.PLAYING) {
    setStatus("播放中", "YouTube 播放中");
    els["play-button"].classList.add("is-playing");
    els["play-button"].setAttribute("aria-label", "暫停");
    if (!draggingNeedle) setNeedle(1, true);
    startRotation();
  } else if (event.data === YT_STATE.BUFFERING) {
    setStatus("緩衝中", "正在載入影片");
    stopRotation();
  } else if (event.data === YT_STATE.ENDED) {
    stopRotation();
    if (!draggingNeedle) setNeedle(0, true);
    nextTrack(true);
  } else if (event.data === YT_STATE.PAUSED || event.data === YT_STATE.CUED) {
    setStatus("已暫停", "YouTube 已暫停");
    els["play-button"].classList.remove("is-playing");
    els["play-button"].setAttribute("aria-label", "播放");
    stopRotation();
    if (!draggingNeedle) setNeedle(0, true);
  }
}

function onError(event) {
  const messages = { 2: "Video ID 無效", 5: "播放器無法載入影片", 100: "影片不存在或已移除", 101: "影片擁有者禁止嵌入", 150: "影片擁有者禁止嵌入", 153: "播放器無法確認網站來源" };
  setStatus("無法播放", messages[event.data] || `YouTube 錯誤 ${event.data}`);
  showToast(messages[event.data] || "這部影片目前無法播放");
  stopRotation();
  setNeedle(0, true);
}

function setStatus(shortText, detail) {
  els["player-status"].textContent = shortText;
  els["connection-status"].textContent = detail;
}

function requestPlay() {
  if (!ready) { pendingPlay = true; return; }
  if (!playerMostlyVisible) {
    pendingPlay = true;
    els["video-frame"].scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "center" });
    showToast("播放器出現在畫面後會開始播放");
    return;
  }
  pendingPlay = false;
  player.playVideo();
}

function requestPause() {
  pendingPlay = false;
  if (ready) player.pauseVideo();
  stopRotation();
}

function togglePlayback() {
  playerState === YT_STATE.PLAYING ? requestPause() : requestPlay();
}

function loadTrack(index, autoplay = false) {
  currentIndex = (index + tracks.length) % tracks.length;
  const track = tracks[currentIndex];
  els["track-title"].textContent = track.title;
  els["track-artist"].textContent = track.artist;
  els["queue-position"].textContent = `${currentIndex + 1} / ${tracks.length}`;
  els.artwork.src = `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`;
  els.artwork.alt = `${track.title} 封面`;
  document.title = `${track.title} — Vinyl Music Player`;
  setNeedle(0, true);
  stopRotation();
  renderQueue();
  if (!ready) { pendingPlay = autoplay; return; }
  if (autoplay && playerMostlyVisible) player.loadVideoById(track.videoId);
  else {
    player.cueVideoById(track.videoId);
    pendingPlay = autoplay;
    if (autoplay) showToast("播放器回到畫面後會播放下一首");
  }
}

function nextTrack(autoplay = playerState === YT_STATE.PLAYING) { loadTrack(currentIndex + 1, autoplay); }
function previousTrack() { loadTrack(currentIndex - 1, playerState === YT_STATE.PLAYING); }

function setNeedle(value, animate = false) {
  needleProgress = Math.max(0, Math.min(1, value));
  if (!animate) els.tonearm.classList.add("dragging");
  else els.tonearm.classList.remove("dragging");
  els.tonearm.style.setProperty("--needle-progress", needleProgress);
  els.tonearm.setAttribute("aria-valuenow", needleProgress.toFixed(2));
  els.tonearm.setAttribute("aria-valuetext", needleProgress >= .64 ? "唱片播放位置" : "休息位置");
}

function settleNeedle() {
  const shouldPlay = needleProgress >= .64;
  setNeedle(shouldPlay ? 1 : 0, true);
  navigator.vibrate?.(10);
  shouldPlay ? requestPlay() : requestPause();
}

function startRotation() {
  if (reduceMotion.matches || rotationFrame) return;
  lastRotationTime = performance.now();
  const tick = now => {
    const elapsed = Math.min(now - lastRotationTime, 50);
    recordAngle = (recordAngle + elapsed * .045) % 360;
    lastRotationTime = now;
    els.record.style.setProperty("--record-angle", `${recordAngle}deg`);
    rotationFrame = requestAnimationFrame(tick);
  };
  rotationFrame = requestAnimationFrame(tick);
  els.record.setAttribute("aria-label", "目前播放中的黑膠唱片");
}

function stopRotation() {
  cancelAnimationFrame(rotationFrame);
  rotationFrame = 0;
  els.record.setAttribute("aria-label", "目前停止的黑膠唱片");
}

function updateProgress() {
  if (!document.hidden && ready && player.getDuration && !isSeeking) {
    const duration = player.getDuration() || 0;
    const current = player.getCurrentTime() || 0;
    els.progress.max = Math.max(duration, 1);
    els.progress.value = current;
    els.progress.disabled = duration <= 0;
    els.elapsed.textContent = formatTime(current);
    els.duration.textContent = formatTime(duration);
    els.progress.setAttribute("aria-valuetext", `${formatTime(current)} / ${formatTime(duration)}`);
  }
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function renderQueue() {
  els["queue-count"].textContent = `${tracks.length} 首`;
  els["queue-list"].replaceChildren(...tracks.map((track, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-current", index === currentIndex ? "true" : "false");
    button.innerHTML = `<span class="queue-index">${String(index + 1).padStart(2, "0")}</span><span class="queue-title"><strong></strong><span></span></span>${index === currentIndex ? '<span class="queue-now" aria-label="目前歌曲"></span>' : '<span></span>'}`;
    button.querySelector("strong").textContent = track.title;
    button.querySelector(".queue-title span").textContent = track.artist;
    button.addEventListener("click", () => loadTrack(index, true));
    item.append(button);
    return item;
  }));
}

function parseVideoId(input) {
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const candidate = url.hostname.includes("youtu.be") ? url.pathname.slice(1).split("/")[0]
      : url.searchParams.get("v") || url.pathname.match(/\/(?:shorts|embed)\/([\w-]{11})/)?.[1];
    return /^[\w-]{11}$/.test(candidate || "") ? candidate : null;
  } catch { return null; }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("visible"), 2600);
}

els["play-button"].addEventListener("click", togglePlayback);
els["previous-button"].addEventListener("click", previousTrack);
els["next-button"].addEventListener("click", () => nextTrack());
els["add-button"].addEventListener("click", () => {
  requestPause();
  els["form-error"].textContent = "";
  els["add-dialog"].showModal();
});
els["add-form"].addEventListener("submit", event => {
  if (event.submitter?.value !== "default") return;
  event.preventDefault();
  const videoId = parseVideoId(els["video-url"].value);
  if (!videoId) { els["form-error"].textContent = "請輸入有效的 YouTube 網址或 11 碼 Video ID。"; return; }
  tracks.push({ videoId, title: els["video-title"].value.trim() || "YouTube 影片", artist: "YouTube" });
  els["add-dialog"].close();
  els["add-form"].reset();
  loadTrack(tracks.length - 1, true);
});

els.progress.addEventListener("pointerdown", () => { isSeeking = true; });
els.progress.addEventListener("input", () => { els.elapsed.textContent = formatTime(Number(els.progress.value)); });
els.progress.addEventListener("change", () => { if (ready) player.seekTo(Number(els.progress.value), true); isSeeking = false; });

els.tonearm.addEventListener("pointerdown", event => {
  draggingNeedle = true;
  dragStartProgress = needleProgress;
  dragStartX = event.clientX;
  els.tonearm.setPointerCapture(event.pointerId);
  els.tonearm.classList.add("dragging");
});
els.tonearm.addEventListener("pointermove", event => {
  if (!draggingNeedle) return;
  setNeedle(dragStartProgress + (dragStartX - event.clientX) / 70);
  if (needleProgress >= .72 && playerState !== YT_STATE.PLAYING) requestPlay();
  if (needleProgress <= .55 && playerState === YT_STATE.PLAYING) requestPause();
});
els.tonearm.addEventListener("pointerup", () => { draggingNeedle = false; settleNeedle(); });
els.tonearm.addEventListener("pointercancel", () => { draggingNeedle = false; settleNeedle(); });
els.tonearm.addEventListener("keydown", event => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const play = event.key === "ArrowLeft" || event.key === "End";
  setNeedle(play ? 1 : 0, true);
  settleNeedle();
});

new IntersectionObserver(entries => {
  const wasVisible = playerMostlyVisible;
  playerMostlyVisible = entries[0].intersectionRatio >= .5;
  if (wasVisible && !playerMostlyVisible && playerState === YT_STATE.PLAYING) {
    pendingPlay = true;
    player.pauseVideo();
    showToast("播放器離開畫面，已暫停播放");
  } else if (playerMostlyVisible && pendingPlay) requestPlay();
}, { threshold: [.5] }).observe(els["video-frame"]);

document.addEventListener("visibilitychange", () => { if (document.hidden) requestPause(); });
reduceMotion.addEventListener("change", () => { if (reduceMotion.matches) stopRotation(); else if (playerState === YT_STATE.PLAYING) startRotation(); });
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; });
els["install-button"].addEventListener("click", async () => {
  if (deferredInstallPrompt) { deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; }
  else {
    requestPause();
    els["install-dialog"].showModal();
  }
});

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
renderQueue();
setInterval(updateProgress, 500);

const youtubeAPI = document.createElement("script");
youtubeAPI.src = "https://www.youtube.com/iframe_api";
youtubeAPI.onerror = () => setStatus("無法連線", "請檢查網路後重新整理頁面");
document.head.append(youtubeAPI);
