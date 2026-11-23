# Tiny static file server for local play (the game uses ES modules and fetches .glb files, so it needs http://, not file://).
# Usage:  powershell -ExecutionPolicy Bypass -File serve.ps1   then open http://localhost:8377/
param([int]$Port = 8377)
$root = $PSScriptRoot
$mime = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.glb' = 'model/gltf-binary'; '.json' = 'application/json'; '.png' = 'image/png'; '.jpg' = 'image/jpeg' }
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if ($path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $path -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $type = $mime[$ext]; if (-not $type) { $type = 'application/octet-stream' }
      $ctx.Response.ContentType = $type
      $ctx.Response.Headers['Cache-Control'] = 'no-store'
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Host "200 /$rel"
    } else { $ctx.Response.StatusCode = 404; Write-Host "404 /$rel" }
  } catch { try { $ctx.Response.StatusCode = 500 } catch {}; Write-Host "500 $($_.Exception.Message)" }
  finally { try { $ctx.Response.Close() } catch {} }
}
