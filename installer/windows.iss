; Inno Setup script for LocalMusic and Video (built by .github/workflows/build.yml on the Windows runner).
; It installs the folder that PyInstaller produced (dist\LocalMusicAndVideo) and starts the app from the SAME folder name.
#define AppName "LocalMusic and Video"
#define AppExe  "LocalMusicAndVideo.exe"
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{B7E6C1B2-6D3A-4C0E-9E57-4C1E0D0A1F10}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=CrispySoft
DefaultDirName={autopf}\LocalMusicAndVideo
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=LocalMusicAndVideo-Windows-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
; per-user install by default (no administrator needed; the app can write its data.db and downloads next to itself)
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
UninstallDisplayIcon={app}\{#AppExe}

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Files]
Source: "..\dist\LocalMusicAndVideo\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Start {#AppName}"; Flags: nowait postinstall skipifsilent
