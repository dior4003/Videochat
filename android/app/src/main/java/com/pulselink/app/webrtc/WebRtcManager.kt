package com.pulselink.app.webrtc

import android.content.Context
import android.media.AudioManager
import com.pulselink.app.data.IceServerConfig
import org.webrtc.*

class WebRtcManager(
    private val context: Context,
    private val onIceCandidate: (IceCandidate) -> Unit,
    private val onRemoteVideoTrack: (VideoTrack) -> Unit
) {
    val eglBase: EglBase = EglBase.create()
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val factory: PeerConnectionFactory
    private var peerConnection: PeerConnection? = null
    private var videoCapturer: CameraVideoCapturer? = null
    private var localVideoTrack: VideoTrack? = null
    private var localAudioTrack: AudioTrack? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null

    init {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .createInitializationOptions()
        )
        factory = PeerConnectionFactory.builder()
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
            .createPeerConnectionFactory()
    }

    fun startLocalMedia(enableVideo: Boolean, localRenderer: SurfaceViewRenderer?) {
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        audioManager.isSpeakerphoneOn = enableVideo

        if (localAudioTrack == null) {
            val audioSource = factory.createAudioSource(MediaConstraints())
            localAudioTrack = factory.createAudioTrack("ARDAMSa0", audioSource)
        }

        if (enableVideo && localVideoTrack == null) {
            val enumerator = Camera2Enumerator(context)
            val deviceName = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
                ?: enumerator.deviceNames.firstOrNull()
            if (deviceName != null) {
                videoCapturer = enumerator.createCapturer(deviceName, null)
                surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", eglBase.eglBaseContext)
                val videoSource = factory.createVideoSource(false)
                videoCapturer?.initialize(surfaceTextureHelper, context, videoSource.capturerObserver)
                videoCapturer?.startCapture(720, 1280, 30)
                localVideoTrack = factory.createVideoTrack("ARDAMSv0", videoSource)
            }
        }
        localRenderer?.let { localVideoTrack?.addSink(it) }
    }

    fun createPeerConnection(customIceServers: List<IceServerConfig> = emptyList()) {
        val iceServers = if (customIceServers.isNotEmpty()) {
            customIceServers.map { cfg ->
                PeerConnection.IceServer.builder(cfg.urls).apply {
                    if (!cfg.username.isNullOrEmpty()) setUsername(cfg.username)
                    if (!cfg.credential.isNullOrEmpty()) setPassword(cfg.credential)
                }.createIceServer()
            }
        } else {
            listOf(
                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
                PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer()
            )
        }

        val config = PeerConnection.RTCConfiguration(iceServers)
        peerConnection = factory.createPeerConnection(config, object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                onIceCandidate(candidate)
            }

            override fun onTrack(transceiver: RtpTransceiver?) {
                val track = transceiver?.receiver?.track()
                if (track is VideoTrack) {
                    onRemoteVideoTrack(track)
                }
            }

            override fun onSignalingChange(p0: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(p0: PeerConnection.IceConnectionState?) {}
            override fun onIceConnectionReceivingChange(p0: Boolean) {}
            override fun onIceGatheringChange(p0: PeerConnection.IceGatheringState?) {}
            override fun onIceCandidatesRemoved(p0: Array<out IceCandidate>?) {}
            override fun onAddStream(p0: MediaStream?) {}
            override fun onRemoveStream(p0: MediaStream?) {}
            override fun onDataChannel(p0: DataChannel?) {}
            override fun onRenegotiationNeeded() {}
        })

        localAudioTrack?.let { peerConnection?.addTrack(it, listOf("ARDAMS")) }
        localVideoTrack?.let { peerConnection?.addTrack(it, listOf("ARDAMS")) }
    }

    fun createOffer(onCreated: (SessionDescription) -> Unit) {
        peerConnection?.createOffer(object : SdpAdapter() {
            override fun onCreateSuccess(sdp: SessionDescription) {
                peerConnection?.setLocalDescription(SdpAdapter(), sdp)
                onCreated(sdp)
            }
        }, MediaConstraints())
    }

    fun handleRemoteOffer(sdp: SessionDescription, onAnswerCreated: (SessionDescription) -> Unit) {
        peerConnection?.setRemoteDescription(object : SdpAdapter() {
            override fun onSetSuccess() {
                peerConnection?.createAnswer(object : SdpAdapter() {
                    override fun onCreateSuccess(answer: SessionDescription) {
                        peerConnection?.setLocalDescription(SdpAdapter(), answer)
                        onAnswerCreated(answer)
                    }
                }, MediaConstraints())
            }
        }, sdp)
    }

    fun handleRemoteAnswer(sdp: SessionDescription) {
        peerConnection?.setRemoteDescription(SdpAdapter(), sdp)
    }

    fun addIceCandidate(candidate: IceCandidate) {
        peerConnection?.addIceCandidate(candidate)
    }

    fun setAudioEnabled(enabled: Boolean) {
        localAudioTrack?.setEnabled(enabled)
    }

    fun setVideoEnabled(enabled: Boolean) {
        localVideoTrack?.setEnabled(enabled)
    }

    fun setSpeakerphone(enabled: Boolean) {
        audioManager.isSpeakerphoneOn = enabled
    }

    fun switchCamera() {
        videoCapturer?.switchCamera(null)
    }

    fun close() {
        runCatching { videoCapturer?.stopCapture() }
        videoCapturer?.dispose()
        videoCapturer = null
        surfaceTextureHelper?.dispose()
        surfaceTextureHelper = null
        localVideoTrack?.dispose()
        localVideoTrack = null
        localAudioTrack?.dispose()
        localAudioTrack = null
        peerConnection?.close()
        peerConnection = null
        audioManager.mode = AudioManager.MODE_NORMAL
        audioManager.isSpeakerphoneOn = false
    }

    private open class SdpAdapter : SdpObserver {
        override fun onCreateSuccess(p0: SessionDescription) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(p0: String?) {}
        override fun onSetFailure(p0: String?) {}
    }
}
