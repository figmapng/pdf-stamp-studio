; Inno Setup script: installs PDF Stamp Studio for the current user (no admin rights needed).
; Built in CI: ISCC.exe installer\PdfStampStudio.iss  ->  release\PdfStampStudioSetup.exe

#define AppName "PDF Stamp Studio"
#define AppExe "PdfStampStudio.exe"

[Setup]
AppId={{FF2E2A85-0AAC-4142-9150-BA9E8D8F848C}
AppName={#AppName}
AppVersion=1.0
AppPublisher=PDF Stamp Studio
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=PdfStampStudioSetup
SetupIconFile=..\tools\desktop-app\app.ico
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; GroupDescription: "Ярлыки:"

[Files]
Source: "..\build_out\PdfStampStudio\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Запустить {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; remove the Excel button together with the program
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\_internal\tools\excel-stamp-addin\install.ps1"" -Uninstall"; Flags: runhidden; RunOnceId: "RemoveExcelAddin"
