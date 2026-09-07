const DEFAULT_TRACKS = [
  { id: "demo-iframe", videoId: "M7lc1UVf-VE", title: "IFrame Player API Demo", artist: "Google for Developers" },
  { id: "demo-bunny", videoId: "aqz-KE-bpKQ", title: "Big Buck Bunny", artist: "Blender Foundation" },
  { id: "demo-zoo", videoId: "jNQXAC9IVRw", title: "Me at the zoo", artist: "jawed" }
];
const VINYL_STYLES = [
  ["classic", "經典黑膠"], ["transparent", "透明煙燻"], ["ivory", "象牙白"],
  ["blue", "午夜藍"], ["red", "寶石紅"], ["marble", "大理石"], ["retro", "復古棕"]
].map(([id, name]) => ({ id, name }));
const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
const STORAGE_KEY = "vinyl-music-player-state-v2";
const els = Object.fromEntries([
  "connection-status", "player-status", "video-frame", "track-title", "track-artist", "queue-position",
  "record", "artwork", "tonearm", "progress", "elapsed", "duration", "play-button",
  "previous-button", "next-button", "shuffle-button", "queue-button", "queue-list", "queue-count",
  "edit-queue-button", "clear-queue-button", "lyrics-tab", "queue-tab", "lyrics-panel", "queue-panel",
  "add-button", "add-dialog", "add-form", "video-url", "video-title", "form-error",
  "install-button", "install-dialog", "style-button", "style-dialog", "style-grid", "toast",
  "keep-awake", "keep-awake-note"
].map(id => [id, document.getElementById(id)]));

const saved = loadSavedState();
let tracks = saved.hasState ? saved.tracks : DEFAULT_TRACKS.map(track => ({ ...track }));
let currentIndex = Math.max(0, tracks.findIndex(track => track.id === saved.currentTrackId));
let shuffleEnabled = saved.shuffleEnabled;
let selectedStyle = VINYL_STYLES.some(style => style.id === saved.vinylStyle) ? saved.vinylStyle : "classic";
let playHistory = tracks[currentIndex] ? [tracks[currentIndex].id] : [];
let historyIndex = playHistory.length - 1;
let remainingTrackIds = tracks.filter((_, index) => index !== currentIndex).map(track => track.id);
let player, deferredInstallPrompt, wakeLock;
let ready = false, playerMostlyVisible = false, pendingPlay = false, isSeeking = false;
let playerState = -1, needleProgress = 0, recordAngle = 0, rotationFrame = 0, lastRotationTime = 0;
let needleCandidate = false, draggingNeedle = false, dragStartProgress = 0, dragStartX = 0, dragStartY = 0;
let queueEditing = false, pendingPlaylistId = null, pendingPlaylistIndex = 0;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

function loadSavedState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const state = JSON.parse(stored || "{}");
    const validTracks = Array.isArray(state.tracks)
      ? state.tracks.filter(track => track && /^[\w-]{11}$/.test(track.videoId) && track.title)
      : [];
    return {
      hasState: stored !== null,
      tracks: validTracks,
      currentTrackId: typeof state.currentTrackId === "string" ? state.currentTrackId : null,
      shuffleEnabled: Boolean(state.shuffleEnabled),
      vinylStyle: typeof state.vinylStyle === "string" ? state.vinylStyle : "classic"
    };
  } catch { return { hasState: false, tracks: [], currentTrackId: null, shuffleEnabled: false, vinylStyle: "classic" }; }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ tracks, currentTrackId: tracks[currentIndex]?.id || null, shuffleEnabled, vinylStyle: selectedStyle }));
}

window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player("youtube-player", {
    width: "100%", height: "100%", videoId: tracks[currentIndex]?.videoId || DEFAULT_TRACKS[0].videoId,
    playerVars: { playsinline: 1, controls: 1, rel: 0, origin: location.origin },
    events: { onReady, onStateChange, onError }
  });
};

