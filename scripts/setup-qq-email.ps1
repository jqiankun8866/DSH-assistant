param([Parameter(Mandatory=$true)][string]$CredentialPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form=New-Object Windows.Forms.Form
$form.Text='DSH - 邮箱配置（只读）';$form.Size=New-Object Drawing.Size(520,420);$form.StartPosition='CenterScreen';$form.TopMost=$true
$label=New-Object Windows.Forms.Label;$label.Text='选择邮箱类型，使用授权码或应用专用密码；不填写登录密码。';$label.SetBounds(20,15,470,25);$form.Controls.Add($label)
$label2=New-Object Windows.Forms.Label;$label2.Text='邮箱地址';$label2.SetBounds(20,55,100,25);$form.Controls.Add($label2)
$account=New-Object Windows.Forms.TextBox;$account.SetBounds(125,50,350,25);$form.Controls.Add($account)
$label3=New-Object Windows.Forms.Label;$label3.Text='授权码';$label3.SetBounds(20,95,100,25);$form.Controls.Add($label3)
$password=New-Object Windows.Forms.TextBox;$password.UseSystemPasswordChar=$true;$password.SetBounds(125,90,350,25);$form.Controls.Add($password)
$info=New-Object Windows.Forms.Label;$info.Text='本机加密保存；仅收件箱读取。Outlook OAuth 暂未接入。';$info.SetBounds(20,290,470,25);$form.Controls.Add($info)
$button=New-Object Windows.Forms.Button;$button.Text='加密保存';$button.SetBounds(350,325,125,30);$form.Controls.Add($button)
$providerLabel=New-Object Windows.Forms.Label;$providerLabel.Text='邮箱类型';$providerLabel.SetBounds(20,135,100,25);$form.Controls.Add($providerLabel)
$provider=New-Object Windows.Forms.ComboBox;$provider.DropDownStyle='DropDownList';$provider.SetBounds(125,130,350,25);$provider.Items.AddRange(@('QQ','Gmail','iCloud','Custom'));$form.Controls.Add($provider)
$hostLabel=New-Object Windows.Forms.Label;$hostLabel.Text='IMAP服务器';$hostLabel.SetBounds(20,175,100,25);$form.Controls.Add($hostLabel)
$mailHost=New-Object Windows.Forms.TextBox;$mailHost.SetBounds(125,170,350,25);$form.Controls.Add($mailHost)
$portLabel=New-Object Windows.Forms.Label;$portLabel.Text='TLS端口';$portLabel.SetBounds(20,215,100,25);$form.Controls.Add($portLabel)
$mailPort=New-Object Windows.Forms.NumericUpDown;$mailPort.Minimum=1;$mailPort.Maximum=65535;$mailPort.Value=993;$mailPort.SetBounds(125,210,350,25);$form.Controls.Add($mailPort)
$provider.Add_SelectedIndexChanged({$hosts=@{QQ='imap.qq.com';Gmail='imap.gmail.com';iCloud='imap.mail.me.com';Custom=''};$mailHost.Text=$hosts[[string]$provider.SelectedItem];$mailHost.ReadOnly=([string]$provider.SelectedItem -ne 'Custom');$mailPort.Value=993})
$provider.SelectedIndex=0
$button.Add_Click({
 try{
  if($account.Text.Trim() -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$'){throw '请填写完整邮箱地址'}
  if($mailHost.Text.Trim() -notmatch '^[a-zA-Z0-9]+([.-][a-zA-Z0-9]+)*$'){throw '请填写IMAP服务器域名'}
  if([string]::IsNullOrWhiteSpace($password.Text)){throw '请填写授权码'}
  $secret=ConvertTo-SecureString $password.Text -AsPlainText -Force
  $credential=New-Object Management.Automation.PSCredential($account.Text.Trim(),$secret)
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $CredentialPath) | Out-Null
  $temporary=$CredentialPath+'.new';$credential|Export-Clixml -LiteralPath $temporary
  Move-Item -LiteralPath $temporary -Destination $CredentialPath -Force
  $hash=[Security.Cryptography.SHA256]::Create();try{$accountHash=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($account.Text.Trim().ToLowerInvariant())))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
  $settings=[IO.Path]::ChangeExtension($CredentialPath,'.settings.json')
  @{provider=[string]$provider.SelectedItem;imapHost=$mailHost.Text.Trim();imapPort=[int]$mailPort.Value;auth='password';accountHash=$accountHash}|ConvertTo-Json|Set-Content -LiteralPath ($settings+'.new') -Encoding UTF8
  Move-Item -LiteralPath ($settings+'.new') -Destination $settings -Force
  $password.Clear();[Windows.Forms.MessageBox]::Show('已加密保存。可以让微信助理查看最近5封邮件。','DSH')|Out-Null;$form.Close()
 }catch{[Windows.Forms.MessageBox]::Show('配置未保存，请检查邮箱地址、授权码和文件权限。','DSH')|Out-Null}
})
$form.AcceptButton=$button
[void]$form.ShowDialog()
