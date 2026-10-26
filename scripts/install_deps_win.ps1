Write-Host "LocalMusic and Video - installing yt-dlp and ffmpeg"
winget install yt-dlp --accept-source-agreements --accept-package-agreements
winget install ffmpeg --accept-source-agreements --accept-package-agreements
Write-Host "`nFinished. Restart the app if the checklist does not update."
Read-Host "Press Enter to close"
