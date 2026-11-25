package com.pulselink.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val DarkColors = darkColorScheme(
    primary = ElectricIndigo,
    secondary = NeonCyan,
    background = MidnightBg,
    surface = MidnightSurface,
    surfaceVariant = MidnightElevated,
    onPrimary = TextLight,
    onBackground = TextLight,
    onSurface = TextLight,
    onSurfaceVariant = TextMuted,
    error = RoseDanger
)

private val LightColors = lightColorScheme(
    primary = IndigoLight,
    secondary = NeonCyan,
    background = FrostBg,
    surface = FrostSurface,
    surfaceVariant = FrostElevated,
    onPrimary = FrostSurface,
    onBackground = TextDark,
    onSurface = TextDark,
    onSurfaceVariant = TextDarkMuted,
    error = RoseDanger
)

@Composable
fun PulseLinkTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content
    )
}
