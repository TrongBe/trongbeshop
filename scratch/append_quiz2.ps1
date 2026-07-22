$buildJs = Get-Content -Path "c:\study\trongbeshop\scratch\build_de2.js" -Raw -Encoding UTF8
$startIdx = $buildJs.IndexOf("const quiz2 = ") + "const quiz2 = ".Length
$endIdx = $buildJs.IndexOf(";\n\nconst dataFilePath")
if ($endIdx -eq -1) {
    $endIdx = $buildJs.IndexOf(";`n`nconst dataFilePath")
}
if ($endIdx -eq -1) {
    $endIdx = $buildJs.LastIndexOf("};") + 1
}

$quizObjText = $buildJs.Substring($startIdx, $endIdx - $startIdx).Trim()

$dataFile = "c:\study\trongbeshop\trongbeshop\js\data.js"
$dataContent = Get-Content -Path $dataFile -Raw -Encoding UTF8

$lastBracketIdx = $dataContent.LastIndexOf("];")
if ($lastBracketIdx -ne -1) {
    $newContent = $dataContent.Substring(0, $lastBracketIdx) + ",`n    " + $quizObjText + "`n];`n"
    [System.IO.File]::WriteAllText($dataFile, $newContent, [System.Text.Encoding]::UTF8)
    Write-Host "SUCCESSFULLY UPDATED data.js!"
} else {
    Write-Error "Could not find ]; in data.js"
}
