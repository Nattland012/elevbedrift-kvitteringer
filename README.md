# Elevbedrift – kvitteringsapp

En enkel webapp for:
- 3 personer som kan laste opp/skanne kvitteringer fra mobil
- 1 administrator som kan se alle kvitteringene på PC
- Supabase som database + lagring
- OCR i nettleseren med Tesseract.js
- ingen Google Drive

## Før dere starter

Dere trenger en gratis Supabase-prosjektkonto.

1. Opprett et prosjekt på https://supabase.com/
2. Gå til SQL Editor og lim inn hele innholdet i `supabase.sql`.
3. Gå til Storage og sørg for at bucket `receipts` finnes (SQL-filen forsøker å opprette den).
4. Gå til Authentication → Users og opprett fire brukere:
   - én administrator
   - tre skannebrukere
5. Kopier Supabase Project URL og anon key.
6. Åpne `app.js` og fyll inn `SUPABASE_URL` og `SUPABASE_ANON_KEY`.
7. Last opp filene til en statisk host, for eksempel Cloudflare Pages.

## Viktig om tilgang

Databasen er satt opp slik at:
- alle innloggede brukere kan laste opp egne kvitteringer
- bare brukeren som har `role = admin` kan lese alle kvitteringer
- skannebrukere kan ikke hente listen over andres kvitteringer via Supabase

## Bruk

På mobil:
1. Logg inn.
2. Trykk "Ta bilde av kvittering".
3. Ta bilde.
4. OCR forsøker å finne butikk, dato og beløp.
5. Trykk "Last opp".

På PC:
1. Administrator logger inn.
2. Alle kvitteringer vises i oversikten.
3. Klikk på en kvittering for å åpne bildet.

## OCR

OCR skjer lokalt i nettleseren. Den er ikke perfekt; feltene bør kontrolleres før opplasting.