function onReady() {
  ready = true;
  setStatus("已就緒", "點播放或移動唱針");
  if (pendingPlaylistId) {
    const method = pendingPlay && playerMostlyVisible ? "loadPlaylist" : "cuePlaylist";
    player[method]({ listType: "playlist", list: pendingPlaylistId, index: pendingPlaylistIndex, startSeconds: 0 });
    if (method === "loadPlaylist") pendingPlay = false;
  } else if (tracks[currentIndex]) player.cueVideoById(tracks[currentIndex].videoId);
  renderAll();
  updateProgress();
}

function onStateChange(event) {
  playerState = event.data;
  if (pendingPlaylistId) hydratePlaylistQueue();
  syncCurrentMetadata();
  if (event.data === YT_STATE.PLAYING) {
    setStatus("播放中", "YouTube 播放中");
    els["play-button"].classList.add("is-playing");
    els["play-button"].setAttribute("aria-label", "暫停");
    if (!draggingNeedle) setNeedle(1, true);
    startRotation(); requestScreenWakeLock();
  } else if (event.data === YT_STATE.BUFFERING) {
    setStatus("緩衝中", "正在載入影片"); stopRotation();
  } else if (event.data === YT_STATE.ENDED) {
    stopRotation(); if (!draggingNeedle) setNeedle(0, true); nextTrack(true);
  } else if (event.data === YT_STATE.PAUSED || event.data === YT_STATE.CUED) {
    setStatus("已暫停", "YouTube 已暫停");
    els["play-button"].classList.remove("is-playing");
    els["play-button"].setAttribute("aria-label", "播放");
    stopRotation(); releaseScreenWakeLock();
    if (!draggingNeedle) setNeedle(0, true);
  }
  updateTransportState();
}

function onError(event) {
  const messages = { 2: "Video ID 無效", 5: "播放器無法載入影片", 100: "影片不存在或已移除", 101: "影片擁有者禁止嵌入", 150: "影片擁有者禁止嵌入", 153: "播放器無法確認網站來源" };
  const message = messages[event.data] || `YouTube 錯誤 ${event.data}`;
  setStatus("無法播放", message); showToast(message); stopRotation(); setNeedle(0, true);
}

function setStatus(shortText, detail) { els["player-status"].textContent = shortText; els["connection-status"].textContent = detail; }
function haptic(duration = 8) { navigator.vibrate?.(duration); }

function requestPlay() {
  if (!tracks.length && !pendingPlaylistId) return;
  if (!ready) { pendingPlay = true; return; }
  if (!playerMostlyVisible) {
    pendingPlay = true;
    els["video-frame"].scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "center" });
    showToast("播放器出現在畫面後會開始播放"); return;
  }
  pendingPlay = false; requestScreenWakeLock(); player.playVideo();
}

function requestPause() { pendingPlay = false; if (ready) player.pauseVideo(); stopRotation(); releaseScreenWakeLock(); }
function togglePlayback() { haptic(); playerState === YT_STATE.PLAYING ? requestPause() : requestPlay(); }

function loadTrack(index, autoplay = false, addToHistory = true) {
  if (!tracks.length) { stopEmptyQueue(); return; }
  currentIndex = Math.max(0, Math.min(index, tracks.length - 1));
  if (shuffleEnabled && addToHistory) recordSelection(tracks[currentIndex].id);
  pendingPlaylistId = null;
  updateTrackDisplay(); setNeedle(0, true); stopRotation(); persistState(); renderQueue(); updateTransportState();
  if (!ready) { pendingPlay = autoplay; return; }
  if (autoplay && playerMostlyVisible) player.loadVideoById(tracks[currentIndex].videoId);
  else { player.cueVideoById(tracks[currentIndex].videoId); pendingPlay = autoplay; }
}

