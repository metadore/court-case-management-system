$Root = $PSScriptRoot

function Step($n, $msg) { Write-Host "`n[$n/5] $msg" -ForegroundColor Cyan }
function Info($msg)      { Write-Host "      $msg" }
function Fail($msg) {
    Write-Host "`nERROR: $msg" -ForegroundColor Red
    Read-Host "`nPress Enter to exit"
    exit 1
}

try {

Write-Host "============================================" -ForegroundColor Green
Write-Host "  TPT Court - Local Setup" -ForegroundColor Green
Write-Host "============================================"

# ── Copy .env files ───────────────────────────────────────────────────────────
if (-not (Test-Path "$Root\apps\api\.env"))          { Copy-Item "$Root\apps\api\.env.example"  "$Root\apps\api\.env";          Info "Created apps\api\.env" }
if (-not (Test-Path "$Root\apps\web\.env"))          { Copy-Item "$Root\apps\web\.env.example"  "$Root\apps\web\.env";          Info "Created apps\web\.env" }
if (-not (Test-Path "$Root\packages\database\.env")) { Copy-Item "$Root\apps\api\.env.example"  "$Root\packages\database\.env"; Info "Created packages\database\.env" }

# ── Find / install PostgreSQL ─────────────────────────────────────────────────
Step 1 "Checking PostgreSQL..."

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    foreach ($v in 17,16,15,14) {
        if (Test-Path "C:\Program Files\PostgreSQL\$v\bin\psql.exe") {
            $env:PATH = "C:\Program Files\PostgreSQL\$v\bin;$env:PATH"; break
        }
    }
}
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Info "PostgreSQL not found. Installing via winget..."
    winget install --id PostgreSQL.PostgreSQL.16 --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { Fail "winget install failed. Install PostgreSQL manually and re-run." }
    $env:PATH = "C:\Program Files\PostgreSQL\16\bin;$env:PATH"
}
Info "PostgreSQL found."

# ── Find the running (or available) PostgreSQL service + its data dir ─────────
$pgSvc     = $null
$dataDir   = $null
$svcNames  = @('postgresql-x64-17','postgresql-x64-16','postgresql-x64-15','postgresql-x64-14','postgresql')

# Prefer a service that is already Running
foreach ($s in $svcNames) {
    $svc = Get-Service $s -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') { $pgSvc = $s; break }
}
# Fall back to any installed service
if (-not $pgSvc) {
    foreach ($s in $svcNames) {
        if (Get-Service $s -ErrorAction SilentlyContinue) { $pgSvc = $s; break }
    }
}
if (-not $pgSvc) { Fail "No PostgreSQL service found. Is PostgreSQL installed?" }

# Get data directory from the WMI service path (has -D <datadir>)
$wmi = Get-WmiObject Win32_Service -Filter "Name='$pgSvc'" -ErrorAction SilentlyContinue
if ($wmi -and $wmi.PathName -match '-D\s+"([^"]+)"') {
    $dataDir = $Matches[1].TrimEnd('\')
}
# Fallback: derive from service name version number
if (-not $dataDir -or -not (Test-Path "$dataDir\pg_hba.conf")) {
    $ver = [regex]::Match($pgSvc, '\d+$').Value
    if ($ver) { $dataDir = "C:\Program Files\PostgreSQL\$ver\data" }
}
if (-not $dataDir -or -not (Test-Path "$dataDir\pg_hba.conf")) {
    Fail "Could not find pg_hba.conf for service '$pgSvc'. Data dir: $dataDir"
}

$hbaFile = Join-Path $dataDir 'pg_hba.conf'
Info "Service:    $pgSvc"
Info "Data dir:   $dataDir"

# ── Overwrite pg_hba.conf with trust-only local config ───────────────────────
Info "Configuring passwordless local access..."
if (-not (Test-Path "$hbaFile.bak")) { Copy-Item $hbaFile "$hbaFile.bak" }
[System.IO.File]::WriteAllText($hbaFile,
    "# TPT Court local dev - no password required`r`n" +
    "local   all   all                trust`r`n" +
    "host    all   all   127.0.0.1/32 trust`r`n" +
    "host    all   all   ::1/128      trust`r`n"
)

# ── Restart service and wait ──────────────────────────────────────────────────
Info "Restarting $pgSvc..."
Restart-Service $pgSvc -Force
Info "Waiting for PostgreSQL to be ready..."
$env:PGPASSWORD = ''
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    & psql -U postgres -w -c "SELECT 1" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep 2
}
if (-not $ready) { Fail "PostgreSQL did not become ready. Check service '$pgSvc' and $hbaFile" }
Info "PostgreSQL ready."

# ── Create tpt_court database if missing ─────────────────────────────────────
Info "Ensuring database 'tpt_court' exists..."
$exists = & psql -U postgres -w -tc "SELECT 1 FROM pg_database WHERE datname='tpt_court'" 2>&1
if ($exists -notmatch '1') {
    & psql -U postgres -w -c "CREATE DATABASE tpt_court;" | Out-Null
}

# ── Update DATABASE_URL and JWT_SECRET ───────────────────────────────────────
Info "Updating DATABASE_URL and JWT_SECRET..."
$dbUrl = "postgresql://postgres@localhost:5432/tpt_court"
$jwtSecret = [System.Convert]::ToBase64String((1..48 | ForEach-Object { [byte](Get-Random -Max 256) }))
foreach ($f in "$Root\packages\database\.env", "$Root\apps\api\.env") {
    $c = [System.IO.File]::ReadAllText($f)
    $c = [regex]::Replace($c, '(?m)^DATABASE_URL=.*$', "DATABASE_URL=$dbUrl")
    [System.IO.File]::WriteAllText($f, $c)
}
# JWT_SECRET only goes in the API env
$c = [System.IO.File]::ReadAllText("$Root\apps\api\.env")
$c = [regex]::Replace($c, '(?m)^JWT_SECRET=.*$', "JWT_SECRET=$jwtSecret")
[System.IO.File]::WriteAllText("$Root\apps\api\.env", $c)

# ── pnpm install ──────────────────────────────────────────────────────────────
Step 2 "Installing dependencies..."
Set-Location $Root
& pnpm install
if ($LASTEXITCODE -ne 0) { Fail "pnpm install failed. Make sure pnpm >= 9.15.0: npm install -g pnpm@9.15.0" }

# ── db:generate ───────────────────────────────────────────────────────────────
Step 3 "Generating Prisma client..."
& pnpm db:generate
if ($LASTEXITCODE -ne 0) { Fail "db:generate failed." }

# ── db:push ───────────────────────────────────────────────────────────────────
Step 4 "Pushing schema to database..."
& pnpm db:push
if ($LASTEXITCODE -ne 0) { Fail "db:push failed." }

# ── db:seed ───────────────────────────────────────────────────────────────────
Step 5 "Seeding demo data..."
& pnpm --filter '@tpt-court/database' run db:seed
if ($LASTEXITCODE -ne 0) { Fail "db:seed failed." }

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "  Run: pnpm dev" -ForegroundColor Green
Write-Host "  API: http://localhost:3001" -ForegroundColor Green
Write-Host "  Web: http://localhost:3000" -ForegroundColor Green
Write-Host "============================================"

} catch {
    Write-Host "`nUnexpected error: $_" -ForegroundColor Red
}

Read-Host "`nPress Enter to exit"
