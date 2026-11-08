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

This app uses its own service-worker cache, `the-snake-501-v2`, and stores matches under the `snake501.` localStorage prefix. It will not overwrite a Wickets & Runs scoreboard on the same site.

## On the Honor Pad

The live scoreboard is locked to the screen in portrait and landscape, including 1340×800. Setup, the draw and the result may scroll inside the page. The page itself does not grow past the viewport.

In Chrome: open the address, then **Install app** or **Add to Home screen**.

## Tests

```bash
node --test
```

The checks cover all fifteen games: busts, impossible totals, checkout suggestions, cricket marks, English Cricket, winner-stays-on, brackets and byes, Halve-It, Shanghai, the clock, 121, training scores, Killer, higher/lower, and bots throwing only legal darts.

## This version

There is no caller and no replay of a recorded match. Those can wait.