function nextTrack(autoplay = playerState === YT_STATE.PLAYING) {
  if (!tracks.length) return;
  let target = -1;
  if (shuffleEnabled) {
    if (historyIndex + 1 < playHistory.length) {
      historyIndex += 1; target = tracks.findIndex(track => track.id === playHistory[historyIndex]);
    } else {
      if (!remainingTrackIds.length) remainingTrackIds = tracks.filter((_, index) => index !== currentIndex).map(track => track.id);
      if (!remainingTrackIds.length) return;
      const id = remainingTrackIds.splice(Math.floor(Math.random() * remainingTrackIds.length), 1)[0];
      playHistory.push(id); historyIndex = playHistory.length - 1; target = tracks.findIndex(track => track.id === id);
    }
  } else if (currentIndex + 1 < tracks.length) target = currentIndex + 1;
  if (target >= 0) { haptic(); loadTrack(target, autoplay, false); }
}

function previousTrack() {
  if (!tracks.length) return;
  let target = -1;
  if (shuffleEnabled && historyIndex > 0) { historyIndex -= 1; target = tracks.findIndex(track => track.id === playHistory[historyIndex]); }
  else if (!shuffleEnabled && currentIndex > 0) target = currentIndex - 1;
  if (target >= 0) { haptic(); loadTrack(target, playerState === YT_STATE.PLAYING, false); }
}

function toggleShuffle() {
  shuffleEnabled = !shuffleEnabled; resetShuffleHistory(); persistState(); renderShuffleState(); updateTransportState(); haptic(10);
  showToast(shuffleEnabled ? "已開啟隨機播放" : "已關閉隨機播放");
}

function resetShuffleHistory() {
  const id = tracks[currentIndex]?.id;
  playHistory = id ? [id] : []; historyIndex = playHistory.length - 1;
  remainingTrackIds = tracks.filter(track => track.id !== id).map(track => track.id);
}

function recordSelection(id) {
  if (playHistory[historyIndex] === id) return;
  playHistory = playHistory.slice(0, historyIndex + 1); playHistory.push(id); historyIndex = playHistory.length - 1;
  remainingTrackIds = remainingTrackIds.filter(trackId => trackId !== id);
}

function loadYouTubePlaylist(playlistId, autoplay = true) {
  pendingPlaylistId = playlistId; pendingPlaylistIndex = 0; pendingPlay = autoplay;
  els["track-title"].textContent = "正在載入播放清單"; els["track-artist"].textContent = "YouTube";
  els["queue-position"].textContent = "PLAYLIST"; els.artwork.src = "./icons/icon-512.png";
  setStatus("載入中", "正在讀取 YouTube 播放清單");
  if (!ready) return;
  const method = autoplay && playerMostlyVisible ? "loadPlaylist" : "cuePlaylist";
  player[method]({ listType: "playlist", list: playlistId, index: 0, startSeconds: 0 });
  if (method === "loadPlaylist") pendingPlay = false;
}

function hydratePlaylistQueue() {
  if (!ready || !pendingPlaylistId || !player.getPlaylist) return;
  const ids = player.getPlaylist() || []; if (!ids.length) return;
  const reportedIndex = player.getPlaylistIndex?.();
  currentIndex = Number.isInteger(reportedIndex) && reportedIndex >= 0 ? reportedIndex : 0;
  const data = player.getVideoData?.() || {};
  tracks = ids.map((videoId, index) => ({
    id: `playlist-${videoId}-${index}`, videoId,
    title: index === currentIndex && data.title ? data.title : `播放清單曲目 ${index + 1}`,
    artist: index === currentIndex && data.author ? data.author : "YouTube 播放清單"
  }));
  pendingPlaylistId = null; resetShuffleHistory(); updateTrackDisplay(); persistState(); renderQueue(); updateTransportState();
}

function syncCurrentMetadata() {
  if (!ready || !tracks[currentIndex]) return;
  const data = player.getVideoData?.() || {};
  if (!data.video_id || data.video_id !== tracks[currentIndex].videoId) return;
  if (data.title) tracks[currentIndex].title = data.title;
  if (data.author) tracks[currentIndex].artist = data.author;
  updateTrackDisplay(); persistState(); renderQueue();
}

