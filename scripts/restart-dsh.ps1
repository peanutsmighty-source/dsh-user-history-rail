# dsh web restart helper v5 — runs escalated (danger-full-access), OUTSIDE the
# sandbox, so it can see and kill the port-3080 owner. Kills the known stale
# GUI pid (8048) plus any owner netstat reports, waits for the port, relaunches
# `node .../bin.js web`, waits for it to come up. Logs every phase.
$log = 'E:\startup\dsh_work\_dsh_restart_persist.log'
function Log($m) { try { "$(Get-Date -Format o)  $m" | Out-File -FilePath $log -Append -Encoding utf8 } catch {} }

try {
  Log "phase:started"

  Log "phase:kill"
  $targets = @(8048)
  try {
    $ns = netstat -ano | Select-String ":3080" | Where-Object { $_ -match "LISTENING" }
    foreach ($line in $ns) {
      $pidFromLine = ($line.ToString().Trim() -split '\s+')[-1]
      if ($pidFromLine -match '^\d+$' -and $targets -notcontains [int]$pidFromLine) { $targets += [int]$pidFromLine }
    }
  } catch { Log ("  netstat parse failed: " + $_.Exception.Message) }
  foreach ($t in $targets) {
    try {
      Stop-Process -Id $t -Force -ErrorAction Stop
      Log ("  killed PID " + $t)
    } catch { Log ("  kill PID " + $t + " failed: " + $_.Exception.Message) }
  }

  Log "phase:wait-port-free"
  $deadline = (Get-Date).AddSeconds(30)
  $free = $false
  while ((Get-Date) -lt $deadline) {
    $still = netstat -ano | Select-String ":3080" | Where-Object { $_ -match "LISTENING" }
    if (-not $still) { $free = $true; break }
    Start-Sleep -Milliseconds 500
  }
  Log ("  port free: " + $free)
  Start-Sleep -Seconds 2

  Log "phase:relaunch"
  $env:DSH_HOME = 'C:\Users\WHO\.dsh'
  $node = 'D:\software\nodejs\node.exe'
  $bin  = 'E:\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\dsh\lib\bin.js'
  $proc = Start-Process -FilePath $node -ArgumentList @($bin, 'web') -WindowStyle Hidden -PassThru
  Log ("  relaunched pid " + $proc.Id)

  Log "phase:wait-up"
  $upDeadline = (Get-Date).AddSeconds(90)
  $up = $false
  while (-not $up -and ((Get-Date) -lt $upDeadline)) {
    if (netstat -ano | Select-String ":3080" | Where-Object { $_ -match "LISTENING" }) { $up = $true }
    else { Start-Sleep -Milliseconds 500 }
  }
  if ($up) { Log "phase:up" } else { Log "phase:timeout" }
} catch {
  Log ("FATAL: " + $_.Exception.Message)
}
Log "phase:done"
