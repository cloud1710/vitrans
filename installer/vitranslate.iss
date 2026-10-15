; ViTranslate helper installer (spec phase 5): per-user, no admin rights. Built by installer/build.ps1:
;   ISCC /DAppVersion=<x.y.z> /DDistDir=<PyInstaller dist\ViTranslate> /DOutputDir=<out\installer> vitranslate.iss
; UTF-8 with BOM (Vietnamese text). The helper's first run (vitranslate.setup) installs Ollama / the model.

#ifndef AppVersion
  #error AppVersion is required (/DAppVersion=x.y.z)
#endif
#ifndef DistDir
  #error DistDir is required (/DDistDir=<folder holding ViTranslate.exe>)
#endif
#ifndef OutputDir
  #define OutputDir "..\out\installer"
#endif

[Setup]
AppId={{C83C92BD-F5C1-4D8C-A8F3-E3535E3A11BC}
AppName=ViTranslate
AppVersion={#AppVersion}
AppVerName=ViTranslate {#AppVersion}
AppPublisher=cloud1710
AppPublisherURL=https://github.com/cloud1710/vitrans
AppSupportURL=https://github.com/cloud1710/vitrans
AppUpdatesURL=https://github.com/cloud1710/vitrans/releases
VersionInfoVersion={#AppVersion}
PrivilegesRequired=lowest
DefaultDirName={autopf}\ViTranslate
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir={#OutputDir}
OutputBaseFilename=ViTranslate-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=ViTranslate
UninstallDisplayIcon={app}\ViTranslate.exe
ShowLanguageDialog=auto

[Languages]
Name: "vietnamese"; MessagesFile: "compiler:Default.isl,lang\Vietnamese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
vietnamese.WelcomeLabel2=Cài [name/ver] cho riêng tài khoản này (không cần quyền quản trị).%n%n• Bộ dịch chạy hoàn toàn trên máy này: tệp không rời máy, không đăng nhập, không gửi dữ liệu.%n• Lần chạy đầu tự tải Ollama (~1,5 GB, nếu máy chưa có) và mô hình dịch (~5-7 GB) vào AppData\Local\ViTranslate; cần khoảng 10 GB trống.%n• Bản dịch máy có thể sai: cần chuyên gia duyệt trước khi sử dụng.%n• Trình cài chưa ký số: nếu Windows báo "Windows protected your PC", bấm "More info" rồi "Run anyway".%n%nBấm Tiếp nghĩa là bạn đồng ý với các điều trên.
english.WelcomeLabel2=This installs [name/ver] for this Windows account only (no administrator rights).%n%n• Translation runs entirely on this computer: files never leave it, no sign-in, no data sent.%n• The first start downloads Ollama (~1.5 GB, unless already installed) and a translation model (~5-7 GB) to AppData\Local\ViTranslate; about 10 GB of free disk space is needed.%n• Machine translation can be wrong: have a specialist review it before use.%n• The installer is not code-signed: if Windows says "Windows protected your PC", click "More info", then "Run anyway".%n%nClicking Next means you agree to the above.
vietnamese.ConfirmUninstall=Gỡ %1 và xóa toàn bộ dữ liệu của nó trong AppData\Local\ViTranslate, kể cả mô hình dịch và bản Ollama riêng của nó? Ollama do bạn tự cài (nếu có) không bị đụng tới.
english.ConfirmUninstall=Remove %1 and all of its data in AppData\Local\ViTranslate, including the translation models and its own copy of Ollama? An Ollama you installed yourself is not touched.

[CustomMessages]
vietnamese.AutoStart=Khởi động cùng Windows
english.AutoStart=Start with Windows
vietnamese.OpenApp=Mở ViTranslate
english.OpenApp=Open ViTranslate
vietnamese.StopApp=Dừng ViTranslate
english.StopApp=Stop ViTranslate

[Tasks]
Name: "autostart"; Description: "{cm:AutoStart}"; Flags: unchecked

[InstallDelete]
; an upgrade starts from a clean bundle (files of the previous PyInstaller build)
Type: filesandordirs; Name: "{app}\_internal"

[Files]
Source: "{#DistDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\ViTranslate"; Filename: "{app}\ViTranslate.exe"; Parameters: "--open"
Name: "{autoprograms}\{cm:StopApp}"; Filename: "{app}\ViTranslate.exe"; Parameters: "--stop"

[Registry]
; vitranslate://start lets the page start a stopped helper (the helper ignores everything else in the link)
Root: HKCU; Subkey: "Software\Classes\vitranslate"; ValueType: string; ValueName: ""; ValueData: "URL:ViTranslate"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\vitranslate"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\vitranslate\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\ViTranslate.exe"",0"
Root: HKCU; Subkey: "Software\Classes\vitranslate\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\ViTranslate.exe"" ""%1"""
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "ViTranslate"; ValueData: """{app}\ViTranslate.exe"""; Flags: uninsdeletevalue; Tasks: autostart
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "ViTranslate"; Flags: deletevalue; Tasks: not autostart

[Run]
Filename: "{app}\ViTranslate.exe"; Parameters: "--open"; Description: "{cm:OpenApp}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; ends the helper and the portable Ollama in AppData\Local\ViTranslate\ollama (by folder: a system Ollama is spared)
Filename: "{app}\ViTranslate.exe"; Parameters: "--stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopViTranslate"

[UninstallDelete]
; everything the helper wrote: jobs, logs, packs, the portable Ollama and the models it pulled there
Type: filesandordirs; Name: "{localappdata}\ViTranslate"
Type: filesandordirs; Name: "{app}"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  { an upgrade: end the running helper (and with it its portable Ollama) so that its files can be replaced }
  if FileExists(ExpandConstant('{app}\ViTranslate.exe')) then
    Exec(ExpandConstant('{app}\ViTranslate.exe'), '--stop', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Result := '';
end;
