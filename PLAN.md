# PLAN.md — Statistik-Abschnitt auf „Deine Würfe (Session)" umbauen

_Geplant: 21.09.2026 · Quelle: Web-Version `/Users/waswer/Documents/stein-schere-papier-web` (Abschnitt „Deine Würfe (Session)")_
_Freigabe: NUTZER (ausstehend)_

## Ziel
Der Statistik-Abschnitt dieser Version zeigt wie die Web-Version:
h2 „Deine Würfe (Session)", Emoji-Labels, absolute Zählwerte „n · %" neben
den Balken, eigener Vorhersage-Absatz `#prediction`. `src/ai.ts` bleibt
unangetastet.

## Plan (Abhängigkeits-Netz — bewusst sequenziell: HTML/CSS/TS teilen dieselben IDs/Klassen)

1. **Schritt 1 — 🎯 Tracer Bullet** (braucht vorher: —)
   braucht: `index.html` 48–62, `src/ui.ts` 31–35 + 73–80, `src/style.css` 169–185
   liefert: Seite läuft (`npm run dev`/`npm run build`) mit neuer Statistik
   Ende-zu-Ende: h2 + `.stat`-Zeilen (Emoji-Label, alte IDs `barStein/…`,
   neue Counts `countStein/…` „0 · 0%"). **Reihenfolge folgt der internen
   Numerik 0=Stein, 1=Papier, 2=Schere — NICHT der Web-Reihenfolge.**
2. **Schritt 2 — Panel-Look (CSS)** (braucht vorher: 1)
   braucht: `src/style.css` 1–7 + 169–185
   liefert: Panel-Look gemappt aufs eigene Theme (Gradient aus `--accent`
   + `--ok`, `tabular-nums`, h2 klein/muted, keine blinden Web-Variablen).
3. **Schritt 3 — Vorhersage-Absatz** (braucht vorher: 1; nach 2 wegen style.css)
   braucht: `index.html` (#hint), `src/ui.ts` 26 + 84–89, `src/main.ts` 14 + 88 + 121, `src/style.css` (#hint-Regel)
   liefert: `<p id="prediction">` mit Web-Semantik; `renderHint` →
   `renderPrediction(difficulty, prediction)`; `#hint` komplett entfernt
   (keine Doppelung); Icons aus vorhandenem `MOVE_ICONS` (DRY).
4. **Zusammenführung + Gates** (braucht vorher: 2, 3)
   liefert: `npm test` grün, `npm run build` grün, dev-Check gegen die
   Web-Version (h2, Balken, Counts, Prediction inkl. Fallback-Text).

## Files to Modify
- `index.html` — `.stats`-Block neu, `#hint` → `#prediction`
- `src/ui.ts` — `ui.stats` + count, `renderStats` (n · %), `renderPrediction`
- `src/main.ts` — Import + 2 Aufrufstellen umbenennen
- `src/style.css` — `.stat`-Klassen, Panel-Look, `.prediction`

## Risiken
- Reihenfolge-Falle Numerik vs. Web-Reihenfolge (Schere↔Papier vertauscht möglich)
- Doppelung #hint/#prediction, wenn #hint nicht komplett entfernt wird
- CSS-Variablen-Drift (Web-Variablen blind kopieren → Farbsprünge)
- Emoji-Konsistenz: eigene `MOVE_ICONS` (✊✋✌️) verwenden, nicht Web-Emojis
