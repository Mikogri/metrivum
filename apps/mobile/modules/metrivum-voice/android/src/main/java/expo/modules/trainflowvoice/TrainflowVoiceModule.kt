package expo.modules.trainflowvoice

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.Uri
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.RandomAccessFile
import java.util.UUID
import kotlin.math.abs
import kotlin.math.min

class TrainflowVoiceModule : Module() {
  private class Recording(val id: String, val record: AudioRecord, val partial: File, val output: File) {
    @Volatile var running = true
    @Volatile var discard = false
    @Volatile var bytes = 0
    @Volatile var meter = 0.0
    @Volatile var error: String? = null
    @Volatile var ready = false
    lateinit var worker: Thread
  }

  @Volatile private var current: Recording? = null
  @Volatile private var foreground = true

  override fun definition() = ModuleDefinition {
    Name("TrainflowVoice")
    AsyncFunction("startAsync") { accountId: String -> start(accountId) }
    AsyncFunction("statusAsync") { id: String -> status(requireSession(id)) }
    AsyncFunction("stopAsync") { id: String -> finish(id, false) }
    AsyncFunction("cancelAsync") { id: String -> finish(id, true); Unit }
    OnActivityEntersForeground { foreground = true }
    OnActivityEntersBackground { foreground = false; current?.let { requestStop(it) } }
    OnDestroy {
      current?.let {
        it.discard = true
        requestStop(it)
        val closing = it
        Thread({ closing.worker.join(3000); if (!closing.worker.isAlive) { closing.partial.delete(); closing.output.delete() } }, "metrivum-voice-cleanup").start()
      }
    }
  }

  @Synchronized private fun start(accountId: String): Map<String, Any?> {
    check(foreground) { "Recording requires the app in the foreground" }
    require(Regex("^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$").matches(accountId)) { "Invalid account" }
    current?.let {
      check(!it.worker.isAlive) { "A recording is still active" }
      it.partial.delete(); it.output.delete()
    }
    val context = requireNotNull(appContext.reactContext) { "App context is unavailable" }
    check(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "Microphone permission is required" }
    val directory = File(context.cacheDir, "metrivum-voice/$accountId")
    check(directory.mkdirs() || directory.isDirectory) { "Cannot create private recording directory" }
    // Only module-owned orphan files in this account's directory; no recursive deletion.
    directory.listFiles()?.filter { it.isFile && it.name.matches(Regex("^[a-f0-9-]{36}\\.wav(\\.part)?$")) }?.forEach { it.delete() }
    val bufferSize = AudioRecord.getMinBufferSize(WavHeader.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    check(bufferSize > 0) { "16 kHz mono PCM recording is unsupported on this device" }
    val record = AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.MIC)
      .setAudioFormat(AudioFormat.Builder().setSampleRate(WavHeader.SAMPLE_RATE).setChannelMask(AudioFormat.CHANNEL_IN_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
      .setBufferSizeInBytes(maxOf(bufferSize, 6400)).build()
    if (record.state != AudioRecord.STATE_INITIALIZED) { record.release(); error("Cannot initialize PCM recorder") }
    val id = UUID.randomUUID().toString()
    val session = Recording(id, record, File(directory, "$id.wav.part"), File(directory, "$id.wav"))
    session.worker = Thread({ capture(session) }, "metrivum-voice")
    current = session
    try { record.startRecording(); session.worker.start() }
    catch (failure: Exception) { session.running = false; record.release(); current = null; throw failure }
    return status(session)
  }

  private fun capture(session: Recording) {
    try {
      val started = SystemClock.elapsedRealtime()
      val samples = ShortArray(1600)
      val pcm = ByteArray(samples.size * 2)
      RandomAccessFile(session.partial, "rw").use { output ->
        output.write(WavHeader.create(0))
        while (session.running && session.bytes < WavHeader.MAX_DATA_BYTES && SystemClock.elapsedRealtime() - started < 300000) {
          val count = session.record.read(samples, 0, samples.size, AudioRecord.READ_BLOCKING)
          if (!session.running) break
          check(count > 0) { "Microphone read failed ($count)" }
          val accepted = min(count, (WavHeader.MAX_DATA_BYTES - session.bytes) / 2)
          var peak = 0
          for (index in 0 until accepted) {
            val value = samples[index].toInt()
            pcm[index * 2] = (value and 255).toByte()
            pcm[index * 2 + 1] = ((value shr 8) and 255).toByte()
            peak = maxOf(peak, abs(value))
          }
          output.write(pcm, 0, accepted * 2)
          session.bytes += accepted * 2
          session.meter = peak / 32768.0
        }
        if (!session.discard && session.bytes > 0) {
          output.seek(0); output.write(WavHeader.create(session.bytes)); output.fd.sync()
        }
      }
      if (!session.discard && session.bytes == 0) session.error = "No audio was captured; try recording again"
      if (!session.discard && session.bytes > 0) {
        check(session.partial.renameTo(session.output)) { "Cannot finalize recording" }
        session.ready = true
      }
    } catch (failure: Exception) {
      session.error = failure.message ?: "Recording failed"
    } finally {
      session.running = false
      try { session.record.stop() } catch (_: IllegalStateException) { }
      session.record.release()
      if (session.discard || session.error != null || !session.ready) {
        session.partial.delete(); session.output.delete(); session.ready = false
      }
    }
  }

  private fun requestStop(session: Recording) {
    session.running = false
    try { session.record.stop() } catch (_: IllegalStateException) { }
  }

  private fun requireSession(id: String): Recording = current?.takeIf { it.id == id }
    ?: error("Recording session is no longer current")

  @Synchronized private fun finish(id: String, discard: Boolean): Map<String, Any?> {
    val session = requireSession(id)
    if (discard) session.discard = true
    requestStop(session)
    session.worker.join(3000)
    check(!session.worker.isAlive) { "Recorder is still stopping; retry before starting another recording" }
    if (discard) { session.partial.delete(); session.output.delete(); session.ready = false }
    return status(session)
  }

  private fun status(session: Recording): Map<String, Any?> = mapOf(
    "id" to session.id,
    "recording" to session.worker.isAlive,
    "durationMillis" to session.bytes * 1000L / (WavHeader.SAMPLE_RATE * 2),
    "meter" to session.meter,
    "uri" to if (session.ready && !session.discard) Uri.fromFile(session.output).toString() else null,
    "error" to session.error
  )
}
