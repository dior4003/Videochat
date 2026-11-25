# Changelog

## 1.1.0 — xavfsizlik va barqarorlik relizi

### Xavfsizlik (server)
- **Token sizishi tuzatildi:** `mediaUrl` qat'iy `/uploads/<uuid>.<ext>` shaklida tekshiriladi; token endi URL'da yuborilmaydi (rasm — `Authorization` sarlavhasi, fayl — 2 daqiqalik imzolangan havola, WebSocket — 30 soniyalik bir martalik bilet).
- **Server crash (DoS) bartaraf etildi:** barcha async handler'lar xatolarni ushlaydi (Express + WebSocket), kirish ma'lumotlari tekshiriladi, global error handler ichki xatolarni yashiradi.
- **Pre-hijacking himoyasi:** tasdiqlanmagan parolli akkaunt Google orqali egallanganda eski parol o'chiriladi va barcha tokenlar bekor qilinadi.
- **Google kirish:** `GOOGLE_CLIENT_ID` majburiy (bo'lmasa o'chiq), `aud`/`iss` tekshiriladi, so'rovga timeout qo'yildi.
- **Sirlar:** standart `JWT_SECRET`/`MOD_PASSKEY` olib tashlandi; production'da zaif sir bilan server ishga tushmaydi; passkey doimiy vaqtda solishtiriladi.
- **Parollar:** scrypt (async), minimal uzunlik 8, eski PBKDF2 xeshlari kirishda avtomatik yangilanadi.
- **Sessiyalar:** token versiyalash (parol o'zgarganda/ban qilinganda bekor), 7 kunlik muddat, `POST /api/me/password`, `POST /api/me/logout-all`.
- **Maxfiylik:** boshqalarga faqat ommaviy profil (email/telefon/rol yo'q); katalog qidiruvi email bo'yicha emas; presence faqat do'stlarga; qo'ng'iroq qiluvchining email/telefoni yuborilmaydi.
- **Bloklash:** `POST /api/friends/block`, `DELETE /api/friends/block/:peerId`; bloklangan foydalanuvchilar xabar/qo'ng'iroq/typing yubora olmaydi.
- **Moderatsiya:** rollar ierarxiyasi, audit log, ban qilinganda ochiq ulanishlar uziladi, moderator kirishi uchun alohida qattiq rate limit va 1 soatlik token.
- **TURN:** doimiy login/parol ochiq `/api/config` da emas; `/api/ice` orqali (faqat tizimga kirganlarga), `TURN_SECRET` bilan vaqtinchalik credential.
- **Fayl yuklash:** magic-byte tekshiruvi, async yozish, foydalanuvchi kvotasi (200 MB), rate limit, egalik/ruxsat tekshiruvi, yetim fayllarni tozalash, `Content-Disposition`.
- **Sozlamalar:** xavfsizlik sarlavhalari, qat'iy CORS (production), 100 KB JSON limiti (faqat `/api/media` 8 MB), WebSocket `maxPayload`, ulanishlar limiti, heartbeat, graceful shutdown.
- **Rate limit:** xotira tozalanadi, `TRUST_PROXY` qo'llab-quvvatlanadi, akkaunt bo'yicha qulflash, ochiq qidiruvlar cheklangan.

### Xatolar
- Chatlar ro'yxatidagi dublikatlar va bir soniyadagi xabarlar tartibi (`DATETIME(3)` + `ORDER BY created_at, id`).
- Do'stlik so'rovlaridagi race condition (`pair_key UNIQUE`).
- Xabar tarixi sahifalanadi; qidiruvda LIKE belgilari escape qilinadi.
- Server qayta ishga tushganda yarim qolgan qo'ng'iroqlar yopiladi.
- Android: `getUsers` so'rovi URL-encode qilinadi.

### Baza
- Versiyalangan migratsiyalar (`schema_migrations`); xatolar endi yutilmaydi. Production'da `DB_AUTO_CREATE=false`, root emas, minimal huquqli foydalanuvchi.

### Android
- Token `EncryptedSharedPreferences` (Keystore) da; `allowBackup=false`; cleartext faqat debug'da; release'da HTTPS majburiy.
- R8 (`minify` + `shrinkResources`) va `proguard-rules.pro`.
- Release imzolash (v2/v3), versiya — `gradle.properties` / `-PVERSION_NAME`, `-PVERSION_CODE`.
- WebSocket tokeni sarlavhada; ping interval; timeoutlar.

### CI/CD
- `ci.yml`: versiya mosligi, server (sintaksis, testlar, `npm audit`), client typecheck, Android debug.
- `release.yml`: tag bo'yicha imzolangan APK + AAB, imzo tekshiruvi (apksigner), ixtiyoriy sertifikat pinning, SHA256SUMS, Sigstore provenance, GitHub Release.
- `scripts/set-version.js` — yagona versiya manbai; `scripts/generate-keystore.sh`.

### Eslatma (breaking)
- Barcha foydalanuvchilar yangilanishdan keyin qayta kirishi kerak (eski tokenlarda `tv` yo'q).
- Eski clientlar (1.0) yangi serverda `?token=` bilan WebSocket'ga ulana olmaydi — clientlarni yangilang.
