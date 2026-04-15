# NSSM Download and Install Script for SpottyBotty
# Run this as Administrator if automatic install fails

$TempFile = "$env:TEMP\nssm.zip"
$NssmUrl = 'https://nssm.cc/release/nssm-2.24.zip'

Write-Host "Downloading NSSM..."
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $NssmUrl -OutFile $TempFile

Write-Host "Extracting NSSM..."
Expand-Archive -Path $TempFile -DestinationPath "$env:TEMP\nssm" -Force

if ([Environment]::Is64BitOperatingSystem) {
  Write-Host "Installing 64-bit NSSM..."
  Move-Item "$env:TEMP\nssm\nssm-2.24\win64\nssm.exe" 'C:\Windows\System32\nssm.exe' -Force
} else {
  Write-Host "Installing 32-bit NSSM..."
  Move-Item "$env:TEMP\nssm\nssm-2.24\win32\nssm.exe" 'C:\Windows\System32\nssm.exe' -Force
}

Write-Host "SUCCESS! NSSM installed at C:\Windows\System32\nssm.exe"
