param(
    [Parameter(Mandatory=$false, Position=0)]
    [string]$ImagePath
)

if (-not $ImagePath) {
    Write-Host "Veuillez specifier le chemin d'une image." -ForegroundColor Yellow
    Write-Host "Exemple d'utilisation :" -ForegroundColor Cyan
    Write-Host "  .\test-photo.ps1 `"C:\Users\HP\Pictures\mon_visage.jpg`"" -ForegroundColor White
    $ImagePath = Read-Host "Ou collez le chemin de votre photo ici"
}

# Nettoyer les guillemets eventuels
$ImagePath = $ImagePath.Trim('"').Trim("'")

if (-not (Test-Path $ImagePath)) {
    Write-Host "❌ Erreur : Le fichier '$ImagePath' est introuvable." -ForegroundColor Red
    exit 1
}

$ResolvedPath = (Resolve-Path $ImagePath).Path
$FileName = [System.IO.Path]::GetFileName($ResolvedPath)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "📸 Envoi de votre photo vers le conteneur IA..." -ForegroundColor Cyan
Write-Host "   Fichier : $ResolvedPath" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan

# Copier le script et la photo dans le conteneur worker
docker cp "worker/test_custom_photo.py" "eventface-worker:/app/test_custom_photo.py"
docker cp "$ResolvedPath" "eventface-worker:/app/$FileName"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Echec de la copie vers le conteneur Docker. Verifiez que 'eventface-worker' est demarre." -ForegroundColor Red
    exit 1
}

# Executer le test avec la photo
docker exec eventface-worker python /app/test_custom_photo.py "/app/$FileName"

# Nettoyage de la photo temporaire dans le conteneur
docker exec eventface-worker rm -f "/app/$FileName"
