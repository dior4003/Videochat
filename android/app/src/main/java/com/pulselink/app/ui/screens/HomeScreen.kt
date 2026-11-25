package com.pulselink.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pulselink.app.data.CallRecord
import com.pulselink.app.data.ChatSummary
import com.pulselink.app.data.UserProfile
import com.pulselink.app.ui.components.UserAvatar

private val AVATAR_SWATCHES = listOf("#6366F1", "#06B6D4", "#8B5CF6", "#EC4899", "#F59E0B", "#3B82F6", "#F43F5E")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    currentUser: UserProfile,
    chats: List<ChatSummary>,
    users: List<UserProfile>,
    calls: List<CallRecord>,
    isConnected: Boolean,
    isDarkTheme: Boolean,
    isDevMode: Boolean,
    serverUrl: String,
    dbEngine: String,
    devLogs: List<String>,
    onToggleTheme: () -> Unit,
    onToggleDevMode: (Boolean) -> Unit,
    onOpenChat: (UserProfile) -> Unit,
    onUpdateProfile: (displayName: String, username: String, bio: String, phone: String, color: String) -> Unit,
    onLogout: () -> Unit
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    var searchQuery by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            text = when (selectedTab) {
                                0 -> "PulseLink Chat"
                                1 -> "Kontaktlar"
                                2 -> "Qo‘ng‘iroqlar"
                                else -> "Profil"
                            },
                            fontWeight = FontWeight.ExtraBold
                        )
                        Badge(
                            containerColor = if (isConnected) Color(0xFF10B981).copy(alpha = 0.2f) else Color(0xFFF59E0B).copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = if (isConnected) "Onlayn" else "Ulanmoqda",
                                color = if (isConnected) Color(0xFF34D399) else Color(0xFFFBBF24),
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                fontSize = 11.sp
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onToggleTheme) {
                        Icon(Icons.Default.DarkMode, contentDescription = "Tema")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.ChatBubbleOutline, contentDescription = "Chatlar") },
                    label = { Text("Chatlar") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.PeopleOutline, contentDescription = "Kontaktlar") },
                    label = { Text("Kontaktlar") }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.Call, contentDescription = "Qo‘ng‘iroqlar") },
                    label = { Text("Qo‘ng‘iroqlar") }
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Icon(Icons.Default.PersonOutline, contentDescription = "Profil") },
                    label = { Text("Profil") }
                )
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            if (selectedTab < 2) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Qidirish...") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }

            when (selectedTab) {
                0 -> {
                    val filtered = chats.filter {
                        it.peer.displayName.contains(searchQuery, true) ||
                            it.peer.username.contains(searchQuery, true) ||
                            it.peer.email.contains(searchQuery, true)
                    }
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(filtered, key = { it.peer.id }) { chat ->
                            ListItem(
                                modifier = Modifier.clickable { onOpenChat(chat.peer) },
                                leadingContent = {
                                    UserAvatar(chat.peer.displayName, chat.peer.avatarColor, chat.peer.online)
                                },
                                headlineContent = {
                                    Text(chat.peer.displayName, fontWeight = FontWeight.Bold)
                                },
                                supportingContent = {
                                    Text(
                                        chat.lastMessage?.text ?: "",
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                },
                                trailingContent = {
                                    if (chat.unreadCount > 0) {
                                        Badge { Text("${chat.unreadCount}") }
                                    }
                                }
                            )
                        }
                    }
                }

                1 -> {
                    val filtered = users.filter {
                        it.displayName.contains(searchQuery, true) ||
                            it.username.contains(searchQuery, true) ||
                            it.email.contains(searchQuery, true)
                    }
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(filtered, key = { it.id }) { user ->
                            val handle = if (user.username.isNotBlank()) "@${user.username}" else user.email
                            ListItem(
                                modifier = Modifier.clickable { onOpenChat(user) },
                                leadingContent = {
                                    UserAvatar(user.displayName, user.avatarColor, user.online)
                                },
                                headlineContent = {
                                    Text(user.displayName, fontWeight = FontWeight.Bold)
                                },
                                supportingContent = {
                                    Text("$handle • ${user.bio}", maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            )
                        }
                    }
                }

                2 -> {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(calls, key = { it.id }) { call ->
                            val peer = call.peer ?: return@items
                            ListItem(
                                modifier = Modifier.clickable { onOpenChat(peer) },
                                leadingContent = {
                                    UserAvatar(peer.displayName, peer.avatarColor, peer.online)
                                },
                                headlineContent = {
                                    Text(peer.displayName, fontWeight = FontWeight.Bold)
                                },
                                supportingContent = {
                                    val dir = if (call.direction == "outgoing") "Chiquvchi" else "Kiruvchi"
                                    val kind = if (call.callType == "video") "Video" else "Audio"
                                    Text("$dir • $kind (${call.status})")
                                },
                                trailingContent = {
                                    Icon(
                                        if (call.callType == "video") Icons.Default.Videocam else Icons.Default.Call,
                                        contentDescription = null
                                    )
                                }
                            )
                        }
                    }
                }

                3 -> {
                    ProfileTab(
                        user = currentUser,
                        isDevMode = isDevMode,
                        isConnected = isConnected,
                        serverUrl = serverUrl,
                        dbEngine = dbEngine,
                        devLogs = devLogs,
                        onToggleDevMode = onToggleDevMode,
                        onSave = onUpdateProfile,
                        onLogout = onLogout
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfileTab(
    user: UserProfile,
    isDevMode: Boolean,
    isConnected: Boolean,
    serverUrl: String,
    dbEngine: String,
    devLogs: List<String>,
    onToggleDevMode: (Boolean) -> Unit,
    onSave: (String, String, String, String, String) -> Unit,
    onLogout: () -> Unit
) {
    var displayName by remember(user) { mutableStateOf(user.displayName) }
    var username by remember(user) { mutableStateOf(user.username) }
    var bio by remember(user) { mutableStateOf(user.bio) }
    var phone by remember(user) { mutableStateOf(user.phone) }
    var selectedColor by remember(user) { mutableStateOf(user.avatarColor) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            UserAvatar(displayName, selectedColor, online = true, size = 68.dp)
            Column {
                Text(user.displayName, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text(user.email, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (user.username.isNotBlank()) {
                    Text("@${user.username}", fontSize = 13.sp, color = MaterialTheme.colorScheme.secondary)
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            AVATAR_SWATCHES.forEach { hex ->
                val color = Color(android.graphics.Color.parseColor(hex))
                Box(
                    modifier = Modifier
                        .size(30.dp)
                        .clip(CircleShape)
                        .background(color)
                        .then(
                            if (hex == selectedColor) Modifier.border(3.dp, Color.White, CircleShape)
                            else Modifier
                        )
                        .clickable { selectedColor = hex }
                )
            }
        }

        OutlinedTextField(
            value = displayName,
            onValueChange = { displayName = it },
            label = { Text("Ko‘rinadigan ism") },
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text("Username (@)") },
            placeholder = { Text("masalan: ali_dev") },
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = bio,
            onValueChange = { bio = it },
            label = { Text("Bio / Holat") },
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it },
            label = { Text("Telefon raqami") },
            modifier = Modifier.fillMaxWidth()
        )

        Button(
            onClick = { onSave(displayName, username, bio, phone, selectedColor) },
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(14.dp)
        ) {
            Text("Profilni saqlash", fontWeight = FontWeight.Bold)
        }

        // Developer Mode Card
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Dasturchi rejimi", fontWeight = FontWeight.Bold)
                    Switch(checked = isDevMode, onCheckedChange = onToggleDevMode)
                }
                if (isDevMode) {
                    Text(
                        text = "UserID: ${user.id}\nDB: $dbEngine\nServer: $serverUrl\nWS: ${if (isConnected) "Connected" else "Disconnected"}",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.5.sp
                    )
                    if (devLogs.isNotEmpty()) {
                        Text(
                            text = devLogs.take(10).joinToString("\n"),
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
        ) {
            Text("Hisobdan chiqish", fontWeight = FontWeight.Bold)
        }
    }
}
