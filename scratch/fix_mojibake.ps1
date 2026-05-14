$filePath = 'c:\study\trongbeshop\trongbeshop\js\data.js'
$corruptedBytes = [IO.File]::ReadAllBytes($filePath)
$corruptedString = [System.Text.Encoding]::UTF8.GetString($corruptedBytes)

# Some characters might not be round-trippable in 1252 if it was encoded with something else, but PowerShell's default is usually 1252 on US English or 1258 on Vietnamese systems?
# Actually, if Get-Content read it using the default system ANSI code page, in a Vietnamese locale it might be Code Page 1258!
# Let's check the current encoding.
# Wait, if it's CP 1258, then using 1258 to GetBytes is necessary.
# Let's just try [System.Text.Encoding]::Default to get the system default code page that Get-Content used!

$enc = [System.Text.Encoding]::Default
$originalBytes = $enc.GetBytes($corruptedString)

# Write back
[IO.File]::WriteAllBytes($filePath, $originalBytes)
Write-Output "Fixed"
