# Vinyl Music Player Web

這是可直接部署到 GitHub Pages 的靜態 PWA，不需要建置工具、套件或 API Key。

## 本機預覽

請用 HTTP server 開啟，Service Worker 不能從 `file://` 執行：

```sh
cd web
python -m http.server 8080
```

開啟 `http://localhost:8080`。

## 安裝成桌面／主畫面書籤

- iPhone／iPad Safari：分享 → 加入主畫面。
- Android Chrome：選單 → 安裝應用程式。
- 桌面 Chrome／Edge：網址列的安裝圖示或選單 → 安裝應用程式。

## 播放單曲或播放清單

- 貼上 YouTube 單曲網址可加入一首歌曲。
- 貼上公開或不公開的 YouTube／YouTube Music 播放清單網址，可由官方嵌入播放器接續播放整份清單。
- 播放時預設使用 Screen Wake Lock 保持螢幕亮著，可在播放器下方關閉。

## 限制

- 公開靜態網站不應放置 YouTube Data API Key，因此新增內容採貼上單曲或播放清單網址。
- 私人播放清單、個人推薦與需要登入的 YouTube Music 內容可能無法在嵌入播放器中使用。
- 保持亮屏可以避免自動鎖定，但使用者手動鎖屏後，iOS 仍可能暫停網頁播放器。
- 離開頁面、切到背景，或讓 YouTube 播放器離開可視範圍時會暫停。
- 離線快取只包含 App 外殼；YouTube 影片仍需要網路。
