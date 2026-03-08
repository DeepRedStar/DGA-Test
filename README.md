# DGA – Drink Group Administration

Interne Web-Anwendung zur Verwaltung einzelner Getränkekästen inklusive Rollen, Audit-Logging und EasyVerein-Sync-Queue.

## Start

```bash
npm install
npm run init-db
npm start
```

App läuft standardmäßig auf `http://localhost:3000`.

## Sicherheitsmerkmale

- Zugriffsbeschränkung auf private Netzwerke und localhost
- Session-Cookies mit `httpOnly`, `sameSite=strict`, `secure` im Produktionsmodus
- Passwörter mit bcrypt
- Audit-Logging aller Kernaktionen
- Rollenbasiertes Berechtigungssystem (`admin`, `getraenkewart`)

## Funktionsumfang (aktueller Stand)

- Erstsetup für ersten Admin
- Login / Logout
- Benutzerverwaltung (Admin)
- Artikelbasierte Einbuchung neuer Kästen mit eindeutiger Kasten-ID
- Einzelaktionen über Scan-/Eingabeseite
- Pfandliste, Kistenliste, Verlauf
- Mindestbestandswarnungen
- Offline-Sync-Queue (lokal) + manueller Sync
- Konfigurationsseite für EasyVerein/Netzwerk-Hinweise

## Hinweise

- Diese Version enthält eine lokale EasyVerein-Abstraktion (Queue), aber noch keine echte API-Kopplung.
- Netzwerk-/Domain-Einstellungen werden nur gespeichert und angezeigt; keine Systemänderung.

## Projektstruktur

- `server.js`
- `routes/`
- `services/`
- `views/`
- `public/`
- `database/`
- `config/`
- `logs/`
