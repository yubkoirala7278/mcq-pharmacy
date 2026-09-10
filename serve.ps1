# Minimal static file server for the MCQ exam site.
# Usage:  powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8000]
# The browser cannot read the .json sets over file://, so the site needs a local HTTP server.

param([int]$Port = 8000)

$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host "Could not listen on port $Port. Try another one:  .\serve.ps1 -Port 8080" -ForegroundColor Red
  exit 1
}

Write-Host "Serving $root" -ForegroundColor Green
Write-Host "Open http://localhost:$Port/   (Ctrl+C to stop)" -ForegroundColor Green
Start-Process "http://localhost:$Port/" | Out-Null

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $path = Join-Path $root $rel
    $full = [System.IO.Path]::GetFullPath($path)

    if (-not $full.StartsWith([System.IO.Path]::GetFullPath($root), [StringComparison]::OrdinalIgnoreCase)) {
      $res.StatusCode = 403
    } elseif (Test-Path -LiteralPath $full -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $res.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
      $res.Headers.Add('Cache-Control', 'no-store')
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
    Write-Host ("{0,3}  {1}" -f $res.StatusCode, $rel)
  } catch {
    $res.StatusCode = 500
    Write-Host "500 $_" -ForegroundColor Red
  } finally {
    try { $res.OutputStream.Close() } catch {}
  }
}

$listener.Stop()
