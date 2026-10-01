@echo off
cd /d %~dp0
if not exist node_modules call npm install
start "Observatoire - API + client" cmd /k npm run dev
echo API : http://localhost:2508  -  Client : http://localhost:5180