function updateTrackDisplay() {
  const track = tracks[currentIndex];
  if (!track) {
    els["track-title"].textContent = "播放清單是空的";
    els["track-artist"].textContent = "從右上角加入 YouTube 音樂即可開始";
    els["queue-position"].textContent = "EMPTY"; els.artwork.src = "./icons/icon-512.png";
    els.artwork.alt = "Vinyl Music Player 圖標"; document.title = "Vinyl Music Player"; return;
  }
  els["track-title"].textContent = track.title; els["track-artist"].textContent = track.artist;
  els["queue-position"].textContent = `${currentIndex + 1} / ${tracks.length}`;
  els.artwork.src = `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`; els.artwork.alt = `${track.title} 封面`;
  document.title = `${track.title} - Vinyl Music Player`;
}

function setNeedle(value, animate = false) {
  needleProgress = Math.max(0, Math.min(1, value)); els.tonearm.classList.toggle("dragging", !animate);
  els.tonearm.style.setProperty("--needle-progress", needleProgress); els.tonearm.setAttribute("aria-valuenow", needleProgress.toFixed(2));
  els.tonearm.setAttribute("aria-valuetext", needleProgress >= .64 ? "唱片播放位置" : "休息位置");
}

function settleNeedle() {
  const shouldPlay = needleProgress >= .64; setNeedle(shouldPlay ? 1 : 0, true); haptic(10);
  shouldPlay ? requestPlay() : requestPause();
}

function startRotation() {
  if (reduceMotion.matches || rotationFrame) return;
  lastRotationTime = performance.now();
  const tick = now => {
    const elapsed = Math.min(now - lastRotationTime, 50); recordAngle = (recordAngle + elapsed * .045) % 360; lastRotationTime = now;
    els.record.style.setProperty("--record-angle", `${recordAngle}deg`); rotationFrame = requestAnimationFrame(tick);
  };
  rotationFrame = requestAnimationFrame(tick); els.record.setAttribute("aria-label", "目前播放中的黑膠唱片");
}

function stopRotation() { cancelAnimationFrame(rotationFrame); rotationFrame = 0; els.record.setAttribute("aria-label", "目前停止的黑膠唱片"); }

