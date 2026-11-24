package com.quran.qasas

import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.concurrent.Executors

@CapacitorPlugin(name = "SherpaAsr")
class SherpaAsrPlugin : Plugin() {
    private val executor = Executors.newSingleThreadExecutor()
    private var recognizer: OnlineRecognizer? = null
    private var activeStream: OnlineStream? = null
    private var activeSampleRate: Int = 16000
    private var lastPartialText: String = ""

    private fun rootDir(): File = File(context.filesDir, "sherpa-asr")
    private fun modelDir(): File = File(rootDir(), "model")
    private fun markerFile(): File = File(rootDir(), "verified.sha256")

    private fun findModelFiles(dir: File): Map<String, File>? {
        if (!dir.exists() || !dir.isDirectory) return null
        val files = dir.walkTopDown().filter { it.isFile }.toList()
        val tokens = files.firstOrNull { it.name == "tokens.txt" } ?: return null
        val encoder = files.firstOrNull { it.name.contains("encoder") && it.name.endsWith(".int8.onnx") }
            ?: files.firstOrNull { it.name.contains("encoder") && it.name.endsWith(".onnx") }
            ?: return null
        val decoder = files.firstOrNull { it.name.contains("decoder") && it.name.endsWith(".onnx") }
            ?: return null
        val joiner = files.firstOrNull { it.name.contains("joiner") && it.name.endsWith(".int8.onnx") }
            ?: files.firstOrNull { it.name.contains("joiner") && it.name.endsWith(".onnx") }
            ?: return null
        return mapOf(
            "tokens" to tokens,
            "encoder" to encoder,
            "decoder" to decoder,
            "joiner" to joiner,
        )
    }

    private fun isModelVerified(): Boolean {
        val marker = markerFile()
        if (!marker.exists()) return false
        return findModelFiles(modelDir()) != null
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        call.resolve(JSObject().put("available", true))
    }

    @PluginMethod
    fun getModelStatus(call: PluginCall) {
        val installed = isModelVerified()
        val sha = if (installed && markerFile().exists()) markerFile().readText().trim() else null
        val sizeBytes = if (installed) {
            modelDir().walkTopDown().filter { it.isFile }.sumOf { it.length() }
        } else 0L
        val ret = JSObject()
        ret.put("installed", installed)
        if (sha != null) ret.put("sha256", sha)
        ret.put("sizeBytes", sizeBytes)
        call.resolve(ret)
    }

