# Build AAB Script for Menorah Health App
# This script helps build an Android App Bundle (AAB) file

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Menorah Health - AAB Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "Error: package.json not found. Please run this script from the mobile-app directory." -ForegroundColor Red
    exit 1
}

Write-Host "Select build method:" -ForegroundColor Yellow
Write-Host "1. EAS Build (Cloud - Recommended)" -ForegroundColor Green
Write-Host "2. Local Build (Requires Android SDK and Gradle)" -ForegroundColor Green
Write-Host ""
$choice = Read-Host "Enter your choice (1 or 2)"

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "Building with EAS Build..." -ForegroundColor Cyan
    Write-Host ""
    
    # Check if EAS CLI is installed
    $easInstalled = Get-Command eas -ErrorAction SilentlyContinue
    if (-not $easInstalled) {
        Write-Host "EAS CLI not found. Installing..." -ForegroundColor Yellow
        npm install -g eas-cli
    }
    
    # Check if logged in
    Write-Host "Checking EAS login status..." -ForegroundColor Yellow
    $loginStatus = eas whoami 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Not logged in to EAS. Please login:" -ForegroundColor Yellow
        eas login
    }
    
    Write-Host ""
    Write-Host "Starting production build..." -ForegroundColor Cyan
    Write-Host "This will build an AAB file in the cloud." -ForegroundColor Yellow
    Write-Host ""
    
    eas build --platform android --profile production
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Build completed successfully!" -ForegroundColor Green
        Write-Host "Check the output above for the download link." -ForegroundColor Green
        Write-Host ""
        Write-Host "To download the build later, use:" -ForegroundColor Yellow
        Write-Host "  eas build:list" -ForegroundColor White
        Write-Host "  eas build:download [BUILD_ID]" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "Build failed. Check the error messages above." -ForegroundColor Red
    }
    
} elseif ($choice -eq "2") {
    Write-Host ""
    Write-Host "Building locally..." -ForegroundColor Cyan
    Write-Host ""
    
    # Check if Android directory exists
    if (-not (Test-Path "android")) {
        Write-Host "Error: android directory not found." -ForegroundColor Red
        Write-Host "Run 'npx expo prebuild --platform android' first." -ForegroundColor Yellow
        exit 1
    }
    
    # Check if gradlew exists
    if (-not (Test-Path "android\gradlew.bat")) {
        Write-Host "Error: gradlew.bat not found in android directory." -ForegroundColor Red
        exit 1
    }
    
    # Check for keystore configuration
    Write-Host "Checking keystore configuration..." -ForegroundColor Yellow
    $gradleProps = "android\gradle.properties"
    if (Test-Path $gradleProps) {
        $propsContent = Get-Content $gradleProps -Raw
        if ($propsContent -notmatch "MYAPP_RELEASE_STORE_FILE") {
            Write-Host ""
            Write-Host "Warning: Release keystore not configured!" -ForegroundColor Yellow
            Write-Host "The build will use debug signing (not suitable for Play Store)." -ForegroundColor Yellow
            Write-Host ""
            $continue = Read-Host "Continue anyway? (y/n)"
            if ($continue -ne "y") {
                Write-Host "Build cancelled." -ForegroundColor Yellow
                exit 0
            }
        }
    } else {
        Write-Host "Warning: gradle.properties not found. Using debug signing." -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Building AAB..." -ForegroundColor Cyan
    Write-Host "This may take several minutes..." -ForegroundColor Yellow
    Write-Host ""
    
    Set-Location android
    .\gradlew.bat bundleRelease
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Build completed successfully!" -ForegroundColor Green
        $aabPath = "app\build\outputs\bundle\release\app-release.aab"
        if (Test-Path $aabPath) {
            $fullPath = (Resolve-Path $aabPath).Path
            Write-Host ""
            Write-Host "AAB file location:" -ForegroundColor Green
            Write-Host $fullPath -ForegroundColor White
            Write-Host ""
            Write-Host "File size: $((Get-Item $aabPath).Length / 1MB) MB" -ForegroundColor Cyan
        } else {
            Write-Host "Warning: AAB file not found at expected location." -ForegroundColor Yellow
        }
    } else {
        Write-Host ""
        Write-Host "Build failed. Check the error messages above." -ForegroundColor Red
    }
    
    Set-Location ..
    
} else {
    Write-Host "Invalid choice. Exiting." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green

