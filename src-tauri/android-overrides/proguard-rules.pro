# Release builds shrink and rename code (R8). The WebView calls these by
# name from JavaScript (`window.ChronoNoteAndroid.getInsets()` /
# `.setSystemBarsLight()`), so they must survive untouched — otherwise the
# release app loses its status-bar theming and inset padding with no error.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.chrononote.app.MainActivity$Bridge { *; }
