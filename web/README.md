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

## 限制

- 公開靜態網站不應放置 YouTube Data API Key，因此新增歌曲採貼上 YouTube 網址或 Video ID。
- 離開頁面、切到背景，或讓 YouTube 播放器離開可視範圍時會暫停。
- 離線快取只包含 App 外殼；YouTube 影片仍需要網路。
