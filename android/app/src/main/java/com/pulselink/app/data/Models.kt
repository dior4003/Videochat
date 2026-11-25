package com.pulselink.app.data

data class UserProfile(
    val id: String,
    val email: String,
    val username: String,
    val phone: String,
    val displayName: String,
    val bio: String,
    val avatarColor: String,
    val online: Boolean = false
)

data class ChatMessage(
    val id: String,
    val senderId: String,
    val receiverId: String,
    val text: String,
    val type: String = "text",
    val mediaUrl: String? = null,
    val status: String,
    val createdAt: String
)

data class ChatSummary(
    val peer: UserProfile,
    val lastMessage: ChatMessage?,
    val unreadCount: Int
)

data class CallRecord(
    val id: String,
    val callType: String,
    val status: String,
    val direction: String,
    val durationSec: Int,
    val startedAt: String,
    val peer: UserProfile?
)

data class AuthResult(
    val token: String,
    val user: UserProfile
)

data class IceServerConfig(
    val urls: String,
    val username: String? = null,
    val credential: String? = null
)

data class ServerConfig(
    val googleClientId: String,
    val database: String,
    val iceServers: List<IceServerConfig> = emptyList()
)