    @PluginMethod
    fun downloadModel(call: PluginCall) {
        val urlStr = call.getString("url")
        val expectedSha = call.getString("sha256")?.lowercase()?.trim()
        if (urlStr.isNullOrBlank() || expectedSha.isNullOrBlank()) {
            call.reject("Missing url or sha256")
            return
        }

        executor.execute {
            val baseDir = rootDir()
            baseDir.mkdirs()
            val archiveFile = File(baseDir, "download.tmp.tar.bz2")
            val stagingDir = File(baseDir, "staging")

            try {
                if (archiveFile.exists()) archiveFile.delete()
                if (stagingDir.exists()) stagingDir.deleteRecursively()
                stagingDir.mkdirs()

                val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20000
                    readTimeout = 60000
                    instanceFollowRedirects = true
                }
                conn.connect()
                if (conn.responseCode !in 200..299) {
                    throw RuntimeException("HTTP ${conn.responseCode}")
                }
                val totalBytes = conn.contentLengthLong
                val digest = MessageDigest.getInstance("SHA-256")
                var loadedBytes = 0L
                var lastEmitAt = 0L

                conn.inputStream.use { input ->
                    FileOutputStream(archiveFile).use { output ->
                        val buffer = ByteArray(32768)
                        while (true) {
                            val n = input.read(buffer)
                            if (n <= 0) break
                            output.write(buffer, 0, n)
                            digest.update(buffer, 0, n)
                            loadedBytes += n
                            val now = System.currentTimeMillis()
                            if (now - lastEmitAt >= 300) {
                                lastEmitAt = now
                                notifyListeners(
                                    "downloadProgress",
                                    JSObject().put("loaded", loadedBytes).put("total", totalBytes),
                                )
                            }
                        }
                    }
                }

                val actualSha = digest.digest().joinToString("") { "%02x".format(it) }
                if (actualSha != expectedSha) {
                    archiveFile.delete()
                    stagingDir.deleteRecursively()
                    call.reject("SHA-256 mismatch: expected $expectedSha, got $actualSha")
                    return@execute
                }

                // استخراج امن آرشیو tar.bz2 با بررسی مسیر (جلوگیری از ZipSlip)
                val stagingCanonical = stagingDir.canonicalPath
                FileInputStream(archiveFile).use { fis ->
                    BufferedInputStream(fis).use { bis ->
                        BZip2CompressorInputStream(bis).use { bzis ->
                            TarArchiveInputStream(bzis).use { tais ->
                                while (true) {
                                    val entry = tais.nextEntry ?: break
                                    val target = File(stagingDir, entry.name)
                                    if (!target.canonicalPath.startsWith(stagingCanonical + File.separator)) {
                                        throw SecurityException("Invalid tar entry path: ${entry.name}")
                                    }
                                    if (entry.isDirectory) {
                                        target.mkdirs()
                                    } else {
                                        target.parentFile?.mkdirs()
                                        FileOutputStream(target).use { out ->
                                            tais.copyTo(out)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                archiveFile.delete()

                if (findModelFiles(stagingDir) == null) {
                    stagingDir.deleteRecursively()
                    call.reject("Extracted archive does not contain required ONNX transducer files")
                    return@execute
                }

                releaseRecognizer()
                val dest = modelDir()
                if (dest.exists()) dest.deleteRecursively()
                if (!stagingDir.renameTo(dest)) {
                    stagingDir.copyRecursively(dest, overwrite = true)
                    stagingDir.deleteRecursively()
                }
                markerFile().writeText(actualSha)

                notifyListeners(
                    "downloadProgress",
                    JSObject().put("loaded", loadedBytes).put("total", totalBytes),
                )
                call.resolve(JSObject().put("installed", true).put("sha256", actualSha))
            } catch (e: Exception) {
                archiveFile.delete()
                stagingDir.deleteRecursively()
                call.reject("Model download failed: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun deleteModel(call: PluginCall) {
        executor.execute {
            try {
                releaseRecognizer()
                val dir = rootDir()
                if (dir.exists()) dir.deleteRecursively()
                call.resolve(JSObject().put("deleted", true))
            } catch (e: Exception) {
                call.reject("Failed to delete model: ${e.message}", e)
            }
        }
    }

    @Synchronized
    private fun ensureRecognizer(sampleRate: Int): OnlineRecognizer {
        recognizer?.let { return it }
        if (!isModelVerified()) {
            throw IllegalStateException("Offline ASR model is not installed or verified")
        }
        val files = findModelFiles(modelDir())
            ?: throw IllegalStateException("Offline ASR model files missing")

        val transducer = OnlineTransducerModelConfig(
            encoder = files.getValue("encoder").absolutePath,
            decoder = files.getValue("decoder").absolutePath,
            joiner = files.getValue("joiner").absolutePath,
        )
        val modelConfig = OnlineModelConfig(
            transducer = transducer,
            tokens = files.getValue("tokens").absolutePath,
            numThreads = 2,
            provider = "cpu",
            modelType = "zipformer2",
        )
        val config = OnlineRecognizerConfig(
            featConfig = FeatureConfig(sampleRate = sampleRate, featureDim = 80),
            modelConfig = modelConfig,
            enableEndpoint = true,
            decodingMethod = "greedy_search",
        )
        val rec = OnlineRecognizer(assetManager = null, config = config)
        recognizer = rec
        return rec
    }

    @Synchronized
    private fun releaseRecognizer() {
        try {
            activeStream?.release()
        } catch (_: Exception) {
        }
        activeStream = null
        try {
            recognizer?.release()
        } catch (_: Exception) {
        }
        recognizer = null
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val sampleRate = call.getInt("sampleRate") ?: 16000
        // دریافت اختیاری hotwords (بخش ۴): مدل چندزبانهٔ فعلی بدون فایل BPE vocab روی greedy_search اجرا می‌شود؛
        // بنابراین آرایهٔ hotwords دریافت ولی بی‌سروصدا نادیده گرفته می‌شود تا خطایی در ایجاد استریم رخ ندهد.
        val _hotwords = call.getArray("hotwords")
        executor.execute {
            try {
                val rec = ensureRecognizer(sampleRate)
                activeStream?.release()
                activeStream = rec.createStream()
                activeSampleRate = sampleRate
                lastPartialText = ""
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to start Sherpa ASR: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun feed(call: PluginCall) {
        val b64 = call.getString("samplesBase64")
        if (b64.isNullOrEmpty()) {
            call.resolve()
            return
        }
        executor.execute {
            try {
                val rec = recognizer ?: throw IllegalStateException("Sherpa ASR not started")
                val stream = activeStream ?: throw IllegalStateException("Sherpa stream not active")
                val bytes = Base64.decode(b64, Base64.DEFAULT)
                val shortCount = bytes.size / 2
                if (shortCount > 0) {
                    val bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
                    val floats = FloatArray(shortCount)
                    for (i in 0 until shortCount) {
                        floats[i] = bb.short.toFloat() / 32768.0f
                    }
                    stream.acceptWaveform(floats, activeSampleRate)
                    while (rec.isReady(stream)) {
                        rec.decode(stream)
                    }
                    val text = rec.getResult(stream).text.trim()
                    if (text.isNotEmpty() && text != lastPartialText) {
                        lastPartialText = text
                        notifyListeners("partial", JSObject().put("text", text))
                    }
                }
                call.resolve()
            } catch (e: Exception) {
                call.reject("Sherpa feed failed: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        executor.execute {
            try {
                val rec = recognizer
                val stream = activeStream
                var text = lastPartialText
                if (rec != null && stream != null) {
                    stream.inputFinished()
                    while (rec.isReady(stream)) {
                        rec.decode(stream)
                    }
                    text = rec.getResult(stream).text.trim().ifEmpty { lastPartialText }
                    stream.release()
                }
                activeStream = null
                lastPartialText = ""
                call.resolve(JSObject().put("text", text))
            } catch (e: Exception) {
                activeStream = null
                call.reject("Sherpa stop failed: ${e.message}", e)
            }
        }
    }

    override fun handleOnDestroy() {
        releaseRecognizer()
        executor.shutdownNow()
        super.handleOnDestroy()
    }
}
