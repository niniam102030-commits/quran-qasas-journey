package com.quran.qasas

import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineStream
import com.k2fsa.sherpa.onnx.OfflineZipformerCtcModelConfig
import java.io.File
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
    private val downloadExecutor = Executors.newSingleThreadExecutor()
    private var recognizer: OfflineRecognizer? = null
    private var activeStream: OfflineStream? = null
    private var activeSampleRate: Int = 16000
    // مدل قرآنی جدید CTC آفلاین است (نه جریانی): نمونههای هر تکه در حافظه
    // جمع میشوند و در stop() یکجا دیکود میشوند؛ رویداد partial وجود ندارد.
    private val pendingSamples = mutableListOf<Float>()

    private fun rootDir(): File = File(context.filesDir, "sherpa-asr")
    private fun modelDir(): File = File(rootDir(), "model")
    private fun markerFile(): File = File(rootDir(), "verified.sha256")

    private fun findModelFiles(dir: File): Map<String, File>? {
        if (!dir.exists() || !dir.isDirectory) return null
        val files = dir.walkTopDown().filter { it.isFile }.toList()
        val tokens = files.firstOrNull { it.name == "tokens.txt" } ?: return null
        // مدل قرآنی Abdou/quran-asr-small: یک فایل CTC واحد + فایل توکنها
        val model = files.firstOrNull { it.name == "model.int8.onnx" } ?: return null
        return mapOf(
            "tokens" to tokens,
            "model" to model,
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
        // دانلود چندفایلی با راستیآزمایی تکتک فایلها: جاوااسکریپت برای هر
        // فایل {name, url, sha256} میفرستد و هش هر فایل همان SHA-256 رسمی
        // مخزن است. هر فایل جدا دانلود و هنگام نوشتن هش میشود؛ کوچکترین
        // عدم تطابق کل نصب را لغو میکند. نصب اتمیک است: اول در staging
        // کامل میشود، بعد یکجا جایگزین میشود و در پایان لود آزمایشی
        // تشخیصدهنده انجام میشود؛ installed فقط وقتی true است که مدل با
        // همین فایلها واقعاً لود شده باشد.
        val filesArr = call.getArray("files")
        val totalBytes = call.getDouble("totalBytes")?.toLong() ?: -1L
        if (filesArr == null || filesArr.length() == 0) {
            call.reject("Missing files manifest")
            return
        }
        data class ModelFileSpec(val name: String, val url: String, val sha256: String)
        val specs = mutableListOf<ModelFileSpec>()
        for (i in 0 until filesArr.length()) {
            val obj = filesArr.optJSONObject(i)
            val name = obj?.optString("name")
            val fileUrl = obj?.optString("url")
            val sha = obj?.optString("sha256")?.lowercase()?.trim()
            if (name.isNullOrBlank() || fileUrl.isNullOrBlank() || sha.isNullOrBlank()) {
                call.reject("Invalid file entry in manifest")
                return
            }
            specs.add(ModelFileSpec(name, fileUrl, sha))
        }

        downloadExecutor.execute {
            val baseDir = rootDir()
            baseDir.mkdirs()
            val stagingDir = File(baseDir, "staging")
            try {
                if (stagingDir.exists()) stagingDir.deleteRecursively()
                stagingDir.mkdirs()

                var completedBytes = 0L
                var lastEmitAt = 0L
                var modelSha = ""
                for (spec in specs) {
                    val target = File(stagingDir, spec.name)
                    target.parentFile?.mkdirs()
                    val conn = (URL(spec.url).openConnection() as HttpURLConnection).apply {
                        connectTimeout = 20000
                        readTimeout = 60000
                        instanceFollowRedirects = true
                    }
                    conn.connect()
                    if (conn.responseCode !in 200..299) {
                        throw RuntimeException("HTTP ${conn.responseCode} for ${spec.name}")
                    }
                    val digest = MessageDigest.getInstance("SHA-256")
                    conn.inputStream.use { input ->
                        FileOutputStream(target).use { output ->
                            val buffer = ByteArray(32768)
                            while (true) {
                                val n = input.read(buffer)
                                if (n <= 0) break
                                output.write(buffer, 0, n)
                                digest.update(buffer, 0, n)
                                completedBytes += n
                                val now = System.currentTimeMillis()
                                if (now - lastEmitAt >= 300) {
                                    lastEmitAt = now
                                    notifyListeners(
                                        "downloadProgress",
                                        JSObject().put("loaded", completedBytes).put("total", totalBytes),
                                    )
                                }
                            }
                        }
                    }
                    val actualSha = digest.digest().joinToString("") { "%02x".format(it) }
                    if (actualSha != spec.sha256) {
                        throw RuntimeException("SHA-256 mismatch for ${spec.name}: expected ${spec.sha256}, got $actualSha")
                    }
                    if (spec.name.endsWith(".onnx")) modelSha = actualSha
                }

                if (findModelFiles(stagingDir) == null) {
                    throw RuntimeException("Downloaded files do not contain the required model files")
                }

                releaseRecognizer()
                val dest = modelDir()
                if (dest.exists()) dest.deleteRecursively()
                if (!stagingDir.renameTo(dest)) {
                    stagingDir.copyRecursively(dest, overwrite = true)
                    stagingDir.deleteRecursively()
                }
                markerFile().writeText(modelSha)

                // لود آزمایشی: «نصب شد» فقط وقتی اعلام میشود که تشخیصدهنده
                // با همین فایلها واقعاً ساخته شود.
                try {
                    ensureRecognizer(16000)
                } catch (e: Exception) {
                    if (dest.exists()) dest.deleteRecursively()
                    if (markerFile().exists()) markerFile().delete()
                    throw RuntimeException("Model files verified but recognizer failed to load: ${e.message}")
                }

                notifyListeners(
                    "downloadProgress",
                    JSObject().put("loaded", completedBytes).put("total", totalBytes),
                )
                call.resolve(JSObject().put("installed", true).put("sha256", modelSha))
            } catch (e: Exception) {
                if (stagingDir.exists()) stagingDir.deleteRecursively()
                call.reject("Model download failed: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun deleteModel(call: PluginCall) {
        downloadExecutor.execute {
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
    private fun ensureRecognizer(sampleRate: Int): OfflineRecognizer {
        recognizer?.let { return it }
        if (!isModelVerified()) {
            throw IllegalStateException("Offline ASR model is not installed or verified")
        }
        val files = findModelFiles(modelDir())
            ?: throw IllegalStateException("Offline ASR model files missing")

        val modelConfig = OfflineModelConfig(
            zipformerCtc = OfflineZipformerCtcModelConfig(
                model = files.getValue("model").absolutePath,
            ),
            tokens = files.getValue("tokens").absolutePath,
            numThreads = 2,
            provider = "cpu",
        )
        val config = OfflineRecognizerConfig(
            featConfig = FeatureConfig(sampleRate = sampleRate, featureDim = 80),
            modelConfig = modelConfig,
            decodingMethod = "greedy_search",
        )
        val rec = OfflineRecognizer(assetManager = null, config = config)
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
        // دریافت اختیاری hotwords: مدل CTC از hotwords پشتیبانی نمی‌کند؛
        // آرایه دریافت ولی نادیده گرفته می‌شود، چون تطبیق با آیهٔ هدف در
        // لایهٔ همترازی (سمت جاوااسکریپت) انجام می‌شود، نه داخل دیکودر.
        call.getArray("hotwords")
        executor.execute {
            try {
                val rec = ensureRecognizer(sampleRate)
                activeStream?.release()
                activeStream = rec.createStream()
                activeSampleRate = sampleRate
                synchronized(pendingSamples) { pendingSamples.clear() }
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
                    // مدل آفلاین است: نمونهها فقط در بافر جمع میشوند و در
                    // stop() یکجا دیکود میشوند؛ دیکود جریانی و رویداد
                    // partial برای این مدل وجود ندارد.
                    synchronized(pendingSamples) { pendingSamples.addAll(floats.toList()) }
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
                var text = ""
                if (rec != null && stream != null) {
                    val samples = synchronized(pendingSamples) {
                        val arr = FloatArray(pendingSamples.size) { pendingSamples[it] }
                        pendingSamples.clear()
                        arr
                    }
                    if (samples.isNotEmpty()) {
                        stream.acceptWaveform(samples, activeSampleRate)
                        rec.decode(stream)
                        // خروجی مدل، حروف عربی با جداکنندهی «▁» بین کلمههاست؛
                        // به فاصله تبدیل میشود تا متنِ کلمهبهکلمه به لایهی
                        // همترازی برسد.
                        text = rec.getResult(stream).text.replace("▁", " ").trim()
                    }
                    stream.release()
                }
                activeStream = null
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
