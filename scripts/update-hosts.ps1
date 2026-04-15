# SpottyBotty Hosts File Updater
# This script adds spottybotty.local to the Windows hosts file
# Requires Administrator privileges

# Check for Administrator privileges
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: Administrator privileges required!" -ForegroundColor Red
    Write-Host "Please right-click PowerShell and select 'Run as Administrator'"
    pause
    exit 1
}

$hostsFile = "$env:SystemRoot\System32\drivers\etc\hosts"
$domain = "spottybotty.local"
$ip = "127.0.0.1"
$entry = "$ip $domain"

try {
    # Read current hosts file
    Write-Host "Checking hosts file..." -ForegroundColor Cyan
    $hostsContent = Get-Content -Path $hostsFile -Raw -ErrorAction Stop

    # Check if entry already exists
    if ($hostsContent -match "\s*$domain\s*") {
        Write-Host "SUCCESS: Entry for $domain already exists" -ForegroundColor Green
        Write-Host ""
        Write-Host "Current matching lines:"
        $hostsContent -split "`n" | Where-Object { $_ -match "\s*$domain\s*" } | ForEach-Object {
            Write-Host "  $_" -ForegroundColor Yellow
        }
        pause
        exit 0
    }

    # Add the entry
    Write-Host "Adding entry to hosts file..." -ForegroundColor Yellow
    Add-Content -Path $hostsFile -Value "`n# SpottyBotty (added by install script)`n$entry" -Force

    # Verify it was added
    $updatedContent = Get-Content -Path $hostsFile -Raw
    if ($updatedContent -match "\s*$domain\s*") {
        Write-Host ""
        Write-Host "SUCCESS! Hosts file updated" -ForegroundColor Green
        Write-Host ""
        Write-Host "Added entry: $entry" -ForegroundColor White
        Write-Host ""
        Write-Host "You can now access the dashboard at:" -ForegroundColor Cyan
        Write-Host "  $domain" -ForegroundColor White
        Write-Host ""
        Write-Host "This will forward to: $ip" -ForegroundColor Gray
        pause
    } else {
        throw "Failed to verify entry"
    }
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to update hosts file" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "You can manually edit the hosts file:"
    Write-Host "  1. Open Notepad as Administrator"
    Write-Host "  2. Open: $hostsFile"
    Write-Host "  3. Add: $ip $domain"
    Write-Host ""
    pause
    exit 1
}
