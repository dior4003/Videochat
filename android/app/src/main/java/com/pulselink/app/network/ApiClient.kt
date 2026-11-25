package com.pulselink.app.network

import com.pulselink.app.BuildConfig
import com.pulselink.app.data.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class ApiClient(private var baseUrl: String) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    var token: String = ""

    /** Release build'da faqat HTTPS qabul qilinadi (debug'da lokal HTTP ruxsat). */
    fun updateBaseUrl(url: String) {
        val clean = url.trim().trimEnd('/')
        if (!BuildConfig.DEBUG && !clean.startsWith("https://")) {
            throw IllegalArgumentException("Xavfsizlik uchun server manzili https:// bilan boshlanishi kerak")
        }
        baseUrl = clean
    }

    fun getBaseUrl(): String = baseUrl

    fun getWsUrl(): String {
        val wsBase = baseUrl
            .replace("https://", "wss://")
            .replace("http://", "ws://")
        return wsBase // token Authorization sarlavhasi bilan yuboriladi
    }

    suspend fun getConfig(): ServerConfig = withContext(Dispatchers.IO) {
        val obj = get("/api/config")
        val arr = obj.optJSONArray("iceServers")
        val iceList = if (arr != null) {
            List(arr.length()) { i ->
                val item = arr.getJSONObject(i)
                IceServerConfig(
                    urls = item.getString("urls"),
                    username = item.optString("username").takeIf { it.isNotEmpty() },
                    credential = item.optString("credential").takeIf { it.isNotEmpty() }
                )
            }
        } else {
            emptyList()
        }
        ServerConfig(
            googleClientId = obj.optString("googleClientId", ""),
            database = obj.optString("database", "MySQL/MariaDB"),
            iceServers = iceList
        )
    }

    /** TURN ma'lumotlarini o'z ichiga olgan ICE serverlar (faqat tizimga kirgan foydalanuvchiga). */
    suspend fun getIceServers(): List<IceServerConfig> = withContext(Dispatchers.IO) {
        val arr = get("/api/ice").optJSONArray("iceServers") ?: return@withContext emptyList()
        List(arr.length()) { i ->
            val item = arr.getJSONObject(i)
            IceServerConfig(
                urls = item.getString("urls"),
                username = item.optString("username").takeIf { it.isNotEmpty() },
                credential = item.optString("credential").takeIf { it.isNotEmpty() }
            )
        }
    }

    suspend fun login(identifier: String, password: String): AuthResult = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("identifier", identifier)
            .put("password", password)
        val obj = post("/api/auth/login", body)
        AuthResult(obj.getString("token"), parseUser(obj.getJSONObject("user")))
    }

    suspend fun register(
        displayName: String,
        email: String,
        username: String,
        phone: String,
        password: String
    ): AuthResult = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("displayName", displayName)
            .put("email", email)
            .put("username", username)
            .put("phone", phone)
            .put("password", password)
        val obj = post("/api/auth/register", body)
        AuthResult(obj.getString("token"), parseUser(obj.getJSONObject("user")))
    }

    suspend fun loginWithGoogle(idToken: String): AuthResult = withContext(Dispatchers.IO) {
        val body = JSONObject().put("idToken", idToken)
        val obj = post("/api/auth/google", body)
        AuthResult(obj.getString("token"), parseUser(obj.getJSONObject("user")))
    }

    suspend fun getMe(): UserProfile = withContext(Dispatchers.IO) {
        val obj = get("/api/me")
        parseUser(obj.getJSONObject("user"))
    }

    suspend fun updateMe(
        displayName: String,
        username: String,
        bio: String,
        phone: String,
        avatarColor: String
    ): UserProfile = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("displayName", displayName)
            .put("username", username)
            .put("bio", bio)
            .put("phone", phone)
            .put("avatarColor", avatarColor)
        val obj = put("/api/me", body)
        parseUser(obj.getJSONObject("user"))
    }

    suspend fun getChats(): List<ChatSummary> = withContext(Dispatchers.IO) {
        val arr = get("/api/chats").getJSONArray("chats")
        List(arr.length()) { i ->
            val item = arr.getJSONObject(i)
            val msgObj = item.optJSONObject("lastMessage")
            ChatSummary(
                peer = parseUser(item.getJSONObject("peer")),
                lastMessage = msgObj?.let { parseMessage(it) },
                unreadCount = item.optInt("unreadCount", 0)
            )
        }
    }

    suspend fun getUsers(query: String = ""): List<UserProfile> = withContext(Dispatchers.IO) {
        val arr = get("/api/users?q=${URLEncoder.encode(query, "UTF-8")}").getJSONArray("users")
        List(arr.length()) { i -> parseUser(arr.getJSONObject(i)) }
    }

    suspend fun getMessages(peerId: String): List<ChatMessage> = withContext(Dispatchers.IO) {
        val arr = get("/api/chats/$peerId/messages").getJSONArray("messages")
        List(arr.length()) { i -> parseMessage(arr.getJSONObject(i)) }
    }

    suspend fun getCalls(): List<CallRecord> = withContext(Dispatchers.IO) {
        val arr = get("/api/calls").getJSONArray("calls")
        List(arr.length()) { i ->
            val c = arr.getJSONObject(i)
            val peerObj = c.optJSONObject("peer")
            CallRecord(
                id = c.getString("id"),
                callType = c.getString("callType"),
                status = c.getString("status"),
                direction = c.getString("direction"),
                durationSec = c.optInt("durationSec", 0),
                startedAt = c.getString("startedAt"),
                peer = peerObj?.let { parseUser(it) }
            )
        }
    }

    private fun get(path: String): JSONObject {
        val req = Request.Builder()
            .url("$baseUrl$path")
            .apply { if (token.isNotEmpty()) header("Authorization", "Bearer $token") }
            .get()
            .build()
        return execute(req)
    }

    private fun post(path: String, body: JSONObject): JSONObject {
        val req = Request.Builder()
            .url("$baseUrl$path")
            .apply { if (token.isNotEmpty()) header("Authorization", "Bearer $token") }
            .post(body.toString().toRequestBody(jsonType))
            .build()
        return execute(req)
    }

    private fun put(path: String, body: JSONObject): JSONObject {
        val req = Request.Builder()
            .url("$baseUrl$path")
            .apply { if (token.isNotEmpty()) header("Authorization", "Bearer $token") }
            .put(body.toString().toRequestBody(jsonType))
            .build()
        return execute(req)
    }

    private fun execute(request: Request): JSONObject {
        client.newCall(request).execute().use { res ->
            val raw = res.body?.string() ?: "{}"
            val json = JSONObject(raw)
            if (!res.isSuccessful) {
                throw IllegalStateException(json.optString("error", "Server xatosi (${res.code})"))
            }
            return json
        }
    }

    companion object {
        fun parseUser(o: JSONObject) = UserProfile(
            id = o.getString("id"),
            email = o.optString("email", ""),
            username = o.optString("username", ""),
            phone = o.optString("phone", ""),
            displayName = o.getString("displayName"),
            bio = o.optString("bio", ""),
            avatarColor = o.optString("avatarColor", "#6366F1"),
            online = o.optBoolean("online", false)
        )

        fun parseMessage(o: JSONObject) = ChatMessage(
            id = o.getString("id"),
            senderId = o.getString("senderId"),
            receiverId = o.getString("receiverId"),
            text = o.getString("text"),
            type = o.optString("type", "text"),
            mediaUrl = o.optString("mediaUrl").takeIf { it.isNotEmpty() && it != "null" },
            status = o.optString("status", "sent"),
            createdAt = o.getString("createdAt")
        )
    }
}
