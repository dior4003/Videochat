plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun prop(name: String): String? =
    (System.getenv(name)?.takeIf { it.isNotBlank() }) ?: (findProperty(name) as String?)?.takeIf { it.isNotBlank() }

val appVersionName = prop("VERSION_NAME") ?: "1.1.0"
val appVersionCode = prop("VERSION_CODE")?.toInt() ?: 10100
val releaseServerUrl = prop("SERVER_URL") ?: "https://api.pulselink.example"

// Imzolash ma'lumotlari faqat muhit o'zgaruvchilari/Gradle propertylardan olinadi (kodda/gitda saqlanmaydi)
val keystorePath = prop("ANDROID_KEYSTORE_PATH")
val hasKeystore = keystorePath != null && file(keystorePath).exists()

android {
    namespace = "com.pulselink.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.pulselink.app"
        minSdk = 24
        targetSdk = 34
        versionCode = appVersionCode
        versionName = appVersionName
    }

    signingConfigs {
        if (hasKeystore) {
            create("release") {
                storeFile = file(keystorePath!!)
                storePassword = prop("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = prop("ANDROID_KEY_ALIAS")
                keyPassword = prop("ANDROID_KEY_PASSWORD")
                enableV1Signing = false // minSdk 24: v2/v3 yetarli
                enableV2Signing = true
                enableV3Signing = true
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            manifestPlaceholders["usesCleartext"] = "true" // faqat lokal ishlab chiqish (10.0.2.2)
            buildConfigField("String", "DEFAULT_SERVER_URL", "\"http://10.0.2.2:3000\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            manifestPlaceholders["usesCleartext"] = "false"
            buildConfigField("String", "DEFAULT_SERVER_URL", "\"$releaseServerUrl\"")
            if (hasKeystore) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.1")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Networking (REST + WebSocket)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Shifrlangan sessiya saqlash (Android Keystore)
    implementation("androidx.security:security-crypto:1.0.0")

    // Google Sign-In (Credential Manager)
    implementation("androidx.credentials:credentials:1.2.2")
    implementation("androidx.credentials:credentials-play-services-auth:1.2.2")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    // WebRTC for Android
    implementation("io.getstream:stream-webrtc-android:1.2.2")
}
