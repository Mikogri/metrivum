$ErrorActionPreference = 'Stop'
$testOutput = Join-Path $PSScriptRoot 'android/build/wav-test'
New-Item -ItemType Directory -Force -Path $testOutput | Out-Null
& javac.exe -d $testOutput `
    (Join-Path $PSScriptRoot 'android/src/main/java/expo/modules/trainflowvoice/WavHeader.java') `
    (Join-Path $PSScriptRoot 'android/src/test/java/expo/modules/trainflowvoice/WavHeaderTest.java')
if ($LASTEXITCODE -ne 0) { throw 'WAV header compilation failed' }
& java.exe -cp $testOutput expo.modules.trainflowvoice.WavHeaderTest
if ($LASTEXITCODE -ne 0) { throw 'WAV header checks failed' }
