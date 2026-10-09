param(
    [switch]$Once,
    [switch]$StartAll,
    [switch]$StartPublic,
    [switch]$StopAll,
    [switch]$Initialize
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$Runtime = Join-Path $Root ".runtime"
$EnvFile = Join-Path $Root ".env"
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"
$SystemPython = (Get-Command python.exe -ErrorAction Stop).Source
$MySql = "C:\xampp\mysql\bin\mysql.exe"
$MySqlAdmin = "C:\xampp\mysql\bin\mysqladmin.exe"
$BackendPort = 8030
$FrontendPort = 4300
$BackendUrl = "http://127.0.0.1:$BackendPort"
$FrontendUrl = "http://localhost:$FrontendPort"
$PublicUrl = "https://fenix.selectto.com.br"
$BackendLog = Join-Path $Runtime "backend.log"
$BackendErr = Join-Path $Runtime "backend.err.log"
$FrontendLog = Join-Path $Runtime "frontend.log"
$FrontendErr = Join-Path $Runtime "frontend.err.log"
$FrontendBuildMarker = Join-Path $FrontendDir ".next\fenix-build-backend-url"
$TunnelLog = Join-Path $Runtime "tunnel.log"
$TunnelErr = Join-Path $Runtime "tunnel.err.log"
$TunnelConfig = Join-Path $env:USERPROFILE ".cloudflared\config-selectto-finance.yml"
$TunnelName = "selectto-finance"
$TunnelId = "66644ed9-6c5d-4100-956c-566dfce54d0d"

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null

function New-HexSecret([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
    (($buffer | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Get-DatabasePassword {
    $passwordFile = Join-Path $Runtime "mysql-password"
    if (-not (Test-Path -LiteralPath $passwordFile)) {
        [IO.File]::WriteAllText($passwordFile, (New-HexSecret 24), [Text.UTF8Encoding]::new($false))
    }
    (Get-Content -Raw -LiteralPath $passwordFile).Trim()
}

function Set-EnvValues([hashtable]$Values) {
    $lines = if (Test-Path -LiteralPath $EnvFile) { @(Get-Content -LiteralPath $EnvFile) } else { @() }
    $written = @{}
    $updated = foreach ($line in $lines) {
        if ($line -match '^\s*([^#=]+)=') {
            $key = $matches[1].Trim()
            if ($Values.ContainsKey($key)) {
                $written[$key] = $true
                "$key=$($Values[$key])"
                continue
            }
        }
        $line
    }
    foreach ($key in $Values.Keys) {
        if (-not $written.ContainsKey($key)) { $updated += "$key=$($Values[$key])" }
    }
    [IO.File]::WriteAllLines($EnvFile, $updated, [Text.UTF8Encoding]::new($false))
}

function Ensure-AppEnv {
    $password = Get-DatabasePassword
    Set-EnvValues @{
        DATABASE_URL = "mysql+pymysql://fenix_local:$password@127.0.0.1:3306/fenix?charset=utf8mb4"
        FRONTEND_URL = $PublicUrl
        CORS_ORIGINS = "$PublicUrl,http://localhost:$FrontendPort,http://127.0.0.1:$FrontendPort"
        COOKIE_SECURE = "true"
        ENABLE_DOCS = "true"
        UPLOAD_DIR = (Join-Path $BackendDir "private_uploads")
        BACKEND_PORT = "$BackendPort"
        FRONTEND_PORT = "$FrontendPort"
        MYSQL_DATABASE = "fenix"
        MYSQL_USER = "fenix_local"
    }
}

function Test-MySql {
    if (-not (Test-Path -LiteralPath $MySqlAdmin)) { return $false }
    & cmd.exe /d /c ('"' + $MySqlAdmin + '" --protocol=tcp -h 127.0.0.1 -u root ping 1>nul 2>nul')
    $LASTEXITCODE -eq 0
}

function Ensure-MySql {
    if (-not (Test-Path -LiteralPath $MySql)) {
        throw "MySQL/MariaDB do XAMPP nao encontrado em C:\xampp\mysql\bin."
    }
    if (-not (Test-MySql)) {
        $starter = "C:\xampp\mysql_start.bat"
        if (-not (Test-Path -LiteralPath $starter)) { throw "Inicializador do MySQL do XAMPP nao encontrado." }
        Start-Process -FilePath $starter -WindowStyle Hidden
        for ($attempt = 0; $attempt -lt 20 -and -not (Test-MySql); $attempt++) { Start-Sleep -Seconds 1 }
    }
    if (-not (Test-MySql)) { throw "O MySQL/MariaDB do XAMPP nao respondeu na porta 3306." }

    $password = Get-DatabasePassword
    $sql = @"
CREATE DATABASE IF NOT EXISTS fenix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'fenix_local'@'127.0.0.1' IDENTIFIED BY '$password';
ALTER USER 'fenix_local'@'127.0.0.1' IDENTIFIED BY '$password';
GRANT ALL PRIVILEGES ON fenix.* TO 'fenix_local'@'127.0.0.1';
FLUSH PRIVILEGES;
"@
    & $MySql --protocol=tcp -h 127.0.0.1 -u root -e $sql
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel preparar o banco local fenix." }
}

function Ensure-Dependencies {
    Ensure-AppEnv
    if (-not (Test-Path -LiteralPath $Python)) {
        Write-Host "Criando ambiente Python local..."
        & $SystemPython -m venv (Join-Path $BackendDir ".venv")
        if ($LASTEXITCODE -ne 0) { throw "Falha ao criar o ambiente Python." }
    }
    Write-Host "Verificando dependencias do backend..."
    & $Python -m pip install -r (Join-Path $BackendDir "requirements.txt") --disable-pip-version-check
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar as dependencias do backend." }

    if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "node_modules"))) {
        Write-Host "Instalando dependencias do frontend..."
        & npm.cmd --prefix $FrontendDir ci
        if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar as dependencias do frontend." }
    }
}

function Initialize-Database {
    Ensure-MySql
    Ensure-Dependencies
    Push-Location $BackendDir
    try {
        & $Python -m alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar as migrations do Fenix." }
    } finally { Pop-Location }
    Write-Host "Banco fenix atualizado no MariaDB do XAMPP."
}

function Get-ListeningPid([int]$Port) {
    $found = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
    if (-not $found.Count) {
        $found = @(netstat -ano -p tcp | Where-Object {
            $_ -match "LISTENING" -and $_ -match ":$Port\s"
        } | ForEach-Object { ($_ -split "\s+")[-1] } | Select-Object -Unique)
    }
    @($found | Where-Object { $_ })
}

function Test-ProjectProcess($Process) {
    -not [string]::IsNullOrWhiteSpace($Process.CommandLine) -and
        $Process.CommandLine.IndexOf($Root, [StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Get-BackendPids {
    $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -match "^(python|python3)" -and $_.CommandLine -like "*uvicorn*app.main:app*" -and (Test-ProjectProcess $_)
    } | Select-Object -ExpandProperty ProcessId)
    @($processes + (Get-ListeningPid $BackendPort) | Select-Object -Unique)
}

function Get-FrontendPids {
    $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq "node.exe" -and $_.CommandLine -like "*next*" -and (Test-ProjectProcess $_)
    } | Select-Object -ExpandProperty ProcessId)
    @($processes + (Get-ListeningPid $FrontendPort) | Select-Object -Unique)
}

function Get-TunnelPids {
    try {
        @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
            $_.Name -eq "cloudflared.exe" -and
            ($_.CommandLine -like "*$TunnelName*" -or $_.CommandLine -like "*$TunnelId*" -or $_.CommandLine -like "*config-selectto-finance.yml*")
        } | Select-Object -ExpandProperty ProcessId)
    } catch {
        @(Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    }
}

