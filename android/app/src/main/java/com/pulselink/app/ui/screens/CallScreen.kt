package com.pulselink.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.pulselink.app.data.UserProfile
import com.pulselink.app.ui.components.UserAvatar
import com.pulselink.app.ui.theme.EmeraldAccept
import com.pulselink.app.ui.theme.NeonCyan
import com.pulselink.app.ui.theme.RoseDanger
import org.webrtc.EglBase
import org.webrtc.SurfaceViewRenderer

@Composable
fun IncomingCallDialog(
    caller: UserProfile,
    callType: String,
    onAccept: () -> Unit,
    onReject: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xCC060911)),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier.padding(24.dp).fillMaxWidth(),
            shape = RoundedCornerShape(28.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(
                modifier = Modifier.padding(28.dp).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                UserAvatar(caller.displayName, caller.avatarColor, online = true, size = 84.dp)
                Text(
                    text = if (callType == "video") "VIDEO QO‘NG‘IROQ" else "AUDIO QO‘NG‘IROQ",
                    color = NeonCyan,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(caller.displayName, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
                Text("Sizga qo‘ng‘iroq qilmoqda...", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                    FloatingActionButton(
                        onClick = onReject,
                        containerColor = RoseDanger,
                        contentColor = Color.White,
                        shape = CircleShape
                    ) {
                        Icon(Icons.Default.CallEnd, contentDescription = "Rad etish")
                    }
                    FloatingActionButton(
                        onClick = onAccept,
                        containerColor = EmeraldAccept,
                        contentColor = Color.White,
                        shape = CircleShape
                    ) {
                        Icon(Icons.Default.Call, contentDescription = "Qabul qilish")
                    }
                }
            }
        }
    }
}

@Composable
fun ActiveCallScreen(
    peer: UserProfile,
    callType: String,
    eglBase: EglBase,
    onLocalRendererReady: (SurfaceViewRenderer) -> Unit,
    onRemoteRendererReady: (SurfaceViewRenderer) -> Unit,
    onToggleMic: (Boolean) -> Unit,
    onToggleCam: (Boolean) -> Unit,
    onToggleSpeaker: (Boolean) -> Unit,
    onSwitchCamera: () -> Unit,
    onHangup: () -> Unit
) {
    var micEnabled by remember { mutableStateOf(true) }
    var camEnabled by remember { mutableStateOf(callType == "video") }
    var speakerOn by remember { mutableStateOf(callType == "video") }

    var localView by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    var remoteView by remember { mutableStateOf<SurfaceViewRenderer?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            runCatching { localView?.release() }
            runCatching { remoteView?.release() }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF060911))
    ) {
        if (callType == "video") {
            AndroidView(
                factory = { ctx ->
                    SurfaceViewRenderer(ctx).apply {
                        init(eglBase.eglBaseContext, null)
                        setEnableHardwareScaler(true)
                        remoteView = this
                        onRemoteRendererReady(this)
                    }
                },
                modifier = Modifier.fillMaxSize()
            )
            AndroidView(
                factory = { ctx ->
                    SurfaceViewRenderer(ctx).apply {
                        init(eglBase.eglBaseContext, null)
                        setZOrderMediaOverlay(true)
                        setMirror(true)
                        localView = this
                        onLocalRendererReady(this)
                    }
                },
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 56.dp, end = 16.dp)
                    .size(width = 110.dp, height = 160.dp)
                    .clip(RoundedCornerShape(16.dp))
            )
        } else {
            Column(
                modifier = Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                UserAvatar(peer.displayName, peer.avatarColor, online = true, size = 104.dp)
                Text(peer.displayName, color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Text("Ovozli aloqa faol", color = Color(0xFF94A3B8))
            }
        }

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 36.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            FilledIconButton(
                onClick = {
                    micEnabled = !micEnabled
                    onToggleMic(micEnabled)
                },
                modifier = Modifier.size(54.dp),
                colors = IconButtonDefaults.filledIconButtonColors(
                    containerColor = if (micEnabled) Color(0xFF1E293B) else RoseDanger
                )
            ) {
                Icon(
                    if (micEnabled) Icons.Default.Mic else Icons.Default.MicOff,
                    contentDescription = "Mikrofon",
                    tint = Color.White
                )
            }

            FilledIconButton(
                onClick = {
                    speakerOn = !speakerOn
                    onToggleSpeaker(speakerOn)
                },
                modifier = Modifier.size(54.dp),
                colors = IconButtonDefaults.filledIconButtonColors(
                    containerColor = if (speakerOn) Color(0xFF4F46E5) else Color(0xFF1E293B)
                )
            ) {
                Icon(
                    if (speakerOn) Icons.Default.VolumeUp else Icons.Default.VolumeOff,
                    contentDescription = "Karnay",
                    tint = Color.White
                )
            }

            if (callType == "video") {
                FilledIconButton(
                    onClick = {
                        camEnabled = !camEnabled
                        onToggleCam(camEnabled)
                    },
                    modifier = Modifier.size(54.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = if (camEnabled) Color(0xFF1E293B) else RoseDanger
                    )
                ) {
                    Icon(
                        if (camEnabled) Icons.Default.Videocam else Icons.Default.VideocamOff,
                        contentDescription = "Kamera",
                        tint = Color.White
                    )
                }

                FilledIconButton(
                    onClick = onSwitchCamera,
                    modifier = Modifier.size(54.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color(0xFF1E293B))
                ) {
                    Icon(Icons.Default.Cameraswitch, contentDescription = "Kamera almashtirish", tint = Color.White)
                }
            }

            FilledIconButton(
                onClick = onHangup,
                modifier = Modifier.size(54.dp),
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = RoseDanger)
            ) {
                Icon(Icons.Default.CallEnd, contentDescription = "Tugatish", tint = Color.White)
            }
        }
    }
}
