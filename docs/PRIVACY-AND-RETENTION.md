# Datenschutz- und Löschkonzept (technischer Entwurf)

> Dieser Text ist eine technische Dokumentation und keine Rechtsberatung. Vor dem
> Livegang müssen Datenschutzerklärung, Einwilligung und Auftragsverarbeitungen für
> die Schweiz und den EWR rechtlich geprüft werden.

## Datenminimierung

- Das Originalfoto wird im Backend nicht dauerhaft gespeichert.
- EXIF- und Standortmetadaten werden durch Dekodieren und erneutes Encodieren
  entfernt.
- Namen, Datum und Zusatztext werden nicht an die Bild-KI geschickt. Sie werden
  erst lokal in die finale Druckdatei gerendert.
- Browser-Storage enthält ausschließlich Personalisierungstext, niemals Fotos.
- Logs enthalten zufällige Design-IDs oder Hashes, keine Fotos, Namen, Adressen
  oder vollständigen Bestelldaten.

## Löschfristen

| Daten | Standardfrist | Mechanismus |
| --- | ---: | --- |
| Originalfoto | unmittelbar nach Verarbeitung | nur Arbeitsspeicher; keine persistente Datei |
| Nicht bestelltes Design | 24 Stunden | `DESIGN_RETENTION_HOURS` und stündlicher Cleanup |
| Gekaufte Druckdatei | bis Produktions-/Supportzweck endet | Frist betrieblich festlegen und danach löschen |
| Signierter Vorschaulink | 30 Minuten | HMAC-Ablaufzeit |
| Signierter Printful-Link | 7 Tage | HMAC-Ablaufzeit |

Kunden erhalten bei der Design-Erstellung ein zufälliges Lösch-Token. Mit
`POST /api/v1/designs/{id}/delete` und `{ "deleteToken": "…" }` wird das Design
sofort aus dem Couple-Wear-Speicher gelöscht. Zusätzlich sind die Shopify-Themen
`customers/redact`, `customers/data_request` und `shop/redact` HMAC-geprüft
implementiert.

## Externer KI-Dienst

Die Anwendung nutzt `/v1/images/edits`. Nach der aktuellen OpenAI-Dokumentation
werden API-Eingaben und -Ausgaben standardmäßig nicht zum Training verwendet,
sofern nicht ausdrücklich optiert wurde. Missbrauchsmonitoring-Inhalte können
standardmäßig bis zu 30 Tage gespeichert werden; eine sofortige Löschung beim
Provider wird daher nicht versprochen. Die Images API ist laut Dokumentation für
Zero Data Retention geeignet, sofern der Account dafür freigeschaltet und korrekt
konfiguriert ist.

Für regionale Verarbeitung kann nach entsprechender Account-Freigabe
`OPENAI_API_BASE_URL=https://eu.api.openai.com` gesetzt werden. Laut Dokumentation
setzt die Europa-Region für diese Dienste einen passenden Retention-Modus voraus.

Aktuelle Quellen:

- https://developers.openai.com/api/docs/guides/your-data
- https://developers.openai.com/api/docs/guides/image-generation
- https://openai.com/enterprise-privacy/

## Betriebliche Pflichten vor Livegang

1. Verzeichnis der Verarbeitungstätigkeiten und Rechtsgrundlage festlegen.
2. Verträge zur Auftragsverarbeitung und Datenstandorte prüfen.
3. Datenschutzkontakt und reale Löschfristen in der Shop-Erklärung ergänzen.
4. Backups in das Löschkonzept einbeziehen.
5. Zugriff auf Produktion und Speicher nach dem Least-Privilege-Prinzip vergeben.
6. Analytics, Session-Replay und Error-Tracking auf Upload- und Vorschaupfaden
   deaktivieren oder strikt redigieren.