function updateProgress() {
  if (!document.hidden && ready && player.getDuration && !isSeeking) {
    const total = player.getDuration() || 0, current = player.getCurrentTime() || 0;
    els.progress.max = Math.max(total, 1); els.progress.value = current; els.progress.disabled = total <= 0;
    els.elapsed.textContent = formatTime(current); els.duration.textContent = formatTime(total);
    els.progress.setAttribute("aria-valuetext", `${formatTime(current)} / ${formatTime(total)}`);
  }
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function renderAll() { updateTrackDisplay(); renderQueue(); renderShuffleState(); renderStylePicker(); updateTransportState(); }

function renderQueue() {
  els["queue-count"].textContent = `${tracks.length} 首`; els["clear-queue-button"].disabled = tracks.length === 0;
  if (!tracks.length) {
    const empty = document.createElement("li"); empty.className = "queue-empty";
    empty.textContent = "播放清單是空的，請從右上角加入音樂。"; els["queue-list"].replaceChildren(empty); return;
  }
  els["queue-list"].replaceChildren(...tracks.map(createQueueItem));
}

function createQueueItem(track, index) {
  const item = document.createElement("li"); item.dataset.index = index; item.draggable = queueEditing;
  const select = document.createElement("button"); select.className = "queue-track"; select.type = "button";
  select.setAttribute("aria-current", index === currentIndex ? "true" : "false");
  select.innerHTML = `<span class="queue-index"></span><span class="queue-title"><strong></strong><span></span></span><span class="queue-now" aria-label="目前歌曲"></span>`;
  select.querySelector(".queue-index").textContent = String(index + 1).padStart(2, "0");
  select.querySelector("strong").textContent = track.title; select.querySelector(".queue-title span").textContent = track.artist;
  select.querySelector(".queue-now").hidden = index !== currentIndex;
  select.addEventListener("click", () => { if (!queueEditing) { haptic(); loadTrack(index, true); } }); item.append(select);
  if (queueEditing) {
    const controls = document.createElement("div"); controls.className = "queue-edit-controls";
    controls.append(queueAction("上移", "上移", index === 0, () => moveTrack(index, index - 1)), queueAction("下移", "下移", index === tracks.length - 1, () => moveTrack(index, index + 1)), queueAction("刪除", "刪除", false, () => removeTrack(index), true));
    item.append(controls);
    item.addEventListener("dragstart", event => event.dataTransfer.setData("text/plain", String(index)));
    item.addEventListener("dragover", event => event.preventDefault());
    item.addEventListener("drop", event => { event.preventDefault(); const source = Number(event.dataTransfer.getData("text/plain")); if (Number.isInteger(source)) moveTrack(source, index); });
  }
  return item;
}

function queueAction(label, text, disabled, action, danger = false) {
  const button = document.createElement("button"); button.type = "button"; button.className = `queue-action${danger ? " is-danger" : ""}`;
  button.textContent = text; button.setAttribute("aria-label", label); button.disabled = disabled; button.addEventListener("click", action); return button;
}

function moveTrack(from, to) {
  if (from === to || !tracks[from] || to < 0 || to >= tracks.length) return;
  const currentId = tracks[currentIndex]?.id, [moved] = tracks.splice(from, 1); tracks.splice(to, 0, moved);
  currentIndex = Math.max(0, tracks.findIndex(track => track.id === currentId)); reconcileShuffleHistory(); persistState(); renderQueue(); updateTransportState(); haptic(10);
}

function removeTrack(index) {
  if (!tracks[index]) return;
  const currentId = tracks[currentIndex]?.id, removingCurrent = tracks[index].id === currentId;
  const wasPlaying = playerState === YT_STATE.PLAYING || playerState === YT_STATE.BUFFERING;
  tracks.splice(index, 1);
  if (!tracks.length) { currentIndex = 0; stopEmptyQueue(); }
  else if (removingCurrent) { currentIndex = Math.min(index, tracks.length - 1); loadTrack(currentIndex, wasPlaying, false); }
  else { currentIndex = Math.max(0, tracks.findIndex(track => track.id === currentId)); reconcileShuffleHistory(); persistState(); renderAll(); }
  haptic(12);
}

function clearQueue() {
  if (!tracks.length || !confirm("確定要清空播放清單嗎？")) return;
  tracks = []; currentIndex = 0; resetShuffleHistory(); stopEmptyQueue(); haptic(12);
}

function stopEmptyQueue() {
  pendingPlay = false; requestPause(); if (ready) player.stopVideo(); setNeedle(0, true); persistState(); renderAll();
  els.progress.value = 0; els.progress.disabled = true; els.elapsed.textContent = "0:00"; els.duration.textContent = "0:00";
}

function reconcileShuffleHistory() {
  const ids = new Set(tracks.map(track => track.id)); playHistory = playHistory.filter(id => ids.has(id));
  remainingTrackIds = remainingTrackIds.filter(id => ids.has(id)); const currentId = tracks[currentIndex]?.id;
  if (currentId && !playHistory.includes(currentId)) playHistory.push(currentId);
  historyIndex = currentId ? playHistory.lastIndexOf(currentId) : -1;
}

function renderShuffleState() {
  els["shuffle-button"].classList.toggle("is-active", shuffleEnabled); els["shuffle-button"].setAttribute("aria-pressed", String(shuffleEnabled));
  els["shuffle-button"].setAttribute("aria-label", `隨機播放，已${shuffleEnabled ? "開啟" : "關閉"}`);
}

function updateTransportState() {
  const hasTracks = tracks.length > 0; els["play-button"].disabled = !ready || !hasTracks;
  els["previous-button"].disabled = shuffleEnabled ? historyIndex <= 0 : currentIndex <= 0;
  els["next-button"].disabled = shuffleEnabled ? tracks.length <= 1 : !hasTracks || currentIndex >= tracks.length - 1;
}

function showPanel(panel) {
  const queue = panel === "queue"; els["lyrics-panel"].hidden = queue; els["queue-panel"].hidden = !queue;
  els["lyrics-tab"].setAttribute("aria-selected", String(!queue)); els["queue-tab"].setAttribute("aria-selected", String(queue));
  if (queue) els["queue-panel"].scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "nearest" });
}

