# Java/JDK Setup Guide for Android Build

## The Error
```
No Java compiler found, please ensure you are running Gradle with a JDK
```

## Why This Happens
- React Native Android builds require **JDK 17 or higher** (not just JRE)
- Gradle needs a **Java Development Kit (JDK)**, not just Java Runtime (JRE)
- `JAVA_HOME` environment variable must point to the JDK

## Solution: Install JDK 17+

### Option 1: Install JDK 17 (Recommended - Easiest)

1. **Download JDK 17:**
   - Go to: https://adoptium.net/temurin/releases/?version=17
   - Download: **Windows x64 JDK** (`.msi` installer)
   - Or use: https://www.oracle.com/java/technologies/downloads/#java17

2. **Install JDK:**
   - Run the installer
   - Install to default location: `C:\Program Files\Java\jdk-17` (or similar)

3. **Set JAVA_HOME Environment Variable:**
   
   **Windows:**
   - Press `Win + X` → System → Advanced system settings
   - Click "Environment Variables"
   - Under "System variables", click "New"
   - Variable name: `JAVA_HOME`
   - Variable value: `C:\Program Files\Java\jdk-17` (or your JDK path)
   - Click OK
   
   - Find "Path" in System variables, click "Edit"
   - Add new entry: `%JAVA_HOME%\bin`
   - Click OK on all dialogs

4. **Verify Installation:**
   ```powershell
   # Open new PowerShell window (important!)
   java -version
   # Should show: openjdk version "17.x.x"
   
   echo $env:JAVA_HOME
   # Should show: C:\Program Files\Java\jdk-17
   ```

5. **Try Build Again:**
   ```bash
   cd Menorah/mobile-app
   npx expo run:android
   ```

### Option 2: Use Android Studio's Bundled JDK

If you have Android Studio installed:

1. **Find Android Studio's JDK:**
   - Usually located at: `C:\Program Files\Android\Android Studio\jbr`
   - Or: `C:\Users\YourName\AppData\Local\Android\Android Studio\jbr`

2. **Set JAVA_HOME to Android Studio's JDK:**
   - Follow Step 3 from Option 1
   - Set `JAVA_HOME` to the `jbr` folder path

3. **Or configure in gradle.properties:**
   - Open `Menorah/mobile-app/android/gradle.properties`
   - Uncomment and set:
   ```properties
   org.gradle.java.home=C:\\Program Files\\Android\\Android Studio\\jbr
   ```
   (Use double backslashes `\\` in the path)

### Option 3: Quick Fix - Set in gradle.properties

If you have JDK installed somewhere:

1. Find your JDK installation:
   ```powershell
   Get-ChildItem "C:\Program Files\Java" -Directory
   ```

2. Edit `Menorah/mobile-app/android/gradle.properties`:
   ```properties
   org.gradle.java.home=C:\\Program Files\\Java\\jdk-17
   ```
   (Replace with your actual JDK path, use double backslashes)

## Verify Setup

After setting up JDK:

```powershell
# Check Java version (should be 17+)
java -version

# Check JAVA_HOME
echo $env:JAVA_HOME

# Check if javac (compiler) exists
javac -version
```

## Common Issues

### Issue: "java -version still shows Java 8"
**Solution:** 
- Close and reopen PowerShell/terminal
- Check PATH variable - JDK 17 bin should come before Java 8
- Verify JAVA_HOME points to JDK 17

### Issue: "javac: command not found"
**Solution:**
- You installed JRE, not JDK
- Install JDK 17 (not JRE)
- JDK includes both `java` and `javac`

### Issue: "Gradle still can't find JDK"
**Solution:**
- Set `org.gradle.java.home` in `gradle.properties` directly
- Use absolute path with double backslashes: `C:\\Program Files\\Java\\jdk-17`
- Restart terminal and try again

## After Setup

Once JDK 17+ is installed and configured:

```bash
cd Menorah/mobile-app
npx expo run:android
```

The build should now proceed past the Java error!

