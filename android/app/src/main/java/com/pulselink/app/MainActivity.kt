package com.pulselink.app

import android.Manifest
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.pulselink.app.data.*
import com.pulselink.app.network.ApiClient
import com.pulselink.app.network.SignalingClient
import com.pulselink.app.ui.screens.*
import com.pulselink.app.ui.theme.PulseLinkTheme
import com.pulselink.app.webrtc.WebRtcManager
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.IceCandidate
import org.webrtc.SessionDescription
import org.webrtc.SurfaceViewRenderer

class MainActivity : ComponentActivity() {

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {}

    private var activeRingtone: Ringtone? = null

    private fun startRingtone() {
        runCatching {
            stopRingtone()
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            activeRingtone = RingtoneManager.getRingtone(applicationContext, uri)?.apply { play() }
        }
    }

    private fun stopRingtone() {
        runCatching {
            activeRingtone?.stop()
            activeRingtone = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        permissionLauncher.launch(
            arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
        )

        val session = SessionManager(applicationContext)

        setContent {
            var isDarkTheme by remember { mutableStateOf(session.darkTheme) }
            var isDevMode by remember { mutableStateOf(session.devMode) }
            var serverUrl by remember { mutableStateOf(session.serverUrl) }
            val api = remember { ApiClient(serverUrl).apply { token = session.token } }
            val scope = rememberCoroutineScope()
            val credentialManager = remember { CredentialManager.create(this) }

            var currentUser by remember { mutableStateOf<UserProfile?>(null) }
            var authError by remember { mutableStateOf<String?>(null) }
            var authLoading by remember { mutableStateOf(false) }
            var wsConnected by remember { mutableStateOf(false) }
            var dbEngine by remember { mutableStateOf("MySQL/MariaDB") }
            var iceServers by remember { mutableStateOf<List<IceServerConfig>>(emptyList()) }
            var devLogs by remember { mutableStateOf<List<String>>(emptyList()) }

            var chats by remember { mutableStateOf<List<ChatSummary>>(emptyList()) }
            var users by remember { mutableStateOf<List<UserProfile>>(emptyList()) }
            var calls by remember { mutableStateOf<List<CallRecord>>(emptyList()) }

            var activePeer by remember { mutableStateOf<UserProfile?>(null) }
            var messages by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
            var isPeerTyping by remember { mutableStateOf(false) }

            var incomingCaller by remember { mutableStateOf<UserProfile?>(null) }
            var incomingCallId by remember { mutableStateOf<String?>(null) }
            var incomingCallType by remember { mutableStateOf("video") }

            var activeCallPeer by remember { mutableStateOf<UserProfile?>(null) }
            var activeCallId by remember { mutableStateOf<String?>(null) }
            var activeCallType by remember { mutableStateOf("video") }
            var localRenderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
            var remoteRenderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }

            fun addDevLog(line: String) {
                devLogs = (listOf(line) + devLogs).take(30)
            }

            lateinit var signaling: SignalingClient
            lateinit var webRtc: WebRtcManager

            fun refreshLists() {
                scope.launch {
                    runCatching {
                        chats = api.getChats()
                        users = api.getUsers()
                        calls = api.getCalls()
                    }
                }
            }

            fun endCallCleanup() {
                stopRingtone()
                webRtc.close()
                incomingCaller = null
                incomingCallId = null
                activeCallPeer = null
                activeCallId = null
                refreshLists()
            }

            webRtc = remember {
                WebRtcManager(
                    context = this,
                    onIceCandidate = { cand ->
                        val targetId = activeCallPeer?.id ?: return@WebRtcManager
                        val cId = activeCallId ?: return@WebRtcManager
                        signaling.send(
                            "call:ice",
                            JSONObject()
                                .put("targetId", targetId)
                                .put("callId", cId)
                                .put(
                                    "candidate",
                                    JSONObject()
                                        .put("sdpMid", cand.sdpMid)
                                        .put("sdpMLineIndex", cand.sdpMLineIndex)
                                        .put("candidate", cand.sdp)
                                )
                        )
                    },
                    onRemoteVideoTrack = { track ->
                        remoteRenderer?.let { track.addSink(it) }
                    }
                )
            }

            signaling = remember {
                SignalingClient(
                    onConnectionChanged = {
                        wsConnected = it
                        addDevLog(if (it) "WS connected" else "WS disconnected")
                    },
                    onEvent = { event, data ->
                        scope.launch {
                            addDevLog("WS <- $event")
                            when (event) {
                                "chat:message" -> {
                                    val msg = ApiClient.parseMessage(data)
                                    val peer = activePeer
                                    if (peer != null && (msg.senderId == peer.id || msg.receiverId == peer.id)) {
                                        messages = messages + msg
                                    }
                                    refreshLists()
                                }
                                "chat:typing" -> {
                                    if (activePeer?.id == data.optString("userId")) {
                                        isPeerTyping = data.optBoolean("isTyping", false)
                                    }
                                }
                                "presence:update" -> refreshLists()
                                "call:created" -> activeCallId = data.optString("callId")
                                "call:incoming" -> {
                                    incomingCallId = data.optString("callId")
                                    incomingCallType = data.optString("callType", "video")
                                    incomingCaller = ApiClient.parseUser(data.getJSONObject("caller"))
                                    startRingtone()
                                }
                                "call:accepted" -> {
                                    activeCallId = data.optString("callId")
                                    webRtc.createPeerConnection(iceServers)
                                    webRtc.createOffer { sdp ->
                                        signaling.send(
                                            "call:offer",
                                            JSONObject()
                                                .put("targetId", activeCallPeer?.id)
                                                .put("callId", activeCallId)
                                                .put(
                                                    "sdp",
                                                    JSONObject()
                                                        .put("type", sdp.type.canonicalForm())
                                                        .put("sdp", sdp.description)
                                                )
                                        )
                                    }
                                }
                                "call:offer" -> {
                                    val fromId = data.getString("fromId")
                                    val sdpObj = data.getJSONObject("sdp")
                                    val sdp = SessionDescription(
                                        SessionDescription.Type.fromCanonicalForm(sdpObj.getString("type")),
                                        sdpObj.getString("sdp")
                                    )
                                    webRtc.createPeerConnection(iceServers)
                                    webRtc.handleRemoteOffer(sdp) { answer ->
                                        signaling.send(
                                            "call:answer",
                                            JSONObject()
                                                .put("targetId", fromId)
                                                .put("callId", data.optString("callId"))
                                                .put(
                                                    "sdp",
                                                    JSONObject()
                                                        .put("type", answer.type.canonicalForm())
                                                        .put("sdp", answer.description)
                                                )
                                        )
                                    }
                                }
                                "call:answer" -> {
                                    val sdpObj = data.getJSONObject("sdp")
                                    val sdp = SessionDescription(
                                        SessionDescription.Type.fromCanonicalForm(sdpObj.getString("type")),
                                        sdpObj.getString("sdp")
                                    )
                                    webRtc.handleRemoteAnswer(sdp)
                                }
                                "call:ice" -> {
                                    val c = data.optJSONObject("candidate") ?: return@launch
                                    webRtc.addIceCandidate(
                                        IceCandidate(
                                            c.getString("sdpMid"),
                                            c.getInt("sdpMLineIndex"),
                                            c.getString("candidate")
                                        )
                                    )
                                }
                                "call:rejected", "call:timeout", "call:unavailable", "call:hangup" -> endCallCleanup()
                            }
                        }
                    }
                )
            }

            // Restore session and load server ICE/Google config on launch
            LaunchedEffect(Unit) {
                runCatching {
                    val cfg = api.getConfig()
                    dbEngine = cfg.database
                    iceServers = cfg.iceServers
                }
                if (session.token.isNotEmpty()) {
                    runCatching { api.getMe() }
                        .onSuccess { user ->
                            currentUser = user
                            signaling.connect(api.getWsUrl(), api.token)
                            scope.launch { runCatching { iceServers = api.getIceServers() } }
                            refreshLists()
                        }
                        .onFailure {
                            session.clearAuth()
                            api.token = ""
                        }
                }
            }

            PulseLinkTheme(darkTheme = isDarkTheme) {
                val user = currentUser
                if (user == null) {
                    AuthScreen(
                        serverUrl = serverUrl,
                        onServerUrlChange = {
                            serverUrl = it
                            session.serverUrl = it
                            runCatching { api.updateBaseUrl(it) }.onFailure { authError = it.message }
                        },
                        onLogin = { identifier, password ->
                            scope.launch {
                                authLoading = true
                                authError = null
                                runCatching { api.login(identifier, password) }
                                    .onSuccess { res ->
                                        api.token = res.token
                                        session.token = res.token
                                        currentUser = res.user
                                        signaling.connect(api.getWsUrl(), api.token)
                            scope.launch { runCatching { iceServers = api.getIceServers() } }
                                        refreshLists()
                                    }
                                    .onFailure { authError = it.message }
                                authLoading = false
                            }
                        },
                        onRegister = { name, email, uname, phone, pass ->
                            scope.launch {
                                authLoading = true
                                authError = null
                                runCatching { api.register(name, email, uname, phone, pass) }
                                    .onSuccess { res ->
                                        api.token = res.token
                                        session.token = res.token
                                        currentUser = res.user
                                        signaling.connect(api.getWsUrl(), api.token)
                            scope.launch { runCatching { iceServers = api.getIceServers() } }
                                        refreshLists()
                                    }
                                    .onFailure { authError = it.message }
                                authLoading = false
                            }
                        },
                        onGoogleSignIn = {
                            scope.launch {
                                authLoading = true
                                authError = null
                                runCatching {
                                    val cfg = api.getConfig()
                                    dbEngine = cfg.database
                                    iceServers = cfg.iceServers
                                    if (cfg.googleClientId.isBlank()) {
                                        throw IllegalStateException("Serverda GOOGLE_CLIENT_ID sozlanmagan")
                                    }
                                    val googleIdOption = GetGoogleIdOption.Builder()
                                        .setFilterByAuthorizedAccounts(false)
                                        .setServerClientId(cfg.googleClientId)
                                        .build()
                                    val request = GetCredentialRequest.Builder()
                                        .addCredentialOption(googleIdOption)
                                        .build()
                                    val result = credentialManager.getCredential(this@MainActivity, request)
                                    val cred = GoogleIdTokenCredential.createFrom(result.credential.data)
                                    api.loginWithGoogle(cred.idToken)
                                }.onSuccess { res ->
                                    api.token = res.token
                                    session.token = res.token
                                    currentUser = res.user
                                    signaling.connect(api.getWsUrl(), api.token)
                            scope.launch { runCatching { iceServers = api.getIceServers() } }
                                    refreshLists()
                                }.onFailure {
                                    authError = it.message
                                }
                                authLoading = false
                            }
                        },
                        errorMessage = authError,
                        isLoading = authLoading
                    )
                } else {
                    val peer = activePeer
                    if (peer == null) {
                        HomeScreen(
                            currentUser = user,
                            chats = chats,
                            users = users,
                            calls = calls,
                            isConnected = wsConnected,
                            isDarkTheme = isDarkTheme,
                            isDevMode = isDevMode,
                            serverUrl = api.getBaseUrl(),
                            dbEngine = dbEngine,
                            devLogs = devLogs,
                            onToggleTheme = {
                                isDarkTheme = !isDarkTheme
                                session.darkTheme = isDarkTheme
                            },
                            onToggleDevMode = {
                                isDevMode = it
                                session.devMode = it
                            },
                            onOpenChat = { selected ->
                                activePeer = selected
                                scope.launch {
                                    runCatching { messages = api.getMessages(selected.id) }
                                }
                            },
                            onUpdateProfile = { dName, uname, bio, phone, color ->
                                scope.launch {
                                    runCatching {
                                        currentUser = api.updateMe(dName, uname, bio, phone, color)
                                    }
                                }
                            },
                            onLogout = {
                                signaling.disconnect()
                                session.clearAuth()
                                api.token = ""
                                currentUser = null
                                activePeer = null
                            }
                        )
                    } else {
                        ChatScreen(
                            currentUserId = user.id,
                            peer = peer,
                            messages = messages,
                            isPeerTyping = isPeerTyping,
                            onBack = { activePeer = null },
                            onSendMessage = { txt ->
                                signaling.send(
                                    "chat:send",
                                    JSONObject().put("receiverId", peer.id).put("text", txt)
                                )
                            },
                            onTyping = { typing ->
                                signaling.send(
                                    "chat:typing",
                                    JSONObject().put("receiverId", peer.id).put("isTyping", typing)
                                )
                            },
                            onStartAudioCall = {
                                activeCallPeer = peer
                                activeCallType = "audio"
                                webRtc.startLocalMedia(false, null)
                                signaling.send(
                                    "call:invite",
                                    JSONObject().put("receiverId", peer.id).put("callType", "audio")
                                )
                            },
                            onStartVideoCall = {
                                activeCallPeer = peer
                                activeCallType = "video"
                                webRtc.startLocalMedia(true, localRenderer)
                                signaling.send(
                                    "call:invite",
                                    JSONObject().put("receiverId", peer.id).put("callType", "video")
                                )
                            }
                        )
                    }

                    incomingCaller?.let { caller ->
                        IncomingCallDialog(
                            caller = caller,
                            callType = incomingCallType,
                            onAccept = {
                                stopRingtone()
                                activeCallPeer = caller
                                activeCallId = incomingCallId
                                activeCallType = incomingCallType
                                incomingCaller = null
                                webRtc.startLocalMedia(activeCallType == "video", localRenderer)
                                signaling.send("call:accept", JSONObject().put("callId", activeCallId))
                            },
                            onReject = {
                                stopRingtone()
                                signaling.send("call:reject", JSONObject().put("callId", incomingCallId))
                                incomingCaller = null
                                incomingCallId = null
                            }
                        )
                    }

                    activeCallPeer?.let { callPeer ->
                        ActiveCallScreen(
                            peer = callPeer,
                            callType = activeCallType,
                            eglBase = webRtc.eglBase,
                            onLocalRendererReady = {
                                localRenderer = it
                                if (activeCallType == "video") {
                                    webRtc.startLocalMedia(true, it)
                                }
                            },
                            onRemoteRendererReady = { remoteRenderer = it },
                            onToggleMic = { webRtc.setAudioEnabled(it) },
                            onToggleCam = { webRtc.setVideoEnabled(it) },
                            onToggleSpeaker = { webRtc.setSpeakerphone(it) },
                            onSwitchCamera = { webRtc.switchCamera() },
                            onHangup = {
                                signaling.send(
                                    "call:hangup",
                                    JSONObject().put("callId", activeCallId).put("targetId", callPeer.id)
                                )
                                endCallCleanup()
                            }
                        )
                    }
                }
            }
        }
    }
}
