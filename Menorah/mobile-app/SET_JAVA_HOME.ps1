# PowerShell script to set JAVA_HOME permanently
# Run this as Administrator

$jdkPath = "C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot"

# Check if JDK exists
if (Test-Path $jdkPath) {
    Write-Host "JDK found at: $jdkPath" -ForegroundColor Green
    
    # Set JAVA_HOME system environment variable
    [System.Environment]::SetEnvironmentVariable("JAVA_HOME", $jdkPath, [System.EnvironmentVariableTarget]::Machine)
    
    # Add to PATH if not already there
    $currentPath = [System.Environment]::GetEnvironmentVariable("Path", [System.EnvironmentVariableTarget]::Machine)
    $jdkBinPath = "$jdkPath\bin"
    
    if ($currentPath -notlike "*$jdkBinPath*") {
        $newPath = "$currentPath;$jdkBinPath"
        [System.Environment]::SetEnvironmentVariable("Path", $newPath, [System.EnvironmentVariableTarget]::Machine)
        Write-Host "Added JDK to PATH" -ForegroundColor Green
    } else {
        Write-Host "JDK already in PATH" -ForegroundColor Yellow
    }
    
    Write-Host "JAVA_HOME set successfully!" -ForegroundColor Green
    Write-Host "Please close and reopen your terminal for changes to take effect." -ForegroundColor Yellow
} else {
    Write-Host "ERROR: JDK not found at: $jdkPath" -ForegroundColor Red
    Write-Host "Please verify the JDK installation path." -ForegroundColor Red
}

