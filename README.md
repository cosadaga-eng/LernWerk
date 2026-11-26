# LernWerk

100 % offline nutzbare Lernkarten-, Notebook-, Arbeitsblatt- und Multiple-Choice-App für Vokabeln, MINT-Formeln, Medizin, Wirtschaft, Studium und Allgemeinwissen. Alle Daten bleiben lokal im Browser (IndexedDB).

## Lokal starten

```bash
npm install
npm run dev
```

## Auf GitHub Pages veröffentlichen

Die App verwendet relative Asset-Pfade (`base: './'`) und enthält bereits den fertigen Workflow unter `.github/workflows/deploy.yml`:

1. Projekt in ein GitHub-Repository pushen (Branch `main` oder `master`).
2. Im Repository unter **Settings → Pages → Build and deployment → Source** die Option **GitHub Actions** auswählen.
3. Nach dem automatischen Workflow-Lauf (oder manuell über **Actions → GitHub Pages Deployment → Run workflow**) ist die App direkt unter `https://<dein-name>.github.io/<repo-name>/` erreichbar.

Alternativ lässt sich mit `npm run build` der statische `dist/`-Ordner bauen und direkt auf jeden statischen Webspace oder Branch (`gh-pages`) hochladen.

## Desktop-App & Installer erstellen (Windows, macOS, Linux)

Für eine eigenständige Desktop-Installation ohne Browser stehen fertige Electron-Installer-Konfigurationen bereit:

- **Windows-Installer (`.exe` Setup + Portable):** `npm run desktop:win`
- **macOS-Installer (`.dmg`):** `npm run desktop:mac`
- **Linux-Installer (`.AppImage` & `.deb`):** `npm run desktop:linux`
- **Für das aktuelle System:** `npm run desktop:build`

Die erzeugten Installer liegen anschließend im Ordner `release/`.

Alternativ baut der Workflow `.github/workflows/desktop-release.yml` bei jedem Push auf `main`/`master` (oder manuell unter **Actions → Desktop Installer Build → Run workflow**) automatisch fertige Windows-, macOS- und Linux-Installer als direkt herunterladbare Artefakte.