function Assert-PortAvailable([int]$Port, [int[]]$ProjectPids, [string]$Label) {
    $foreign = @(Get-ListeningPid $Port | Where-Object { $_ -notin $ProjectPids })
    if ($foreign.Count) { throw "A porta $Port reservada para $Label esta ocupada (PID $($foreign -join ', '))." }
}

function Build-Frontend([switch]$SkipDependencies) {
    if (-not $SkipDependencies) { Ensure-Dependencies }
    $env:BACKEND_URL = $BackendUrl
    $env:NEXT_TELEMETRY_DISABLED = "1"
    & npm.cmd --prefix $FrontendDir run build
    if ($LASTEXITCODE -ne 0) { throw "Falha no build do frontend." }
    [IO.File]::WriteAllText($FrontendBuildMarker, $BackendUrl, [Text.UTF8Encoding]::new($false))
}

function Test-FrontendBuildCurrent {
    $buildId = Join-Path $FrontendDir ".next\BUILD_ID"
    if (-not (Test-Path -LiteralPath $buildId) -or -not (Test-Path -LiteralPath $FrontendBuildMarker)) { return $false }
    if ((Get-Content -Raw -LiteralPath $FrontendBuildMarker).Trim() -ne $BackendUrl) { return $false }
    $builtAt = (Get-Item -LiteralPath $FrontendBuildMarker).LastWriteTimeUtc
    $sourcePaths = @("app", "components", "lib", "public", "next.config.ts", "package.json", "package-lock.json", "tsconfig.json")
    foreach ($relative in $sourcePaths) {
        $path = Join-Path $FrontendDir $relative
        if (-not (Test-Path -LiteralPath $path)) { continue }
        $items = if ((Get-Item -LiteralPath $path).PSIsContainer) {
            Get-ChildItem -LiteralPath $path -Recurse -File
        } else {
            @(Get-Item -LiteralPath $path)
        }
        if ($items | Where-Object { $_.LastWriteTimeUtc -gt $builtAt } | Select-Object -First 1) { return $false }
    }
    return $true
}

