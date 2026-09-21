# STAND.md — Live-Status

| Schritt | Status | Ergebnis |
|---------|--------|----------|
| 1 — Tracer Bullet | ✅ erledigt | h2 „Deine Würfe (Session)" + `.stat`-Zeilen (Emoji-Labels statisch, alte Bar-IDs, neue Counts `countStein/…` „n · %"), `renderStats` auf Count umgestellt; Numerik-Reihenfolge 0=Stein, 1=Papier, 2=Schere; `npm run build` grün |
| 2 — Panel-Look | ✅ erledigt | Panel-Look gemappt aufs eigene Theme: `--panel`-Hintergrund, Gradient aus `--accent`+`--ok`, h2 klein/muted, `tabular-nums` — keine Web-Variablen kopiert; build grün |
| 3 — Vorhersage-Absatz | ✅ erledigt | `#hint` vollständig ersetzt durch `#prediction` (HTML/TS/CSS, keine Doppelung): `renderPrediction(difficulty, prediction)` mit Web-Semantik, Icons aus `MOVE_ICONS`, main.ts-Aufrufstellen (onResult + difficulty-change) angepasst; `ai.ts` unangetastet; build grün |
| 4 — Gates | ✅ erledigt | `npm test` grün (24/24), `npm run build` grün. `npm run dev` nicht gestartet (kein Dauerprozess) — **visueller Check (h2, Balken, Counts, Prediction inkl. Fallback-Text) steht beim Nutzer aus** |

**Nächster Schritt:** Nutzer-Abnahme (visueller Check via `npm run dev`)

Review-Fixes 21.09.: Kommentar + Typ-Verfeinerung umgesetzt; offen: Starttexte im HTML hart kodiert (suggestion, harmlos bei Default-Difficulty adaptiv)
