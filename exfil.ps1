<#
.SYNOPSIS
    Concatenates entire codebase into a single text file for AI analysis or code review.
.DESCRIPTION
    Recursively traverses project directory, reads code files, and concatenates
    them with path headers. Excludes common build artifacts, dependencies, 
    and lock files (package.json, package-lock.json, etc.). After initial filtering,
    prompts user to confirm each file individually before adding to output.
#>

param(
    [string]$RootPath = (Get-Location),
    [string]$OutputFile = "codebase.txt",
    [string[]]$IncludeExtensions = @(
        ".astro", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
        ".py", ".java", ".cs", ".cpp", ".c", ".h", ".hpp", ".rs", ".go",
        ".php", ".rb", ".vue", ".svelte", ".css", ".scss", ".sass", ".less",
        ".html", ".htm", ".json", ".xml", ".yaml", ".yml", ".md", ".sql"
    ),
    [string[]]$ExcludeDirectories = @(
        "node_modules", "__pycache__", ".git", "build", "dist",
        "bin", "obj", "venv", ".env", ".venv", "target", "out",
        ".vscode", ".idea", "coverage", "tmp", "temp"
    ),
    [string[]]$ExcludeFiles = @(
        "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
        "composer.lock", "Cargo.lock", "Gemfile.lock", "bun.lockb",
        ".DS_Store", "Thumbs.db"
    ),
    [int]$MaxFileSizeKB = 500,
    [string]$Encoding = "UTF8"
)

# Create or overwrite output file
$null = New-Item -Path $OutputFile -ItemType File -Force

# Get all files recursively
$allFiles = Get-ChildItem -Path $RootPath -Recurse -File

# Filter files (SAME EXACT LOGIC AS ORIGINAL)
$files = foreach ($file in $allFiles) {
    $ext = $file.Extension.ToLower()
    $fullPath = $file.FullName.ToLower()
    $fileName = $file.Name
    
    # Skip specific files (lock files, etc.)
    if ($ExcludeFiles -contains $fileName) { continue }
    
    # Skip if too large
    if ($file.Length -gt ($MaxFileSizeKB * 1024)) { continue }
    
    # Skip if extension not included
    if ($IncludeExtensions -notcontains $ext) { continue }
    
    # Skip if in excluded directory
    $skip = $false
    foreach ($exclDir in $ExcludeDirectories) {
        if ($fullPath -like "*\$exclDir\*") {
            $skip = $true
            break
        }
    }
    if ($skip) { continue }
    
    $file
}

Write-Host "Found $($files.Count) files matching initial filters."
Write-Host "You will now be prompted to confirm each file individually..."
Write-Host ""

$processed = 0
$added = 0
$batchMode = $null  # Track batch actions: 'All' or 'SkipAll'

foreach ($file in $files) {
    $processed++
    
    try {
        # Get relative path from root
        $relativePath = $file.FullName.Substring($RootPath.Length).TrimStart('\', '/')
        
        # Interactive confirmation logic
        $includeFile = $false
        
        if ($batchMode -eq 'All') {
            $includeFile = $true
        }
        elseif ($batchMode -eq 'SkipAll') {
            Write-Progress -Activity "Processing files" -Status "Progress: $processed/$($files.Count) | Added: $added | Mode: Skipping All" `
                -PercentComplete (($processed / $files.Count) * 100)
            continue
        }
        else {
            # Prompt user for each file
            Write-Host ("{0,3}/{1,-3}" -f $processed, $files.Count) -NoNewline -ForegroundColor Cyan
            Write-Host ": " -NoNewline
            Write-Host $relativePath -ForegroundColor White
            
            do {
                $response = Read-Host -Prompt "    Include? [Y]es [N]o [A]ll [S]kip All"
                $response = $response.ToUpper().Trim()
                
                switch ($response) {
                    "Y" { $includeFile = $true; break }
                    "N" { $includeFile = $false; break }
                    "A" { $includeFile = $true; $batchMode = 'All'; break }
                    "S" { $includeFile = $false; $batchMode = 'SkipAll'; break }
                    default {
                        Write-Host "    Invalid input. Please enter Y, N, A, or S." -ForegroundColor Yellow
                        $response = $null
                    }
                }
            } while (-not $response)
            
            Write-Host ""
        }
        
        # Skip file if user declined
        if (-not $includeFile) {
            Write-Progress -Activity "Processing files" -Status "Progress: $processed/$($files.Count) | Added: $added" `
                -PercentComplete (($processed / $files.Count) * 100)
            continue
        }
        
        # Read content
        $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8
        
        # Skip empty or binary files
        if ([string]::IsNullOrWhiteSpace($content) -or $content.Contains("`0")) {
            Write-Progress -Activity "Processing files" -Status "Progress: $processed/$($files.Count) | Added: $added" `
                -PercentComplete (($processed / $files.Count) * 100)
            continue
        }
        
        # Write to output file with headers
        "--- $relativePath" | Add-Content -Path $OutputFile -Encoding $Encoding
        "" | Add-Content -Path $OutputFile -Encoding $Encoding
        $content | Add-Content -Path $OutputFile -Encoding $Encoding
        "" | Add-Content -Path $OutputFile -Encoding $Encoding
        
        $added++
        Write-Progress -Activity "Processing files" -Status "Progress: $processed/$($files.Count) | Added: $added" `
            -PercentComplete (($processed / $files.Count) * 100)
    }
    catch {
        Write-Warning "Could not read $($file.FullName): $_"
    }
}

Write-Host ""
Write-Host "✅ Complete!" -ForegroundColor Green
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "   Processed: $processed files"
Write-Host "   Added: $added files"
Write-Host "   Skipped: $($processed - $added) files"
Write-Host "📄 Output saved to: $(Join-Path $RootPath $OutputFile)" -ForegroundColor White"