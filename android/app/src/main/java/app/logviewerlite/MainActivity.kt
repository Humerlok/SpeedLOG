package app.logviewerlite

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewFeature

/**
 * Hosts the Speed Log web app in a WebView. The page is served from the APK assets through a
 * virtual https host, so no network access (and no INTERNET permission) is involved.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPng: ByteArray? = null

    // The web page's <input type="file"> is answered with the system document picker
    private val logPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        fileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        fileCallback = null
    }

    private val pngSaver = registerForActivityResult(ActivityResultContracts.CreateDocument("image/png")) { uri ->
        val bytes = pendingPng
        pendingPng = null
        if (uri == null || bytes == null) return@registerForActivityResult
        try {
            contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
            toast(R.string.png_saved)
        } catch (e: Exception) {
            toast(R.string.png_failed)
        }
    }

    // Files made by the Hardware Report (parameters, missions, log files): any type, the name carries the extension
    private var pendingFile: ByteArray? = null
    private val fileSaver = registerForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        val bytes = pendingFile
        pendingFile = null
        if (uri == null || bytes == null) return@registerForActivityResult
        try {
            contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
            toast(R.string.file_saved)
        } catch (e: Exception) {
            toast(R.string.file_failed)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val assets = WebViewAssetLoader.Builder()
            .setDomain(ASSET_HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        setContentView(web)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true // theme preference is kept in localStorage
            allowFileAccess = false
            allowContentAccess = false
            setSupportZoom(false) // pinch is for zooming the plots, not the page
            builtInZoomControls = false
        }
        // The page ships its own dark theme, do not let WebView darken it a second time
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(web.settings, false)
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assets.shouldInterceptRequest(request.url)

            // Nothing outside the bundled page is ever opened
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != ASSET_HOST
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: WebChromeClient.FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null) // answer a chooser that was never completed
                fileCallback = callback
                logPicker.launch(arrayOf("*/*")) // .bin has no reliable MIME type
                return true
            }
        }

        // Only the bundled page can load, so exposing the bridge to it is safe
        web.addJavascriptInterface(Bridge(), "AndroidBridge")

        web.loadUrl("https://$ASSET_HOST/assets/index.html")
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    private fun toast(message: Int) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()

    /** Called from the page (window.AndroidBridge) to save a plot image or a file. */
    private inner class Bridge {
        @JavascriptInterface
        fun saveFile(base64: String, name: String) {
            val bytes = try {
                Base64.decode(base64, Base64.DEFAULT)
            } catch (e: IllegalArgumentException) {
                null
            }
            runOnUiThread {
                if (bytes == null) {
                    toast(R.string.file_failed)
                    return@runOnUiThread
                }
                pendingFile = bytes
                fileSaver.launch(name.replace(Regex("[^A-Za-z0-9._-]"), "_"))
            }
        }

        @JavascriptInterface
        fun savePng(base64: String, name: String) {
            val bytes = try {
                Base64.decode(base64, Base64.DEFAULT)
            } catch (e: IllegalArgumentException) {
                null
            }
            // JavascriptInterface methods run on a background thread
            runOnUiThread {
                if (bytes == null) {
                    toast(R.string.png_failed)
                    return@runOnUiThread
                }
                pendingPng = bytes
                pngSaver.launch(name.replace(Regex("[^A-Za-z0-9._-]"), "_"))
            }
        }
    }

    private companion object {
        const val ASSET_HOST = "appassets.androidplatform.net"
    }
}
