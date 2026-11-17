# v02.00.000 自託管安全更新

本版本改為同源 Cookie BFF：前端必須經 deploy/local-server/lan-gateway.mjs 訪問後端，VITE_SUPABASE_URL 使用 /backend。不能把前端直接指向公開 GoTrue 或只部署靜態 Pages 來取代網關。

## 會話與管理員

- 瀏覽器只保存隨機不透明的 HttpOnly、Secure、SameSite=Strict、Host-only Cookie。access/refresh token 僅留在本機網關記憶體，不返回前端、localStorage 或 sessionStorage。
- 網關重啟後需重新登入；舊版 localStorage 憑證不自動遷移，首次更新需重新登入。原離線草稿保留；斷網後重新載入不會用舊資料恢復權限。
- 登入、改密和 MFA 驗證僅在各自固定的可信回應位置採用令牌。題目、答案或其他業務物件中的同名欄位不會變更會話。
- JSON 寫入需要同源自訂標頭，並驗證 Origin / Fetch Metadata；Cookie 不能取代 CSRF 防護。簽名上傳仍使用短期、用途綁定的文件授權，並非登入令牌。
- 管理員每次密碼登入後均需要 TOTP；零驗證器帳號只能先綁定驗證器，不能進入業務操作。敏感管理操作仍需要新的單次確認。
- 伺服器維持 60 分鐘無操作到期；背景心跳和刷新不延長此期限。更換權限、停用和撤銷會話由後端檢查。

## 登入與入口

- 多維限流包含整體、IP、裝置提示及 IP/帳號組合；429 含 Retry-After。帳號的全域失敗記錄採有限退避，不讓遠端失敗嘗試單獨鎖死正確登入。
- 不存在帳號執行 service_role-only dummy bcrypt，不建立虛構帳號；失敗回應採相同最低時間區間。這是降低時序訊號，不承諾所有負載下完全等時。
- 有效密令檢查先於註冊 ID 與密碼政策；無效密令不回傳名稱是否存在。
- 新密碼採本機政策（至少12字元，字母和數字，最多72個UTF-8位元組），不傳送摘要到外部查詢服務。既有密碼不由程式自動更換。
- 公開 HTTP GET/HEAD 轉 HTTPS；HTTP 寫入直接拒絕，避免重播含密碼的 POST。直接 loopback HTTP 僅供本機測試。HSTS 為一年且 includeSubDomains；沒有自行提交瀏覽器永久 preload 名單。
- 公開 bootstrap 關閉；worker 僅接受獨立長隨機 mw_ 憑證，由後端驗證，不接受匿名或 GitHub OIDC 繞行。
- JWT issuer 不返回瀏覽器，因此不必為隱藏內網地址改動既有 Auth issuer 並破壞所有內部消費者。配置回應只顯示轉換器是否已配置，不顯示內網地址。

## 瀏覽器策略與邊界

- 強制 Trusted Types，只允許 DOMPurify 與固定同源 Service Worker URL 的窄範圍 policy；沒有允許任意 HTML 的 default policy。富文字、公式與畫圖依賴實際回歸確認。
- 保留 style-src unsafe-inline：幾何工具、動態座標、動畫和公式排版需要受控行內樣式。這不允許行內腳本；不能把刪除此項當作不需改造即可安全套用的開關。
- HTML shell 使用 no-transform 防止邊緣自動注入統計腳本；API 私人回應仍為 no-store。版本號是公開發布識別，不視為機密。
- security.txt 及 SECURITY.md 指向此倉庫的私密漏洞報告；部署到其他倉庫或域名時，修改 Contact/Canonical，確認私密回報已啟用。

不使用短信、語音、付費 WAF、付費監控或新增外部驗證服務。不承諾單機和免費入口能阻止所有大規模 DDoS，也不宣稱消除全部已知/未知漏洞。實際密碼輪換及第二部驗證器由帳號持有人操作。

參考：[OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)、[OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)、[Supabase Server-side Auth](https://supabase.com/docs/guides/auth/server-side/advanced-guide)、[Cloudflare Analytics](https://developers.cloudflare.com/web-analytics/get-started/)、[RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html)。