function toggleQueueEditing() {
  queueEditing = !queueEditing; els["edit-queue-button"].textContent = queueEditing ? "完成" : "編輯";
  els["edit-queue-button"].setAttribute("aria-pressed", String(queueEditing)); renderQueue();
}

function applyVinylStyle(id) { selectedStyle = id; els.record.dataset.style = id; persistState(); renderStylePicker(); haptic(); }

function renderStylePicker() {
  els.record.dataset.style = selectedStyle;
  els["style-grid"].replaceChildren(...VINYL_STYLES.map(style => {
    const button = document.createElement("button"); button.type = "button"; button.className = "style-option"; button.dataset.style = style.id;
    button.setAttribute("aria-pressed", String(style.id === selectedStyle));
    button.innerHTML = `<span class="style-preview" aria-hidden="true"></span><span></span><small></small>`;
    button.children[1].textContent = style.name; button.querySelector("small").textContent = style.id === selectedStyle ? "已選取" : "";
    button.addEventListener("click", () => applyVinylStyle(style.id)); return button;
  }));
}

function parseVideoId(input) {
  const value = input.trim(); if (/^[\w-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value), candidate = url.hostname.includes("youtu.be") ? url.pathname.slice(1).split("/")[0] : url.searchParams.get("v") || url.pathname.match(/\/(?:shorts|embed)\/([\w-]{11})/)?.[1];
    return /^[\w-]{11}$/.test(candidate || "") ? candidate : null;
  } catch { return null; }
}

function parsePlaylistId(input) {
  const value = input.trim(); if (/^(?:PL|OLAK5uy_|RD|UU|LL|FL)[\w-]{8,}$/.test(value)) return value;
  try { const id = new URL(value).searchParams.get("list"); return /^[\w-]{10,}$/.test(id || "") ? id : null; } catch { return null; }
}

async function requestScreenWakeLock() {
  if (!els["keep-awake"].checked || wakeLock || !("wakeLock" in navigator) || document.hidden) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }, { once: true });
    els["keep-awake-note"].textContent = "播放期間會避免 iPhone 自動鎖定。";
  } catch { els["keep-awake-note"].textContent = "瀏覽器未允許保持亮屏，請確認頁面位於前景。"; }
}

async function releaseScreenWakeLock() {
  if (!wakeLock) return; const lock = wakeLock; wakeLock = null;
  try { await lock.release(); } catch { /* Browser may have released it. */ }
  els["keep-awake-note"].textContent = "避免 iPhone 自動鎖定，手動鎖屏仍會暫停。";
}

function showToast(message) {
  els.toast.textContent = message; els.toast.classList.add("visible"); clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("visible"), 2600);
}

els["play-button"].addEventListener("click", togglePlayback);
els["previous-button"].addEventListener("click", previousTrack);
els["next-button"].addEventListener("click", () => nextTrack());
els["shuffle-button"].addEventListener("click", toggleShuffle);
els["queue-button"].addEventListener("click", () => showPanel("queue"));
els["lyrics-tab"].addEventListener("click", () => showPanel("lyrics"));
els["queue-tab"].addEventListener("click", () => showPanel("queue"));
els["edit-queue-button"].addEventListener("click", toggleQueueEditing);
els["clear-queue-button"].addEventListener("click", clearQueue);
els["style-button"].addEventListener("click", () => { if (!els["style-dialog"].open) els["style-dialog"].show(); });
els["style-dialog"].addEventListener("close", () => els["style-button"].focus());
els["add-button"].addEventListener("click", () => { requestPause(); els["form-error"].textContent = ""; els["add-dialog"].showModal(); });
els["add-form"].addEventListener("submit", event => {
  if (event.submitter?.value !== "default") return; event.preventDefault();
  const playlistId = parsePlaylistId(els["video-url"].value);
  if (playlistId) { els["add-dialog"].close(); els["add-form"].reset(); loadYouTubePlaylist(playlistId, true); return; }
  const videoId = parseVideoId(els["video-url"].value);
  if (!videoId) { els["form-error"].textContent = "請輸入有效的 YouTube 單曲或播放清單網址。"; return; }
  tracks.push({ id: globalThis.crypto?.randomUUID?.() || `track-${Date.now()}`, videoId, title: els["video-title"].value.trim() || "YouTube 影片", artist: "YouTube" });
  els["add-dialog"].close(); els["add-form"].reset(); loadTrack(tracks.length - 1, true);
});

