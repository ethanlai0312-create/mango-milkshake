# Mango Study · 芒果學社

目前版本：**v02.01.000**。版本與發布規則見 [RELEASE_POLICY.md](RELEASE_POLICY.md)，更新紀錄見 [CHANGELOG.md](CHANGELOG.md)。

React、TypeScript、Vite 與 Supabase 的線上複習及試卷平台。公開網站功能原始碼，採 MIT 授權；第三方依賴保留各自授權。

## 公開示範帳號

| 權限 | 登入 ID | 密碼 |
| --- | --- | --- |
| admin | admin | admin |
| user | user | user |
| tester | tester | tester |

以上是刻意公開的示範憑證，僅供全新隔離的示範部署，並非原網站帳號。倉庫不含原網站的使用者、密碼雜湊、試卷、答卷、成績、日誌、上傳檔案或備份。

使用可選的 supabase/demo-accounts.sql 建立這三組帳號，密碼以 bcrypt 儲存。初始化要求資料庫為空，並要求在同一個 psql 會話先執行 SET mango.allow_demo_seed = 'yes';。示範檔放在 migrations 以外，遷移和 CI 不會自動啟用公開憑證。正式部署應自行建立獨立強密碼帳號。

## 管理員雙重驗證器

可使用 **Google Authenticator（Google 身份驗證器）**：

- Android：[Google Play 官方下載](https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2)
- iPhone / iPad：[App Store 官方下載](https://apps.apple.com/app/google-authenticator/id388497605)
- [本網站綁定與使用教學](docs/admin-mfa.md)

支援不登入 Google 帳號使用；請在本網站綁定基於時間的驗證器，再輸入應用程式顯示的六位數字。

## 登入 ID 與公開暱稱

使用固定 ID 和密碼登入，公開位置只顯示可修改的暱稱。ID 至少4位、不分大小寫查重，僅在自己的設定中只讀顯示。生成註冊密令前需預留全新 ID，每份密令一次註冊；撤銷或過期的未註冊 ID 可重新綁定，舊密令保持無效。資料、頭像和排名依 UUID 關聯，暱稱重名不混用資料。[部署與遷移說明](docs/login-identity.md)。

## 功能

試卷建立、編輯、JSON/CSV 匯入匯出、預覽、審核、版本與回收站；多種題型、計時、自動保存、本機草稿、評分及人工批改；幾何工具、初始圖形、參考作圖和步驟回放；頭像、設定、排行榜和在線狀態；共享檔案、續傳及私人文件轉換；帳號管理、註冊密令、操作日誌、管理員雙重驗證；響應式介面、鍵盤操作、減少動態效果及離線快取。

## v2 安全與部署

[完整安全更新與部署說明](docs/security-v2.md)。v2 使用同源 HttpOnly Cookie 網關，前端 URL 設為 /backend，不能直接連到公開 GoTrue。管理員首次使用需綁定 TOTP，此後每次登入均需驗證。更新後需重新登入，原草稿保留。

## 前端啟動

1. 安裝 Node.js 24 與 pnpm 11.25。
2. 執行 pnpm install --frozen-lockfile。
3. 複製 .env.example 為 .env.local，填入自己的後端 URL 與公開客戶端金鑰。管理金鑰不可放入前端。
4. 先啟動本機網關（預設127.0.0.1:5178），再執行 pnpm dev；pnpm exec tsc -b 檢查型別；pnpm build 建置正式靜態檔案。

登入、保存、評分和權限判斷需要後端。請建立自己的全新 Supabase 或自託管相容環境，依序套用 supabase/migrations，再部署 supabase/functions/api。遷移只含結構、函式、權限及必要系統預設，沒有業務資料。API 依賴後端執行環境金鑰，部署者自行提供。

初始管理員保留名稱為 admin。一般使用者的資料庫角色值目前沿用 visitor，介面顯示 user；admin 仍為管理員。tester 繼承 user 的個人功能，可測試自己的出題、答題、頭像與私人文件；額外提供使用示例資料的管理頁面測試入口。禁止存取他人私人資料及執行管理操作；排行榜只顯示自己的實際記錄。詳見 [權限說明](docs/permissions.md)。admin 可在帳號管理將非 admin 帳號切換為 user/tester，需驗證器確認，切換後目標需重新登入。

## 自託管與轉換器

部署者可使用 deploy/local-server 的入口、瀏覽器策略、流量預算和上傳授權模組。複製 lan-config.example.json 為本機 lan-config.json，調整路徑、允許主機及後端入口後執行 node deploy/local-server/lan-gateway.mjs。入口保留 Windows/WSL 磁碟檢查，其他平台需調整該檢查；study.example.com 是範例域名。憑證、通道與私人設定自行配置。

services/converter 包含轉換器及隔離程式。由專案根目錄以 services/converter/Dockerfile.service 建置服務，自行設定 MANGO_API 為 HTTPS API 位址和私人的 MANGO_WORKER_TOKEN。API 新密碼檢查已使用本機政策，不再呼叫外洩密碼雲端查詢；保留的相容 helper 不會在登入或改密時呼叫。本倉庫不帶原環境的私人部署 adapter。

## 發布邊界

只發布功能程式碼、資料庫結構、設定範本、授權與文件。未帶入原 Git 開發歷史、環境檔、測試資料、執行紀錄、帳號、試卷、答卷、排行榜資料、上傳內容、資料庫備份、TLS 私鑰或通道憑證。除上方明確公開的示範憑證外，勿提交實際帳號、金鑰或業務內容。
