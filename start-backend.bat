@echo off
cd /d "%~dp0enersight-backend"
call venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
