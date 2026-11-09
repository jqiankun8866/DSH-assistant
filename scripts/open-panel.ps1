param([switch]$NoOpen)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$node=Join-Path $env:USERPROFILE '.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node.exe'
if(!(Test-Path -LiteralPath $node)){$node=(Get-Command node -ErrorAction Stop).Source}
$entry=Join-Path $PSScriptRoot 'control-panel.mjs'
$deployment=Join-Path $env:USERPROFILE '.dsh/profiles/desktop/assistant-deployment.json'
if(Test-Path -LiteralPath $deployment){
 $active=Get-Content -LiteralPath $deployment -Raw | ConvertFrom-Json
 $entry=Join-Path $active.stage 'scripts/control-panel.mjs'
 if(!(Test-Path -LiteralPath $entry)){throw '当前插件文件缺失，请在 DSH 内重新运行安装修复。'}
 $project=$active.stage
}
& $node --check $entry
if($LASTEXITCODE -ne 0){throw '面板文件检查失败，请重新解压完整安装包'}
# A healthy old panel must not hide a newer deployment. Stop only the exact
# process recorded by our marker, after checking its executable and script.
$assistantRoot=Join-Path $env:USERPROFILE '.dsh-plugin-wechat/workspace/.assistant'
$location=Join-Path $assistantRoot 'location.json'
if(Test-Path -LiteralPath $location){$assistantRoot=(Get-Content -LiteralPath $location -Raw | ConvertFrom-Json).root}
$panelState=Join-Path $assistantRoot 'control-panel.json'
if(Test-Path -LiteralPath $panelState){
 $running=Get-Content -LiteralPath $panelState -Raw | ConvertFrom-Json
 if($running.entry -and [IO.Path]::GetFullPath($running.entry) -ne [IO.Path]::GetFullPath($entry)){
  $process=Get-CimInstance Win32_Process -Filter ('ProcessId = '+[int]$running.pid) -ErrorAction Stop
  if($process -and $process.ExecutablePath -eq $node -and $process.CommandLine.Contains('"'+$running.entry+'"')){
   Stop-Process -Id $running.pid -ErrorAction Stop
  }elseif($process){throw '面板版本不一致，但无法确认旧进程身份；请关闭旧面板进程后再打开。'}
 }
}
$logs=Join-Path $env:LOCALAPPDATA 'DSH-Assistant';New-Item -ItemType Directory -Force $logs|Out-Null
$arguments='"'+$entry+'"'
if($NoOpen){$arguments+=' --no-open'}
Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardError (Join-Path $logs 'panel-error.log')
Write-Host '正在打开面板。失败详情保存在本机 DSH-Assistant/panel-error.log。'
