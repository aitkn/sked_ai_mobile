#!/bin/bash

# Script to set up Android SDK paths for WSL

echo "Setting up Android SDK paths for WSL..."

# Get Windows username
read -p "Enter your Windows username: " WINDOWS_USER

# Set up environment variables
echo "" >> ~/.bashrc
echo "# Android SDK Configuration for WSL" >> ~/.bashrc
echo "export ANDROID_HOME=/mnt/c/Users/$WINDOWS_USER/AppData/Local/Android/Sdk" >> ~/.bashrc
echo "export PATH=\$PATH:\$ANDROID_HOME/platform-tools" >> ~/.bashrc
echo "export PATH=\$PATH:\$ANDROID_HOME/tools" >> ~/.bashrc
echo "export PATH=\$PATH:\$ANDROID_HOME/tools/bin" >> ~/.bashrc
echo "export PATH=\$PATH:\$ANDROID_HOME/emulator" >> ~/.bashrc

echo "Configuration added to ~/.bashrc"
echo ""
echo "Next steps:"
echo "1. Install Android Studio on Windows (if not already installed)"
echo "2. Run: source ~/.bashrc"
echo "3. Test with: adb --version"
echo ""
echo "For Expo development:"
echo "- You can use 'npm start' and scan QR code with Expo Go"
echo "- Or use 'npm run android' if you have a device connected via USB"