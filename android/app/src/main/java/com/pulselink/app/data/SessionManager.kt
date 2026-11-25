package com.pulselink.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.pulselink.app.BuildConfig

/**
 * Sessiya ma'lumotlari Android Keystore bilan shifrlangan EncryptedSharedPreferences'da saqlanadi.
 * (v1.0 da token ochiq SharedPreferences'da edi.)
 */
class SessionManager(context: Context) {
    private val prefs: SharedPreferences = createPrefs(context)

    init {
        // Eski (shifrlanmagan) v1.0 faylini butunlay o'chiramiz
        runCatching { context.deleteSharedPreferences("pulselink_prefs") }
    }

    var token: String
        get() = prefs.getString("token", "") ?: ""
        set(value) = prefs.edit().putString("token", value).apply()

    var serverUrl: String
        get() = prefs.getString("server_url", BuildConfig.DEFAULT_SERVER_URL) ?: BuildConfig.DEFAULT_SERVER_URL
        set(value) {
            val clean = value.trim().trimEnd('/')
            // Release build'da HTTP manzil saqlanmaydi
            if (!BuildConfig.DEBUG && !clean.startsWith("https://")) return
            prefs.edit().putString("server_url", clean).apply()
        }

    var darkTheme: Boolean
        get() = prefs.getBoolean("dark_theme", true)
        set(value) = prefs.edit().putBoolean("dark_theme", value).apply()

    var devMode: Boolean
        get() = prefs.getBoolean("dev_mode", false)
        set(value) = prefs.edit().putBoolean("dev_mode", value).apply()

    fun clearAuth() {
        prefs.edit().remove("token").apply()
    }

    private companion object {
        const val FILE = "pulselink_secure_prefs"

        fun createPrefs(context: Context): SharedPreferences {
            fun build(): SharedPreferences {
                val masterKey = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
                return EncryptedSharedPreferences.create(
                    FILE,
                    masterKey,
                    context,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            }
            return try {
                build()
            } catch (e: Exception) {
                // Keystore buzilgan/tiklangan qurilmada: faylni tozalab qayta yaratamiz (foydalanuvchi qayta kiradi)
                context.deleteSharedPreferences(FILE)
                build()
            }
        }
    }
}
