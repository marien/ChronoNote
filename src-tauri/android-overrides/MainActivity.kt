package com.chrononote.app

import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var webViewRef: WebView? = null
  private var insetsJson: String = """{"top":0,"right":0,"bottom":0,"left":0}"""

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Edge-to-edge draws the WebView under the system bars, and this
    // WebView reports `env(safe-area-inset-*)` as 0, so the app's top bar
    // used to sit underneath the status bar (and touches there never
    // reached it). Instead of padding the native view (which would show
    // the light window background as a white strip in dark mode), hand the
    // real insets — status bar, nav bar, cutout and the on-screen keyboard
    // — to the page as CSS variables, so the app's own themed background
    // paints under the system bars. Consumed so nothing double-applies.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { _, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime()
      )
      val d = resources.displayMetrics.density
      insetsJson = """{"top":${bars.top / d},"right":${bars.right / d},"bottom":${bars.bottom / d},"left":${bars.left / d}}"""
      pushInsets()
      WindowInsetsCompat.CONSUMED
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    webViewRef = webView
    webView.addJavascriptInterface(Bridge(), "ChronoNoteAndroid")
  }

  private fun pushInsets() {
    val js = "window.__applyAndroidInsets && window.__applyAndroidInsets($insetsJson)"
    webViewRef?.post { webViewRef?.evaluateJavascript(js, null) }
  }

  // Called from the page (src/lib/androidChrome.ts).
  inner class Bridge {
    @JavascriptInterface
    fun getInsets(): String = insetsJson

    // true = light app theme → dark status/nav bar icons; false = dark theme
    // → light icons. The app's theme is chosen in-app, so it can differ from
    // the system's own light/dark setting.
    @JavascriptInterface
    fun setSystemBarsLight(light: Boolean) {
      runOnUiThread {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = light
        controller.isAppearanceLightNavigationBars = light
      }
    }
  }
}
