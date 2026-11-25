#!/usr/bin/env bash
# Android release imzolash kaliti yaratadi va GitHub Secrets uchun qiymatlarni chiqaradi.
# Kalit fayli (*.jks) GITGA QO'SHILMAYDI (.gitignore'da). Uni xavfsiz joyda (parol menejeri / sejf) zaxiralang:
# kalit yo'qolsa Google Play'dagi ilovani yangilab bo'lmaydi.
set -euo pipefail

OUT_DIR="${1:-signing}"
ALIAS="${KEY_ALIAS:-pulselink}"
mkdir -p "$OUT_DIR"
KEYSTORE="$OUT_DIR/pulselink-release.jks"

if [[ -f "$KEYSTORE" ]]; then echo "Xato: $KEYSTORE allaqachon mavjud" >&2; exit 1; fi

read -r -s -p "Keystore paroli (kamida 12 belgi): " STORE_PASS; echo
[[ ${#STORE_PASS} -ge 12 ]] || { echo "Parol juda qisqa" >&2; exit 1; }
read -r -p "Sertifikat egasi (masalan: CN=PulseLink, O=Kompaniya, C=UZ): " DNAME

keytool -genkeypair -v \
  -keystore "$KEYSTORE" -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$STORE_PASS" -keypass "$STORE_PASS" \
  -dname "$DNAME"

echo
echo "=== Sertifikat SHA-256 (ANDROID_CERT_SHA256 sifatida saqlang) ==="
keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" -storepass "$STORE_PASS" | grep -i "SHA256:" | head -1 | sed 's/.*SHA256: *//' | tr -d ':'

echo
echo "=== GitHub: Settings > Secrets and variables > Actions ga quyidagilarni qo'shing ==="
echo "ANDROID_KEYSTORE_BASE64  = (quyidagi fayl mazmuni)  $OUT_DIR/keystore.b64"
base64 -w0 "$KEYSTORE" > "$OUT_DIR/keystore.b64" 2>/dev/null || base64 "$KEYSTORE" | tr -d '\n' > "$OUT_DIR/keystore.b64"
echo "ANDROID_KEYSTORE_PASSWORD = (siz kiritgan parol)"
echo "ANDROID_KEY_ALIAS         = $ALIAS"
echo "ANDROID_KEY_PASSWORD      = (siz kiritgan parol)"
echo
echo "Eslatma: $OUT_DIR/ papkasini gitga commit qilmang va keystore.b64 ni ishlatgach o'chiring."
