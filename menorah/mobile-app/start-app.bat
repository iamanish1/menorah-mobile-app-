@echo off
echo Menorah Health App - Startup Options
echo ===================================
echo.
echo Choose an option:
echo 1. Start with Tunnel (Recommended for network issues)
echo 2. Start with Localhost (Same WiFi network)
echo 3. Start with LAN (Local network)
echo 4. Start with Web (Browser)
echo 5. Clear cache and start
echo 6. Exit
echo.
set /p choice="Enter your choice (1-6): "

if "%choice%"=="1" (
    echo Starting with tunnel mode...
    npx expo start --tunnel
) else if "%choice%"=="2" (
    echo Starting with localhost mode...
    npx expo start --localhost
) else if "%choice%"=="3" (
    echo Starting with LAN mode...
    npx expo start --lan
) else if "%choice%"=="4" (
    echo Starting web version...
    npx expo start --web
) else if "%choice%"=="5" (
    echo Clearing cache and starting...
    npx expo start --clear
) else if "%choice%"=="6" (
    echo Exiting...
    exit
) else (
    echo Invalid choice. Please run the script again.
    pause
)
