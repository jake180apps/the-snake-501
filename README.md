# The Snake 501

A darts scorer for Jake. It is a static Progressive Web App: plain HTML, CSS and JavaScript, with the match kept on the tablet. After one load from a secure address it works offline.

The colours and the cobra come from the Jake the Snake shirt: black, electric blue and white. It does not use another scorer’s name, logo or caller.

## Games

Match: X01 (any 01 start, in and out chosen separately), winner stays on, and standard cricket with cut-throat and Tactics.

Tournament: a local X01 bracket. Byes do not add darts to the averages.

English Cricket: the Wickets & Runs rules. Two sides, 10 or 11 wickets, one or two innings, singles or pairs. Runs are only the points above 40.

Training: score training, singles training, doubles training, random checkout, Around the Clock, and 121.

Party: Halve-It (the nine-round game), Shanghai, classic Killer, and higher than 41 / lower than 26.

Every game takes darts one at a time or a typed visit. Where a total cannot say which segment was hit, the scorer asks. Bots are levels 1 to 15 and throw real board segments.

## Run it locally

Do not open the file directly. Module scripts and the service worker need a small server.

```bash
python3 serve.py
```

Then open [http://127.0.0.1:8747](http://127.0.0.1:8747).

`serve.py` uses port 8747 and sends the manifest as `application/manifest+json`. Any other static server is fine if it does the same and if the app is served from the folder that contains `index.html`.

## GitHub Pages

Paths are relative (`./`), so the app can live at `https://username.github.io/repository-name/`. Add the repository as a Pages site from the branch that holds these files. The first visit must be over HTTPS (or localhost) before Chrome will install it and keep the files for offline scoring.

This app uses its own service-worker cache, `the-snake-501-v6`, and stores matches under the `snake501.` localStorage prefix. It will not overwrite a Wickets & Runs scoreboard on the same site.

## On the Honor Pad

The live scoreboard is locked to the screen in portrait and landscape, including 1340×800. Setup, the draw and the result may scroll inside the page. The page itself does not grow past the viewport.

In Chrome: open the address, then **Install app** or **Add to Home screen**.

## Target Omni

Auto-score is off until you turn on **Use Target Omni** in Settings. Type the board's IP address, port and path. Those boxes start empty. The app does not guess an address, a port, a path or a message format.

The Omni sends darts to one app at a time. Close DartCounter or the Target app before connecting. If the link fails, the scorer asks you to close that app and power-cycle the Omni, then it tries again with a longer pause each time.

While auto-score is on, a small status sits on the live scoreboard (it does not take a row, so the scoreboard still does not scroll). Tap it to open the message log. Each line is one raw message with the time it arrived. Type what you threw in **What was thrown**, then download `.txt` or `.json`.

To make a fixture, save the `.json` download into `test/fixtures/omni/` (a raw capture can sit beside it as `.txt`). `node --test` replays every file in that folder through the adapter. Until a real parser is written, `parse` returns null and nothing is scored. When a parser does return a dart, it uses the same dart-by-dart entry as the pad: the visit still waits for Enter, and a misread still comes off with Undo. English Cricket already commits each dart as it is thrown, and Undo still removes it.

On an iPhone, Safari blocks `ws://` from an HTTPS page (mixed content). iPhone scoring will need a Capacitor iOS wrapper with a native Swift WebSocket plugin. That wrapper is not in this app. Chrome on the Honor Pad may connect after you allow the Local Network Access prompt.

## Tests

```bash
node --test
```

The checks cover all fifteen games: busts, impossible totals, checkout suggestions, cricket marks, English Cricket, winner-stays-on, brackets and byes, Halve-It, Shanghai, the clock, 121, training scores, Killer, higher/lower, and bots throwing only legal darts.

## This version

There is no caller and no replay of a recorded match. Those can wait.