function Start-Backend {
    $pids = @(Get-BackendPids)
    Assert-PortAvailable $BackendPort $pids "o backend do Fenix"
    if ($pids.Count) { Write-Host "Backend ja esta ligado."; return }
    Start-Process -FilePath $Python -WindowStyle Hidden -WorkingDirectory $BackendDir `
        -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$BackendPort", "--no-access-log" `
        -RedirectStandardOutput $BackendLog -RedirectStandardError $BackendErr
}

function Start-Frontend {
    $pids = @(Get-FrontendPids)
    Assert-PortAvailable $FrontendPort $pids "o frontend do Fenix"
    if ($pids.Count) { Write-Host "Frontend ja esta ligado."; return }
    if (-not (Test-FrontendBuildCurrent)) { Build-Frontend }
    $env:BACKEND_URL = $BackendUrl
    Start-Process -FilePath (Get-Command npm.cmd).Source -WindowStyle Hidden -WorkingDirectory $FrontendDir `
        -ArgumentList "run", "start", "--", "--hostname", "127.0.0.1", "--port", "$FrontendPort" `
        -RedirectStandardOutput $FrontendLog -RedirectStandardError $FrontendErr
}

function Wait-Http([string]$Url, [string]$Label) {
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
            if ($response.StatusCode -lt 500) { Write-Host "$Label pronto: $Url"; return }
        } catch {
            $errorResponse = $_.Exception.Response
            if ($errorResponse -and [int]$errorResponse.StatusCode -lt 500) {
                Write-Host "$Label pronto: $Url"
                return
            }
        }
        Start-Sleep -Seconds 2
    }
    throw "$Label nao ficou pronto. Consulte os logs em $Runtime."
}

function Start-Tunnel {
    if ((Get-TunnelPids).Count) { Write-Host "Tunnel Selectto compartilhado ja esta ligado."; return }
    if (-not (Test-Path -LiteralPath $TunnelConfig)) { throw "Config do tunnel nao encontrada: $TunnelConfig" }
    if ((Get-Content -Raw -LiteralPath $TunnelConfig) -notmatch "(?m)^\s*- hostname:\s*fenix\.selectto\.com\.br\s*$") {
        throw "O hostname fenix.selectto.com.br ainda nao esta no config do tunnel."
    }
    $cloudflared = (Get-Command cloudflared.exe -ErrorAction Stop).Source
    Start-Process -FilePath $cloudflared -WindowStyle Hidden -WorkingDirectory $Root `
        -ArgumentList "tunnel", "--config", $TunnelConfig, "run", $TunnelName `
        -RedirectStandardOutput $TunnelLog -RedirectStandardError $TunnelErr
    Start-Sleep -Seconds 4
    if (-not (Get-TunnelPids).Count) { throw "O tunnel nao iniciou. Consulte $TunnelErr" }
}

