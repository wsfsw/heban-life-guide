param(
    [Parameter(Mandatory)] [string]$JavaHome,
    [Parameter(Mandatory)] [string]$PlatformJar,
    [Parameter(Mandatory)] [string]$BuildTools,
    [string]$Output = (Join-Path $PSScriptRoot '../.local/heban-screen-guide')
)

$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = (Resolve-Path -LiteralPath $JavaHome).Path
$env:PATH = (Join-Path $env:JAVA_HOME 'bin') + [IO.Path]::PathSeparator + $env:PATH
$PlatformJar = (Resolve-Path -LiteralPath $PlatformJar).Path
$BuildTools = (Resolve-Path -LiteralPath $BuildTools).Path
New-Item -ItemType Directory -Path $Output -Force | Out-Null
$Output = (Resolve-Path -LiteralPath $Output).Path
$work = Join-Path ([IO.Path]::GetTempPath()) ('heban-android-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path "$work/classes","$work/dex" -Force | Out-Null
Copy-Item -LiteralPath "$PSScriptRoot/res","$PSScriptRoot/src" -Destination $work -Recurse
Copy-Item -LiteralPath "$PSScriptRoot/assets" -Destination $work -Recurse
Copy-Item -LiteralPath "$PSScriptRoot/AndroidManifest.xml" -Destination "$work/AndroidManifest.xml"
Copy-Item -LiteralPath $PlatformJar -Destination "$work/android.jar"
$PlatformJar = "$work/android.jar"

function BuildStep([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Build step failed: $Program" }
}

$aapt = Join-Path $BuildTools 'aapt2.exe'
BuildStep $aapt @('compile','--dir',"$work/res",'-o',"$work/resources.zip")
BuildStep $aapt @('link','--manifest',"$work/AndroidManifest.xml",'-I',$PlatformJar,'-A',"$work/assets",'-0','mp3','-o',"$work/base.apk","$work/resources.zip")
$sources = @(Get-ChildItem -LiteralPath "$work/src" -Filter *.java -Recurse | ForEach-Object FullName)
BuildStep 'javac' (@('--release','8','-encoding','UTF-8','-classpath',$PlatformJar,'-d',"$work/classes") + $sources)
BuildStep 'jar' @('cf',"$work/classes.jar",'-C',"$work/classes",'.')
BuildStep 'java' @('-cp',"$BuildTools/lib/d8.jar",'com.android.tools.r8.D8','--lib',$PlatformJar,'--min-api','26','--output',"$work/dex","$work/classes.jar")
BuildStep 'jar' @('uf',"$work/base.apk",'-C',"$work/dex",'classes.dex')
BuildStep (Join-Path $BuildTools 'zipalign.exe') @('-f','4',"$work/base.apk","$work/aligned.apk")
$key = Join-Path $Output 'test-signing.keystore'
if (-not (Test-Path -LiteralPath $key)) {
    BuildStep 'keytool' @('-genkeypair','-keystore',$key,'-storepass','android','-keypass','android','-alias','heban-test',
        '-dname','CN=Heban Local Test','-keyalg','RSA','-keysize','2048','-validity','3650')
}
$apk = Join-Path $Output 'heban-screen-guide.apk'
BuildStep 'java' @('-jar',"$BuildTools/lib/apksigner.jar",'sign','--ks',$key,'--ks-pass','pass:android','--out',$apk,"$work/aligned.apk")
BuildStep 'java' @('-jar',"$BuildTools/lib/apksigner.jar",'verify','--verbose',$apk)
Write-Output $apk
