param([string]$InputPath,[string]$OutputPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
function Await($Operation,$Type){
 $method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1} | Select-Object -First 1
 $task=$method.MakeGenericMethod($Type).Invoke($null,@($Operation));$task.Wait();$task.Result
}
$file=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($InputPath)) ([Windows.Storage.StorageFile])
$stream=Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try{
 $decoder=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
 $bitmap=Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
 $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
 if(!$engine){throw 'Windows OCR language unavailable'}
 $result=Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
 $image=[Drawing.Image]::FromFile($InputPath)
 try{$image.Save($OutputPath,[Drawing.Imaging.ImageFormat]::Png)}finally{$image.Dispose()}
 $json=@{text=$result.Text;width=$decoder.PixelWidth;height=$decoder.PixelHeight}|ConvertTo-Json -Compress
 [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);[Console]::WriteLine($json)
}finally{$stream.Dispose()}
