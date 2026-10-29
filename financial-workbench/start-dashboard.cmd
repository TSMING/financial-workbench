@echo off
setlocal
cd /d "%~dp0"
python -c "import sys; sys.path.insert(0, '.runtime/python'); import pypdf, xlrd, openpyxl" >nul 2>nul
if errorlevel 1 (
  python -m pip install --target .runtime/python -r scripts/requirements-dashboard.txt
  if errorlevel 1 exit /b 1
)
python scripts/dashboard_server.py --open-browser
endlocal
