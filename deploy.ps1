<#
.SYNOPSIS
Deploys Backend and Frontend to separate Google Cloud Run containers.

.DESCRIPTION
This script automates reading the .env files, deploying the backend first to get its URL,
then substituting the VITE_SERVER_URL in the frontend's environment variables and deploying the frontend.
#>

$ErrorActionPreference = 'Stop'

Write-Host "=========================================="
Write-Host " 1. DEPLOYING BACKEND TO CLOUD RUN"
Write-Host "=========================================="

# Read server/.env and construct env-vars string
$serverEnvPath = "server/.env"
if (-Not (Test-Path $serverEnvPath)) {
    Write-Error "Could not find $serverEnvPath"
    exit 1
}

$serverEnvLines = Get-Content $serverEnvPath | Where-Object { $_ -match "^[^#].*=.*" -and $_ -notmatch "^PORT=" }
$serverEnvVars = $serverEnvLines -join ","

Write-Host "Deploying stealth-wallet-backend from ./server..."
# Run the deployment and capture the output URL
$backendUrl = gcloud run deploy stealth-wallet-backend `
    --source ./server `
    --region asia-southeast1 `
    --allow-unauthenticated `
    --set-env-vars="$serverEnvVars" `
    --format="value(status.url)"

if (-Not $backendUrl) {
    Write-Error "Backend deployment failed or did not return a URL."
    exit 1
}

Write-Host "✅ Backend successfully deployed at: $backendUrl"
Write-Host ""
Write-Host "=========================================="
Write-Host " 2. DEPLOYING FRONTEND TO CLOUD RUN"
Write-Host "=========================================="

# Read stealth-wallet/.env
$frontendEnvPath = "stealth-wallet/.env"
if (-Not (Test-Path $frontendEnvPath)) {
    Write-Error "Could not find $frontendEnvPath"
    exit 1
}

# Read variables, exclude VITE_SERVER_URL because we will override it with the backendUrl
$frontendEnvLines = Get-Content $frontendEnvPath | Where-Object { $_ -match "^[^#].*=.*" -and $_ -notmatch "^VITE_SERVER_URL=" }

# Add the newly deployed backend URL
$frontendEnvLines += "VITE_SERVER_URL=$backendUrl"
# Write to .env.production so Vite picks it up automatically during build
Write-Host "Creating .env.production file for frontend build..."
$frontendEnvLines | Out-File -FilePath "stealth-wallet/.env.production" -Encoding utf8

Write-Host "Deploying stealth-wallet-frontend from ./stealth-wallet..."
Write-Host "Injecting VITE_SERVER_URL=$backendUrl"

gcloud run deploy stealth-wallet-frontend `
    --source ./stealth-wallet `
    --region asia-southeast1 `
    --allow-unauthenticated `
    --quiet

Write-Host "✅ Frontend deployment triggered successfully!"
