# --- WebRTC (JNI orqali chaqiriladi, nomlari saqlanishi shart) ---
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# --- OkHttp / Okio ---
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# --- AndroidX Security (Tink) ---
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
-keep class com.google.crypto.tink.** { *; }

# --- Credential Manager / Google ID ---
-keep class com.google.android.libraries.identity.googleid.** { *; }

# Stack trace'lar uchun
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