els.progress.addEventListener("pointerdown", () => { isSeeking = true; });
els.progress.addEventListener("input", () => { els.elapsed.textContent = formatTime(Number(els.progress.value)); });
els.progress.addEventListener("change", () => { if (ready) player.seekTo(Number(els.progress.value), true); isSeeking = false; });

els.tonearm.addEventListener("pointerdown", event => {
  needleCandidate = true; draggingNeedle = false; dragStartProgress = needleProgress; dragStartX = event.clientX; dragStartY = event.clientY;
  els.tonearm.setPointerCapture(event.pointerId);
});
els.tonearm.addEventListener("pointermove", event => {
  if (!needleCandidate) return;
  const dx = event.clientX - dragStartX, dy = event.clientY - dragStartY;
  if (!draggingNeedle) {
    if (Math.hypot(dx, dy) < 12 || Math.abs(dx) <= Math.abs(dy) * .8) return;
    draggingNeedle = true; els.tonearm.classList.add("dragging");
  }
  event.preventDefault(); setNeedle(dragStartProgress - dx / 70);
});
function finishTonearmPointer() {
  const didDrag = draggingNeedle; needleCandidate = false; draggingNeedle = false; els.tonearm.classList.remove("dragging");
  if (didDrag) settleNeedle();
}
els.tonearm.addEventListener("pointerup", finishTonearmPointer);
els.tonearm.addEventListener("pointercancel", finishTonearmPointer);
els.tonearm.addEventListener("keydown", event => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault(); setNeedle(event.key === "ArrowLeft" || event.key === "End" ? 1 : 0, true); settleNeedle();
});

new IntersectionObserver(entries => {
  const wasVisible = playerMostlyVisible; playerMostlyVisible = entries[0].intersectionRatio >= .5;
  if (wasVisible && !playerMostlyVisible && playerState === YT_STATE.PLAYING) {
    pendingPlay = true; player.pauseVideo(); showToast("播放器離開畫面，已暫停播放");
  } else if (playerMostlyVisible && pendingPlay) requestPlay();
}, { threshold: [.5] }).observe(els["video-frame"]);

document.addEventListener("visibilitychange", () => { if (document.hidden) requestPause(); });
els["keep-awake"].addEventListener("change", () => els["keep-awake"].checked && playerState === YT_STATE.PLAYING ? requestScreenWakeLock() : releaseScreenWakeLock());
reduceMotion.addEventListener("change", () => reduceMotion.matches ? stopRotation() : playerState === YT_STATE.PLAYING && startRotation());
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; });
els["install-button"].addEventListener("click", async () => {
  if (deferredInstallPrompt) { deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; }
  else { requestPause(); els["install-dialog"].showModal(); }
});

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
if (!("wakeLock" in navigator)) {
  els["keep-awake"].disabled = true; els["keep-awake"].checked = false; els["keep-awake"].closest("label").classList.add("is-unsupported");
  els["keep-awake-note"].textContent = "此版本的瀏覽器不支援保持亮屏。";
}
renderAll(); setInterval(updateProgress, 500);
const youtubeAPI = document.createElement("script"); youtubeAPI.src = "https://www.youtube.com/iframe_api";
youtubeAPI.onerror = () => setStatus("無法連線", "請檢查網路後重新整理頁面"); document.head.append(youtubeAPI);
