# Stein · Schere · Papier – mit Handgesten per Webcam

Web-App, die Stein/Schere/Papier in Echtzeit per Webcam erkennt und **Best of Five** (erste
3 Rundensiege gewinnen den Satz) gegen eine **adaptive KI** spielt – mit Live-Statistik und
Handskelett-Overlay. Läuft vollständig lokal im Browser, ohne Backend.

## Features

- 🖐 **Gestenerkennung on-device** via MediaPipe HandLandmarker (WASM, 21 Landmarks) –
  Kamerabild verlässt den Browser nicht (Privacy-Hinweis in der UI).
- 🎮 **Best of Five**: Countdown 3-2-1, Geste wird exakt bei „0“ gesampelt,
  Unentschieden = kein Punkt. Sätze werden über das Match akkumuliert.
- 🧠 **Adaptive KI**: Frequenz- + Markov-Modell (1. Ordnung) über deine Würfe,
  Verfall `0.9`/Runde, 70 % Counter der Vorhersage / 30 % Zufall.
  Difficulty umschaltbar: `adaptiv` / `zufall`.
- 📊 **Live-Statistik**: Verteilung deiner Würfe (Stein/Papier/Schere) als Prozent-Bars
  plus Hint „Letzte Vorhersage: …“ (nur im adaptiven Modus).
- ⌨️ **Tastatur-Fallback**: `S` Stein · `C` Schere · `P` Papier · `Leertaste` Runde starten.
- 🖼 Handskelett-Overlay auf gespiegeltem Kamerabild, FPS-Warnung unter 15 fps,
  klare Fehlerzustände (Kamera verweigert, kein Gerät, unsicherer Kontext, Modell-Ladefehler).

## Setup

```bash
npm install
npm run dev      # Dev-Server auf http://localhost:5173
```

Kamerafreigabe im Browser bestätigen – fertig.

## Produktions-Build

```bash
npm run build    # → dist/
npm run preview  # lokaler Test des Builds
```

`dist/` ist statisch und auf jedem Static Host lauffähig (GitHub Pages, Netlify,
`python -m http.server`). `base: './'` in `vite.config.ts` erlaubt auch Subpfade.

### Wichtig: HTTPS oder localhost

`getUserMedia` (Kamera) funktioniert nur in einem **sicheren Kontext**:
`http://localhost:…` oder `https://…`. Ein Upload von `dist/` erfordert daher HTTPS
(GitHub Pages/Netlify liefern das automatisch).

### CDN-Abhängigkeit

Beim ersten Laden kommen zwei Ressourcen von CDNs (Version gepinnt):
- WASM-Binarys: `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm`
- Modell: `storage.googleapis.com/.../hand_landmarker.task`

Danach läuft alles lokal. Bei CDN-Ausfall zeigt die App eine Fehlermeldung mit Retry
(3 Versuche, Fallback auf CPU-Delegate) statt eines White-Screens. Zum Selbst-Hosten:
WASM-Dateien aus `node_modules/@mediapipe/tasks-vision/wasm` und das `.task`-Modell
herunterladen und `WASM_BASE`/`MODEL_URL` in `src/main.ts` auf die eigenen Pfade setzen.

## Architektur

```
src/
  main.ts     Kamera, HandLandmarker-Loop, Overlay, Verdrahtung
  gesture.ts  Heuristik (Finger/Daumen-Schwellwerte) + Ringpuffer-Stabilisierung
  ai.ts       Frequenz/Markov-KI, Verfall, Counter-Strategie, judge()
  game.ts     Zustandsmaschine wait/count/done/matchover, Best-of-Five-Logik
  ui.ts       DOM-Bindings (Score, Banner, Bars, Fehlerzustände)
tests/
  gesture.test.ts   synthetische Landmarks: 3 Gesten + Edge Cases
  ai.test.ts        Regelwerk + Markov-Lernkurve (10× Stein → KI spielt Papier)
```

Move-Encoding überall: `0 = Stein, 1 = Papier, 2 = Schere`; `a schlägt b ⟺ (a−b+3) % 3 === 1`.

### Klassifikations-Heuristik

- Finger gestreckt, wenn `dist(tip, wrist) > dist(pip, wrist) × 1.15`
- Daumen abgespreizt, wenn `dist(4, 17) > dist(3, 17) × 1.1`
- Mapping: 0 gestreckte Finger → **Stein** · genau Zeige+Mittel → **Schere** · ≥ 4 → **Papier** · sonst **unklar** (Runde wird verworfen)
- Stabilisierung: Ringpuffer 12 Frames, Schwellwert 8; zusätzlich 250-ms-Zeitfenster
  (6 Treffer) für Parität bei 30 vs. 60 fps. Schwellwerte sind Konstanten in `src/gesture.ts`.

## Tests

```bash
npm test          # einmalig
npm run test:watch
```

## Bekannte Grenzen

- Daumen-Heuristik kann bei starker Handrotation unsicher werden (Stein/Schere/Papier
  sind davon unberührt – der Daumen fließt nicht in die 3 Gesten ein).
- Sehr schlechtes Licht/Hintergrund → mehr „unklar“-Würfe, Runde wird verworfen.
- Two-Player (`numHands: 2`) ist für v2 geplant.