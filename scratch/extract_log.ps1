$logPath = 'C:\Users\admin\.gemini\antigravity\brain\bce1e1b2-363f-4c85-bc32-cdaf3511efa7\.system_generated\logs\overview.txt'
$outPath = 'c:\study\trongbeshop\trongbeshop\scratch\user_prompt_88.txt'
$lines = Get-Content $logPath
$output = ""
foreach ($line in $lines) {
  if ($line -match '"step_index":88') {
    $json = $line | ConvertFrom-Json
    $output += $json.content
  }
}
[IO.File]::WriteAllText($outPath, $output, [System.Text.Encoding]::UTF8)
Write-Output "Done"
