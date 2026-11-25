package com.pulselink.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pulselink.app.data.ChatMessage
import com.pulselink.app.data.UserProfile
import com.pulselink.app.ui.components.UserAvatar
import com.pulselink.app.ui.theme.ElectricIndigo

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    currentUserId: String,
    peer: UserProfile,
    messages: List<ChatMessage>,
    isPeerTyping: Boolean,
    onBack: () -> Unit,
    onSendMessage: (String) -> Unit,
    onTyping: (Boolean) -> Unit,
    onStartAudioCall: () -> Unit,
    onStartVideoCall: () -> Unit
) {
    var text by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.lastIndex)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Orqaga")
                    }
                },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        UserAvatar(peer.displayName, peer.avatarColor, peer.online, size = 38.dp)
                        Column {
                            Text(peer.displayName, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            Text(
                                text = when {
                                    isPeerTyping -> "yozmoqda..."
                                    peer.online -> "Onlayn"
                                    else -> "Oflayn"
                                },
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onStartAudioCall) {
                        Icon(Icons.Default.Call, contentDescription = "Audio qo‘ng‘iroq")
                    }
                    IconButton(onClick = onStartVideoCall) {
                        Icon(Icons.Default.Videocam, contentDescription = "Video qo‘ng‘iroq", tint = ElectricIndigo)
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(messages, key = { it.id }) { msg ->
                    val isOut = msg.senderId == currentUserId
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = if (isOut) Alignment.End else Alignment.Start
                    ) {
                        Box(
                            modifier = Modifier
                                .widthIn(max = 280.dp)
                                .background(
                                    brush = if (isOut) {
                                        Brush.linearGradient(listOf(Color(0xFF4F46E5), Color(0xFF6366F1)))
                                    } else {
                                        Brush.linearGradient(
                                            listOf(
                                                MaterialTheme.colorScheme.surfaceVariant,
                                                MaterialTheme.colorScheme.surfaceVariant
                                            )
                                        )
                                    },
                                    shape = RoundedCornerShape(
                                        topStart = 18.dp,
                                        topEnd = 18.dp,
                                        bottomStart = if (isOut) 18.dp else 4.dp,
                                        bottomEnd = if (isOut) 4.dp else 18.dp
                                    )
                                )
                                .padding(horizontal = 14.dp, vertical = 10.dp)
                        ) {
                            Text(
                                text = msg.text,
                                color = if (isOut) Color.White else MaterialTheme.colorScheme.onSurface,
                                fontSize = 14.5.sp
                            )
                        }
                        if (isOut) {
                            Text(
                                text = if (msg.status == "read") "✓✓" else "✓",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 2.dp, end = 4.dp)
                            )
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = text,
                    onValueChange = {
                        text = it
                        onTyping(it.isNotEmpty())
                    },
                    placeholder = { Text("Xabar yozing...") },
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.weight(1f),
                    maxLines = 4
                )
                FilledIconButton(
                    onClick = {
                        val trimmed = text.trim()
                        if (trimmed.isNotEmpty()) {
                            onSendMessage(trimmed)
                            text = ""
                            onTyping(false)
                        }
                    },
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Yuborish")
                }
            }
        }
    }
}
