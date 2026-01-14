# Ralph Loop - PowerShell
# Usage: .\ralph-loop.ps1

$AGENT_CMD = "claude-code"
$MAX_STRIKES = 3
$SESSION_DIR = ".ralph"

New-Item -ItemType Directory -Force -Path $SESSION_DIR | Out-Null

$strikeFile = Join-Path $SESSION_DIR "strikes_ps.txt"
$logFile = Join-Path $SESSION_DIR "run_ps.log"
$runIdFile = Join-Path $SESSION_DIR "run_id_ps.txt"

function Get-Strikes {
    if (Test-Path $strikeFile) { [int](Get-Content $strikeFile) } else { 0 }
}

function Get-RunId {
    if (Test-Path $runIdFile) { [int](Get-Content $runIdFile) } else { 0 }
}

function Reset-Agent {
    $runId = (Get-RunId) + 1
    Set-Content -Path $runIdFile -Value $runId
    Set-Content -Path $strikeFile -Value 0
    Add-Content -Path $logFile -Value ""
    Add-Content -Path $logFile -Value "RESET run_id=$runId"
    return $runId
}

function Invoke-AgentOnce {
    param($runId)
    Add-Content -Path $logFile -Value "RUN run_id=$runId"
    $context = @(
        (Get-Content PRD.md -Raw -ErrorAction SilentlyContinue),
        (Get-Content confucius.md -Raw -ErrorAction SilentlyContinue),
        (Get-Content tasks.md -Raw -ErrorAction SilentlyContinue),
        (Get-Content progress.txt -Raw -ErrorAction SilentlyContinue),
        (Get-Content PROMPT.md -Raw -ErrorAction SilentlyContinue)
    ) -join "\n---\n"
    
    $output = $context | & $AGENT_CMD 2>&1 | Tee-Object -Append -FilePath $logFile
    return $output
}

$runId = Reset-Agent
$strikes = 0

while ($true) {
    if (Test-Path (Join-Path $SESSION_DIR "PAUSE")) {
        Write-Host "PAUSED - Remove .ralph/PAUSE to continue"
        Start-Sleep -Seconds 5
        continue
    }
    
    $output = Invoke-AgentOnce -runId $runId
    
    # Check for failure patterns
    if ($output -match "I cannot|unable to|need more context|looping|repeating") {
        $strikes++
        Set-Content -Path $strikeFile -Value $strikes
        Add-Content -Path $logFile -Value "STRIKE $strikes run_id=$runId"
        Write-Host "STRIKE $strikes/$MAX_STRIKES"
        
        if ($strikes -ge $MAX_STRIKES) {
            Write-Host "MAX STRIKES - Resetting agent..."
            $runId = Reset-Agent
            $strikes = 0
        }
    } else {
        Set-Content -Path $strikeFile -Value 0
        $strikes = 0
    }
}
