# PulseLink 1.1.0 — React Native (Web, iOS, Android) + Redux Toolkit + MVC

```text
pulselink/
├── server/     Node.js + Express + WebSocket + MySQL/MariaDB (MVC, migratsiyalar)
├── client/     React Native + Expo + Redux Toolkit (Web, iOS, Android)
├── android/    Native Kotlin + Jetpack Compose varianti
├── scripts/    set-version.js, generate-keystore.sh
├── .github/workflows/   ci.yml, release.yml
├── VERSION     yagona versiya manbai
└── CHANGELOG.md
```

## Ishga tushirish

### Server
```bash
cd server
cp .env.example .env     # JWT_SECRET ni to'ldiring:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm install && npm start
npm test
```
Production: `NODE_ENV=production`, `JWT_SECRET` (>=32 belgi), `CORS_ORIGIN`, `TRUST_PROXY` (proxy ortida), `DB_AUTO_CREATE=false`
va **root emas**, minimal huquqli DB foydalanuvchi:
```sql
CREATE DATABASE pulselink CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'pulselink'@'%' IDENTIFIED BY '<kuchli-parol>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON pulselink.* TO 'pulselink'@'%';
```
(CREATE/ALTER/INDEX faqat migratsiyalar uchun; keyin olib tashlash mumkin.) Moderator/admin rolini DB orqali bering:
`UPDATE users SET role='admin' WHERE email='...';` va `MOD_PASSKEY` o'rnating.

### Client
```bash
cd client && npm install && npm run web   # yoki ios / android
```

### Android (lokal)
```bash
cd android
gradle wrapper --gradle-version 8.7      # bir marta (wrapper jar'ini yaratadi; commit qiling)
./gradlew :app:assembleDebug
```

## Versiya boshqaruvi
```bash
node scripts/set-version.js 1.2.0   # VERSION, server, client, app.json, android — hammasi sinxron
node scripts/set-version.js --check # mosligini tekshirish (CI'da avtomatik)
```
`versionCode = MAJOR*10000 + MINOR*100 + PATCH` (1.1.0 → 10100).

## Imzolangan Android release (GitHub Actions)

1. **Kalit yaratish (bir marta):** `./scripts/generate-keystore.sh` — `signing/pulselink-release.jks` yaratadi.
   Faylni parol menejeri/sejfda zaxiralang (yo'qolsa ilovani yangilab bo'lmaydi). Gitga **qo'shmang**.
2. **Secrets** (Settings → Secrets and variables → Actions → *Secrets*):
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
   **Variables:** `SERVER_URL` (https://api.sizning-domen.uz), ixtiyoriy `ANDROID_CERT_SHA256` (sertifikat pinning: boshqa kalit bilan imzolangan build rad etiladi).
3. **Reliz:**
   ```bash
   node scripts/set-version.js 1.1.0 && git commit -am "Release 1.1.0"
   git tag -s v1.1.0 -m "PulseLink 1.1.0"      # imzolangan tag (GPG/SSH)
   git push origin main v1.1.0
   ```
   `release.yml` tag va `VERSION` mosligini tekshiradi, APK+AAB'ni imzolab quradi, `apksigner` bilan tekshiradi,
   `SHA256SUMS.txt` va Sigstore provenance (GitHub Attestations) yaratadi va GitHub Release'ga yuklaydi.
   Tekshirish: `gh attestation verify pulselink-1.1.0.apk -R <owner>/<repo>`.
4. Tavsiya: repo sozlamalarida `main` uchun *Require signed commits* va tag himoyasini (rulesets) yoqing.

## Ma'lum cheklovlar
- Parol bilan ro'yxatdan o'tishda email tasdiqlash (SMTP) hali yo'q — Google orqali tasdiqlangan email bilan to'qnashuvda himoya mexanizmi ishlaydi.
- Web clientda token `localStorage`da (brauzerda xavfsiz saqlash imkoni yo'q); mobil clientlarda Keychain/Keystore.
- Rate limit va WebSocket holati bitta jarayon xotirasida; gorizontal masshtablash uchun Redis kerak.
- `package-lock.json` yaratilmagan — birinchi `npm install` dan keyin commit qiling (CI `npm ci` ga o'tadi).
