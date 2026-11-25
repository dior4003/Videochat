package com.pulselink.app.network

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class SignalingClient(
    private val onEvent: (event: String, data: JSONObject) -> Unit,
    private val onConnectionChanged: (connected: Boolean) -> Unit
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .build()
    private var webSocket: WebSocket? = null

    /** Token URL'ga emas, Authorization sarlavhasiga qo'yiladi (loglarda/proxy'da ko'rinmaydi). */
    fun connect(wsUrl: String, token: String) {
        disconnect()
        val request = Request.Builder()
            .url(wsUrl)
            .header("Authorization", "Bearer $token")
            .build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                onConnectionChanged(true)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching {
                    val json = JSONObject(text)
                    val event = json.getString("event")
                    val data = json.optJSONObject("data") ?: JSONObject()
                    onEvent(event, data)
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                onConnectionChanged(false)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                onConnectionChanged(false)
            }
        })
    }

    fun send(event: String, data: JSONObject) {
        val payload = JSONObject()
            .put("event", event)
            .put("data", data)
        webSocket?.send(payload.toString())
    }

    fun disconnect() {
        webSocket?.close(1000, "Client closed")
        webSocket = null
    }
}
