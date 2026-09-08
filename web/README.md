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

## 播放 YouTube 或 Spotify

- 貼上 YouTube 單曲網址可加入一首歌曲。
- 貼上公開或不公開的 YouTube／YouTube Music 播放清單網址，會自動匯入成可編輯佇列。
- 貼上 Spotify 單曲、專輯或播放清單網址，會切換為無影片的 Spotify 官方播放卡。
- 在「接下來」頁籤可選歌、排序、刪除或清空佇列；手機使用上移／下移按鈕，桌面可拖曳排序。
- 支援上一首、下一首與不重複的隨機播放歷史。
- 點右上角唱片圖示可切換 7 種黑膠外觀，選擇與佇列會保存在裝置中。
- 換歌時會透過 LRCLIB 自動搜尋歌詞，有同步時間的歌詞會跟著播放進度反白，點擊某行可跳到該時間。
- 播放時預設使用 Screen Wake Lock 保持螢幕亮著，可在播放器下方關閉。

## 限制

- 公開靜態網站不應放置 YouTube Data API Key，因此新增內容採貼上單曲或播放清單網址。
- 私人播放清單、個人推薦與需要登入的 YouTube Music 內容可能無法在嵌入播放器中使用。
- Spotify 完整播放或試聽長度會依 Spotify 登入狀態、帳號類型、瀏覽器與加密媒體支援而定。
- 歌詞來自開放的 LRCLIB 資料庫；查無資料、影片標題不準確或服務暂時不可用時，頁面會顯示可重試的提示。
- 保持亮屏可以避免自動鎖定，但使用者手動鎖屏後，iOS 仍可能暫停網頁播放器。
- 離開頁面、切到背景，或讓 YouTube 播放器離開可視範圍時會暫停。
- 離線快取只包含 App 外殼；YouTube 影片仍需要網路。
