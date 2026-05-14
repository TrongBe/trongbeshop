$text = "Thá»‹ PhÆ°Æ¡ng"
$enc1252 = [System.Text.Encoding]::GetEncoding(1252)
$originalBytes = $enc1252.GetBytes($text)
$fixedText = [System.Text.Encoding]::UTF8.GetString($originalBytes)
Write-Output $fixedText
