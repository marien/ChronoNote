@echo off
title ChronoNote Android Emulator
echo ========================================================
echo   Starting ChronoNote Android Emulator
echo ========================================================
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "EMULATOR=%ANDROID_HOME%\emulator\emulator.exe"
set "ADB=%ANDROID_HOME%\platform-tools\adb.exe"
set "APK_X86=%~dp0src-tauri\gen\android\app\build\outputs\apk\x86_64\debug\app-x86_64-debug.apk"
set "APK_UNI=%~dp0src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk"

start "" "%EMULATOR%" -avd ChronoNote_Emulator

echo Waiting for virtual phone to start...
"%ADB%" wait-for-device

echo Waiting for Android to finish booting...
:wait_boot
for /f "tokens=*" %%a in ('"%ADB%" shell getprop sys.boot_completed 2^>nul') do set "BOOT=%%a"
if not "%BOOT%"=="1" (
    timeout /t 2 /nobreak >nul
    goto wait_boot
)

echo.
echo Installing latest ChronoNote APK...
if exist "%APK_X86%" (
    echo Installing: %APK_X86%
    "%ADB%" install -r "%APK_X86%"
) else if exist "%APK_UNI%" (
    echo Installing: %APK_UNI%
    "%ADB%" install -r "%APK_UNI%"
) else (
    echo Warning: No APK found. Launching existing installation...
)

echo.
echo Launching ChronoNote...
"%ADB%" shell am start -n com.chrononote.app/.MainActivity
echo.
echo ========================================================
echo   ChronoNote is now running in the emulator window!
echo   You can keep this window open or close it.
echo ========================================================
timeout /t 10
