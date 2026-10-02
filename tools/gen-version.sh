#!/bin/sh
# Génère les fichiers lus par server/version.js dans l'image Docker (qui n'a pas git).
# À lancer à la racine du dépôt, avant « docker compose build » (déjà intégré à pulldocker.ini).
git rev-list --count HEAD > server/commit-count.txt
git log -n 120 --pretty=format:'%h|%ad|%s' --date=short > server/whatsnew.txt
echo "version : 0.$(( $(cat server/commit-count.txt) + 9 ))"
