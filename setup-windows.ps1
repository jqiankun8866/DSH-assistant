param([switch]$CheckOnly,[switch]$VerifyOnly,[switch]$Menu)
$ErrorActionPreference='Stop'
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
$python=$env:DSH_PYTHON
if (!$python) { $python=Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe' }
if (!(Test-Path -LiteralPath $python)) {
  $found=Get-Command python -ErrorAction SilentlyContinue
  if (!$found) { throw 'Install DSH and initialize its Python runtime first.' }
  $python=$found.Source
}
$arguments=@((Join-Path $PSScriptRoot 'scripts\windows_setup.py'))
if ($CheckOnly) { $arguments+='--doctor' }
if ($VerifyOnly) { $arguments+='--verify' }
if (!$CheckOnly -and !$VerifyOnly -and !$Menu) { $arguments+='--auto' }
& $python @arguments
if ($LASTEXITCODE -ne 0) { throw 'Setup failed. Please send the error text, without credentials.' }
