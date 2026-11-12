# Hausverwaltung

Web-App (PWA) für die private Immobilienverwaltung: Objekte, Einheiten, Mieter, Mietverträge, Zähler und Mietzahlungen. Läuft im Browser, lässt sich am PC und auf dem Handy wie eine App installieren und funktioniert ohne Netz.

- Speicherung: lokal auf dem Gerät, doppelt in IndexedDB und localStorage
- Kein Build-Schritt nötig – reine HTML/CSS/JS-Dateien
- Keine externen Dienste, keine Daten verlassen das Gerät

## Funktionen

### Stammdaten
- **Objekte** mit Adresse, Baujahr und Gesamtfläche. Weicht die Summe der Einheiten von der Gesamtfläche ab, gibt es einen Hinweis.
- **Einheiten** mit Art, Lage, Wohnfläche, Miteigentumsanteil (MEA) und Zimmern.
- **Mieter** mit Kontakt und IBAN (für den Zahlungsabgleich).
- **Mietverträge** mit einem oder mehreren Mietern, Beginn/Ende, Personen, Kaution und **Staffeln**: Kaltmiete, Nebenkosten- und Heizkosten-Vorauszahlung, jeweils ab einem Monat. Mieterhöhungen und neue Vorauszahlungen sind einfach eine weitere Zeile.

### Mietkonto und offene Posten
- Sollmiete je Monat aus den Staffeln. Beginn oder Ende mitten im Monat wird tagesgenau anteilig gerechnet.
- Mietkonto je Vertrag: Soll, Ist, Differenz und laufender Saldo je Monat.
- „Offene Posten“ zeigt alle Verträge mit Rückstand und die Monate mit Fehlbetrag.

### Zahlungen (Kontoauszug-Import)
- CSV-Export der Bank importieren (Sparkasse, Volksbank, DKB, ING … – Trennzeichen, Kopfzeile und Zeichensatz werden erkannt, die Spalten lassen sich vor dem Import prüfen).
- Doppelte Buchungen werden beim erneuten Import übersprungen.
- **Automatischer Abgleich** mit dem Vertrag über IBAN des Mieters, Suchbegriffe im Vertrag, Nachname und passenden Betrag. Nur eindeutige Treffer werden zugeordnet, der Rest steht unter „Nicht zugeordnet“ und wird per Auswahlliste zugeordnet.
- Zahlungen ab dem 25. zählen für den Folgemonat; der Monat ist je Zahlung änderbar.

### Zähler
- Zähler je Einheit oder als Allgemein-/Hauptzähler des Objekts, mit Art, Nummer, Einheit und Eichfrist.
- **Plausibilitätsprüfung** bei jeder Ablesung: Stand niedriger als zuvor, Datum vor Einbau/nach Ausbau oder in der Zukunft, verrutschtes Komma, Verbrauch deutlich über oder unter dem üblichen Tagesverbrauch, seit über einem Jahr nicht abgelesen. Auffällige Stände stehen auf der Übersicht.
- **Zählertausch**: Endstand alt und Anfangsstand neu in einem Schritt; der Verbrauch wird über die ganze Zählerkette gerechnet.
- Jahresverbrauch (31.12. bis 31.12.), fehlende Stichtage werden linear geschätzt und als „unvollständig“ markiert.

### Übersicht
Kacheln für Soll und Eingang im laufenden Monat, Rückstände, Leerstand, auffällige Zählerstände, auslaufende Verträge und fällige Sicherung.

## Datensicherheit
- Jede Änderung wird sofort doppelt gespeichert (IndexedDB + localStorage). Beim Start werden beide zusammengeführt.
- Die App bittet den Browser um dauerhaften Speicher (`navigator.storage.persist()`).
- **Daten & Sicherung → Sicherung herunterladen** speichert alles als JSON-Datei. „Wiederherstellen“ führt die Datei mit dem Bestand zusammen (je Datensatz gilt der neuere Stand). So kommen die Daten auch auf ein anderes Gerät.
- In der Seitenleiste erscheint „Sicherung fällig“, wenn 14 Tage oder mehr als 25 Änderungen seit der letzten Sicherung vergangen sind.
- iPhone: Safari kann Website-Daten nach 7 Tagen ohne Nutzung löschen – das gilt nicht für die über „Zum Home-Bildschirm“ installierte App.

## Starten

Lokal (wegen Service Worker über einen Webserver, nicht per Doppelklick):

```
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Online über GitHub Pages: Repository anlegen, Dateien hochladen, **Settings → Pages → Branch `main`** wählen. Eine eigene Domain lässt sich dort unter „Custom domain“ eintragen. Im Browser dann „Installieren“ bzw. „Zum Home-Bildschirm“ wählen.

**Wichtig:** Mieterdaten sind personenbezogen. Die Daten liegen nur im Browser des jeweiligen Geräts, nicht auf GitHub – hochgeladen wird nur der App-Code. Sicherungsdateien nie ins Repository legen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Oberfläche (Seitenleiste, Hell/Dunkel automatisch, Handy-Ansicht) |
| `util.js` | Hilfsfunktionen (Formatierung, Datum) |
| `db.js` | Speicherschicht (IndexedDB + localStorage, Sicherung). Hier würde später eine Cloud-Datenbank angeschlossen. |
| `finance.js` | Sollmiete, Mietkonto, CSV-Import, Zahlungsabgleich |
| `meters.js` | Zähler, Plausibilitätsprüfung, Zählertausch, Verbrauch |
| `app.js` | Ansichten, Formulare, Aktionen, Beispieldaten |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline-Betrieb und Installation |

## Nächste Schritte (Ideen)
- Kosten/Rechnungen mit Kostenart, Umlageschlüssel und Zeitraum
- Nebenkostenabrechnung (Fläche, Personen, Verbrauch, MEA; anteilig nach Mietzeit) als PDF
- Dokumentenablage je Objekt/Mieter
- Auswertung für die Anlage V
- Optional: Cloud-Datenbank (z. B. Supabase) mit Login und Rechten pro Objekt
