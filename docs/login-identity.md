# 登入 ID、暱稱與註冊密令

v02.01.000 將登入身分與公開名稱分開。資料仍以既有帳號 UUID 關聯，沒有因改名建立新帳號，也不更換密碼或權限。

- **登入 ID**：4–64 位，可使用英文字母、數字及中間的空格。保留原大小寫，登入和唯一性檢查不分大小寫；去除前後空白。註冊後不可修改，僅在自己的個人設定中顯示。
- **暱稱**：1–32 個 Unicode 字元，可重名，在個人設定中隨時修改。拒絕控制字元與隱藏格式字元；畫面以文字顯示，不當作 HTML 或指令執行。
- **密碼**：沿用原有密碼及雜湊。登入、修改密碼仍指向原有 Auth UUID 與內部驗證地址，不以可變暱稱推導驗證地址。
- **排行榜與公開名稱**：使用暱稱。成績、頭像及 tester 的本人篩選均依 UUID 對應，不因暱稱重名、改名而混用資料。管理帳號清單不返回其他人的登入 ID。

## 先綁定 ID，再生成密令

管理員生成密令前需填寫全新 ID。一份密令只對應一個 ID、只能註冊一次；註冊時需輸入相同 ID、公開暱稱、密碼與密令。既有帳號 ID 及已有有效密令的 ID 不能再綁定另一份密令。

撤銷或過期後，該密令不能用來啟用 ID。未註冊的 ID 可重新綁定新密令；舊密令仍然無效。已註冊帳號的登入權限由帳號管理控制，撤銷已使用的密令不會停用該帳號。

唯一性、預約、註冊完成與撤銷由資料庫事務、唯一約束及相同 ID 的鎖保護。註冊失敗僅釋放該次請求自己的預約令牌，不會釋放其他請求的預約。已預約但尚未完成註冊時若密令被撤銷或過期，完成註冊也會被拒絕。

## 既有安裝的遷移

結構遷移不包含真實帳號或 ID 對照。既有資料先取得通用的 `legacy` 加 UUID 形式 ID；部署者應在同一個資料庫事務中套用私人對照，驗證每個帳號的 UUID、權限、密碼及資料歸屬後提交。受限的一次性遷移開關只允許資料庫操作員使用，API 的 service_role 無法修改 ID。

舊版未綁定 ID 的密令會作廢，需在新版重新生成。公開示範安裝仍為明確 opt-in、僅限空資料庫的 primary admin/primary admin、secondary admin/secondary admin、user/user、tester/tester；這些示範帳號不加入正式網站。舊的暱稱登入請求沒有相容別名。

參考：[Supabase getUserById](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid)、[PostgreSQL 鎖定](https://www.postgresql.org/docs/current/explicit-locking.html)、[PostgreSQL 唯一索引](https://www.postgresql.org/docs/current/indexes-unique.html)。
