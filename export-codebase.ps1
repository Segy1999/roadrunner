<#
.SYNOPSIS
    Concatenates entire codebase into a single text file for AI analysis or code review.
.DESCRIPTION
    Recursively traverses project directory, reads code files, and concatenates
    them with path headers. Excludes common build artifacts, dependencies, 
    and lock files (package.json, package-lock.json, etc.).
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
        ".vscode", ".idea", "coverage", "tmp", "temp", "data"
    ),
    [string[]]$ExcludeFiles = @(
        "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
        "composer.lock", "Cargo.lock", "Gemfile.lock", "bun.lockb",
        ".DS_Store", "Thumbs.db", "repair.js", "data.md"
    ),
    [int]$MaxFileSizeKB = 500,
    [string]$Encoding = "UTF8"
)


$null = New-Item -Path $OutputFile -ItemType File -Force


$allFiles = Get-ChildItem -Path $RootPath -Recurse -File


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

Write-Host "Found $($files.Count) files to process..."

$processed = 0

foreach ($file in $files) {
    try {
        # Get relative path from root
        $relativePath = $file.FullName.Substring($RootPath.Length).TrimStart('\', '/')
        
        # Read content
        $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8
        
        # Skip empty or binary files
        if ([string]::IsNullOrWhiteSpace($content) -or $content.Contains("`0")) {
            continue
        }
        
        # Write to output file
        "--- $relativePath" | Add-Content -Path $OutputFile -Encoding $Encoding
        "" | Add-Content -Path $OutputFile -Encoding $Encoding
        $content | Add-Content -Path $OutputFile -Encoding $Encoding
        "" | Add-Content -Path $OutputFile -Encoding $Encoding
        
        $processed++
        Write-Progress -Activity "Processing files" -Status "$processed/$($files.Count)" `
            -PercentComplete (($processed / $files.Count) * 100)
    }
    catch {
        Write-Warning "Could not read $($file.FullName): $_"
    }
}

Write-Host "✅ Complete! Processed $processed files."
Write-Host "📄 Output saved to: $(Join-Path $RootPath $OutputFile)"