function Start-Application([bool]$Public) {
    Initialize-Database
    if (-not (Test-FrontendBuildCurrent)) { Build-Frontend -SkipDependencies }
    Start-Backend
    Wait-Http "$BackendUrl/ready" "Backend"
    Start-Frontend
    Wait-Http "$FrontendUrl/login" "Frontend"
    Wait-Http "$FrontendUrl/api/health" "Proxy da API"
    if ($Public) { Start-Tunnel; Write-Host "Publico: $PublicUrl" }
}

function Stop-Application {
    $pids = @((Get-BackendPids) + (Get-FrontendPids) | Select-Object -Unique)
    foreach ($appProcessId in $pids) { Stop-Process -Id $appProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host "Frontend e backend do Fenix desligados. MySQL e tunnel compartilhado foram mantidos ligados."
}

function New-Admin {
    Initialize-Database
    Push-Location $BackendDir
    try { & $Python -m app.cli create-admin } finally { Pop-Location }
}

function Show-Logs {
    foreach ($log in @($BackendLog, $BackendErr, $FrontendLog, $FrontendErr, $TunnelErr)) {
        Write-Host "`n--- $log ---"
        if (Test-Path -LiteralPath $log) { Get-Content -Tail 50 -LiteralPath $log } else { Write-Host "Sem log." }
    }
}

function Show-Status {
    Clear-Host
    $mysql = if (Test-MySql) { "[ON]" } else { "[OFF]" }
    $backend = if ((Get-BackendPids).Count) { "[ON]" } else { "[OFF]" }
    $frontend = if ((Get-FrontendPids).Count) { "[ON]" } else { "[OFF]" }
    $tunnel = if ((Get-TunnelPids).Count) { "[ON]" } else { "[OFF]" }
    Write-Host "=============================================="
    Write-Host " Fenix Trade - Painel de controle"
    Write-Host "=============================================="
    Write-Host " $mysql MariaDB XAMPP - 127.0.0.1:3306/fenix"
    Write-Host " $backend Backend     - $BackendUrl"
    Write-Host " $frontend Frontend    - $FrontendUrl"
    Write-Host " $tunnel Tunnel       - fenix.selectto.com.br (compartilhado)"
    Write-Host ""
    Write-Host " 1 - Ligar local"
    Write-Host " 2 - Ligar local + tunnel publico"
    Write-Host " 3 - Desligar Fenix"
    Write-Host " 4 - Reiniciar Fenix com tunnel"
    Write-Host " 5 - Preparar/atualizar ambiente e banco"
    Write-Host " 6 - Criar administrador"
    Write-Host " 7 - Recriar build do frontend"
    Write-Host " 8 - Exibir logs"
    Write-Host " A - Abrir aplicacao local"
    Write-Host " P - Abrir aplicacao publica"
    Write-Host " R - Atualizar status"
    Write-Host " 0 - Sair"
    Write-Host ""
}

Ensure-AppEnv
if ($StopAll) { Stop-Application; exit }
if ($Initialize) { Initialize-Database; exit }
if ($StartAll) { Start-Application $false; exit }
if ($StartPublic) { Start-Application $true; exit }
if ($Once) { Show-Status; exit }

while ($true) {
    Show-Status
    $inputChoice = Read-Host "Digite uma opcao"
    if ($null -eq $inputChoice) { break }
    $choice = $inputChoice.ToUpperInvariant()
    switch ($choice) {
        "1" { Start-Application $false; Pause }
        "2" { Start-Application $true; Pause }
        "3" { Stop-Application; Pause }
        "4" { Stop-Application; Start-Application $true; Pause }
        "5" { Initialize-Database; Pause }
        "6" { New-Admin; Pause }
        "7" { Build-Frontend; Pause }
        "8" { Show-Logs; Pause }
        "A" { Start-Process $FrontendUrl }
        "P" { Start-Process $PublicUrl }
        "R" { }
        "0" { return }
        default { Write-Host "Opcao invalida."; Pause }
    }
}
