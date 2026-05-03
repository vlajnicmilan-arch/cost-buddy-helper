@echo off
REM ============================================================
REM  V&M Balance - One-click Android Debug APK build (Windows)
REM ============================================================
setlocal enabledelayedexpansion

echo.
echo ========================================
echo   V^&M Balance - Build APK
echo ========================================
echo.

echo [1/5] npm install...
call npm install --legacy-peer-deps
if errorlevel 1 goto :error

echo.
echo [2/5] Vite build...
call npm run build
if errorlevel 1 goto :error

echo.
echo [3/5] Capacitor sync (android)...
call npx cap sync android
if errorlevel 1 goto :error

echo.
echo [4/5] Gradle clean + assembleDebug...
pushd android
call gradlew.bat clean assembleDebug
if errorlevel 1 (
    popd
    goto :error
)
popd

echo.
echo [5/5] Copying APK to project root...
set APK_SRC=android\app\build\outputs\apk\debug\app-debug.apk
if not exist "%APK_SRC%" (
    echo APK not found at %APK_SRC%
    goto :error
)
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value ^| find "="') do set DT=%%I
set STAMP=%DT:~0,8%-%DT:~8,4%
copy /Y "%APK_SRC%" "vmbalance-debug-%STAMP%.apk" >nul

echo.
echo ========================================
echo   DONE: vmbalance-debug-%STAMP%.apk
echo ========================================
pause
exit /b 0

:error
echo.
echo ========================================
echo   BUILD FAILED
echo ========================================
pause
exit /b 1
