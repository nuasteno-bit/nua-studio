{
  "name": "nua-subtitle-viewer",
  "version": "1.0.0",
  "description": "NUA STENO Live Subtitle Viewer",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder",
    "dist:win": "electron-builder --win",
    "dist:mac": "electron-builder --mac",
    "dist:linux": "electron-builder --linux",
    "postinstall": "electron-builder install-app-deps"
  },
  "keywords": [
    "subtitle",
    "viewer",
    "nua",
    "steno",
    "livesteno",
    "real-time",
    "captions"
  ],
  "author": "NUA STUDIO",
  "license": "ISC",
  "devDependencies": {
    "electron": "^27.0.0",
    "electron-builder": "^24.6.4"
  },
  "build": {
    "appId": "com.nua.subtitle.viewer",
    "productName": "NUA Subtitle Viewer",
    "directories": {
      "output": "dist"
    },
    "protocols": [
      {
        "name": "NUA Viewer Protocol",
        "schemes": ["nuaviewer"]
      }
    ],
    "files": [
      "**/*",
      "!dist/**/*",
      "!.git/**/*",
      "!.gitignore",
      "!README.md"
    ],
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64", "ia32"]
        },
        {
          "target": "portable",
          "arch": ["x64"]
        }
      ],
      "icon": "final_logo.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "installerIcon": "final_logo.ico",
      "uninstallerIcon": "final_logo.ico",
      "installerHeaderIcon": "final_logo.ico",
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "NUA Subtitle Viewer",
      "perMachine": false,
      "deleteAppDataOnUninstall": true
    },
    "portable": {
      "artifactName": "${productName}-Portable-${version}.${ext}"
    },
    "mac": {
      "category": "public.app-category.utilities",
      "icon": "final_logo.icns",
      "hardenedRuntime": true,
      "gatekeeperAssess": false
    },
    "linux": {
      "target": [
        "AppImage",
        "deb"
      ],
      "category": "Utility",
      "icon": "final_logo.png"
    }
  }
}
