# 蜜罐 · Honey Pot

A gentle companion for pregnancy and the baby's first years that runs entirely in the browser. Everything stays on your own phone unless you turn on cloud sync to your own private GitHub repository: no account, no server of ours, no tracking.

**Try it:** <https://asherdust.github.io/Baby/>

## Features

- **Today**: current week and day, the baby's size as a fruit, progress to the due date, and a short list of what to do today (log weight, supplements, the next checkup, mood). In the evening a card links to tonight's bedtime story.
- **Records**: weight chart against the pre-pregnancy baseline, with the recommended gain range for your pre-pregnancy BMI (China's WS/T 801—2022 standard) and a note when you are gaining faster or slower than that, blood pressure and blood sugar with out-of-range warnings, and a timeline of medicines and supplements.
- **Mood journal**: pick a mood face, write a few lines, and look back on a timeline grouped by day and month. Edits and deletions can be undone. When low or anxious moods come up on five or more of the last 14 days, a gentle note (worded for pregnancy or after the birth) says when to see a doctor and offers a one-tap call to the national 12356 mental health hotline.
- **Checkups**: the usual checkup schedule by week, booked appointments, reminders (calendar file or browser notifications), and ultrasound reports that can be filled in by pasting the report text.
- **Pregnancy and nursing recipes**: a daily menu (breakfast, lunch, a snack and dinner) picked for the current trimester, with swaps, favourites and foods to avoid. After the birth it switches to a nursing menu: a soup with lunch as well as dinner, plus a bedtime snack, with confinement-month and first-days advice. When recent blood sugar readings run high, it switches to low-GI dishes. Over 60 home-style recipes with ingredients and steps, plus a shopping list for today or tomorrow that can be ticked off or sent to family.
- **Baby**: once the baby is born, the 「产检」 tab becomes 「宝宝」 and the home page turns into the baby's day.
  - One-tap logging for breastfeeding (timed, left and right), bottles, naps and nappies. Pumping is logged per side, and stored milk is kept as a list of bags in the fridge or freezer, with how long each can still be kept (China CDC: 2 days in the fridge, 3 months frozen, 24 hours once thawed); using a bag logs a breast-milk bottle. Solid food, temperature and medicine can be added in a couple of taps, past entries can be filled in later, and each day comes with a summary. A rough estimate of the next feed is worked out from the typical gap between recent feeds. Bar charts show the last 7 days of sleep, feeds and nappies, with sleep compared against the usual range for the baby's age (AASM, and the US National Sleep Foundation under 4 months).
  - A growth record with weight, length and head-circumference curves against the WHO standards, plus milestones and other firsts.
  - A teething chart of the 20 baby teeth: tap a tooth to record when it came in, with the usual age for each (MSD Manual), the first tooth filled into the milestones, a note if none has appeared by 13 months, and teething and brushing tips (National Health Commission).
  - The national vaccination schedule (with the 2025 DTaP change) with booked dates, reminders and a calendar file. Paid vaccines can be added too.
  - Well-child checkups up to age 3: the postnatal home visits and the 42-day check for mother and baby (as done in Shanghai), then the community checkups at 3, 6, 8, 12, 18, 24, 30 and 36 months. Each one lists what is checked and the developmental warning signs to mention to the doctor, and can be booked, reminded and added to the calendar.
  - Fever levels with when-to-see-a-doctor advice.
  - Weaning recipes by age, from iron-rich purées at 6 months to soft family meals at 1–2 years. New foods are introduced one at a time, and foods already tried are remembered. Each tried food can be marked as liked, disliked or caused a reaction (with a note such as a rash); dishes with a food that caused a reaction are left out of the suggestions and flagged in the recipes. The recipes can also be browsed from Tools before the baby arrives.
- **Tools**: kick counter, contraction timer that says when it's time to go, "can I eat this" food lookup, hospital bag checklist, a checklist of the paperwork and subsidies after the birth (birth certificate, household registration, medical insurance, childcare subsidy and so on, following Shanghai's one-stop "birth" service), a guided pelvic floor exercise (slow and quick squeezes with a breathing circle, counting sets per day), soothing sounds after the birth (white, pink and brown noise or a rhythmic shush, generated in the browser and looped, with a timer that fades out and safe-volume advice), a summary for the doctor that prints or saves as PDF (weight, blood pressure, blood sugar, medicines and the latest ultrasound in pregnancy; growth, the last 7 days, temperatures, medicines, vaccines, checkups and food reactions for the baby), week-by-week changes for mom and baby, and bedtime stories with read-aloud.
- **Feels like an app**: add it to the home screen, use it offline, light and dark themes, and less motion when the system asks for it.
- **Your data, your copy**: records live in `localStorage`; Settings exports and imports a JSON backup.
- **Cloud sync (optional)**: keep an encrypted copy in your own private GitHub repository. Settings asks for the repository (`owner/name`), a folder, an optional branch, a fine-grained personal access token (only that repository, with Contents set to read and write) and a password (any text without spaces; longer is harder to guess). The app pulls the latest data when it opens, comes back to the foreground or goes online, and checks every few minutes while open. After each change it uploads once you pause for a few seconds (at most half a minute later) and right away when the app goes to the background. There is also a "sync now" button. Every sync pulls, merges and then pushes, using the same entry-by-entry merge as below, so two phones never overwrite each other. A push that loses a race with another phone is retried after pulling again. Data is gzipped, then encrypted with AES-GCM using a key derived from the password with PBKDF2 (1,000,000 iterations, about a second once per phone); GitHub only ever sees ciphertext. The phone stores the derived key, never the password. Baby logs go into one file per month and everything else into `main.json`, so a typical sync uploads a few kilobytes in a single commit, and unchanged files are not downloaded. A commit is made only when this phone has something the cloud does not: a sync that just brings newer data down makes none, and per-phone settings such as dismissed cards, reminders already shown, story reading progress or reading voice are not uploaded at all, so the cloud holds only what is shared plus the edit times and deletion markers the merge needs. Settings the family shares (how long after a meal blood sugar is measured, foods to avoid, favourite and hidden stories) sync like records, and so do recipe swaps, favourite dishes and the shopping list, with removals carried over too. Each commit message names the phone that made it, using a random six-character code and a name you can edit. A new phone can restore everything from the start screen.
- **Two phones, one record**: each parent can log on their own phone. One sends a file to the other (through WeChat, for example), who merges it in Settings instead of overwriting. A preview first lists what will be added, changed or deleted. Entries are matched one by one: new ones are added, the later edit wins when both phones changed the same entry, and deletions carry over (each deletion leaves a small marker with a fingerprint of the deleted entry, so it is not brought back). The merge can be undone right away.

## Project layout

```
index.html            entry page; the order of scripts and stylesheets matters
sw.js                 service worker: offline cache (must stay at the root to cover the whole site)
manifest.webmanifest  home-screen app name and icons
css/                  one stylesheet per area; base.css and layout.css come first
js/core/              logic that never touches the page (dates, content, model, storage, ...), unit-tested
js/app/               the interface: rendering, actions, dialogs, reminders, read-aloud
data/stories/         bedtime story texts, generated by scripts/build_stories.py
data/recipes.js       the recipe book, written by hand
data/baby*.js         vaccination schedule, milestones and weaning recipes, written by hand
data/growth.js        WHO growth standards (0–2 years), generated by scripts/build_growth.py
icons/                favicon and home-screen icons
tests/                unit tests and browser tests
```

There is no build step. Every file under `js/` is a plain script that adds itself to the global `Baby` namespace, so each one can only use the files loaded before it.

## Run locally

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Tests

```sh
sh tests/run.sh           # logic tests, using the JavaScriptCore that ships with macOS
sh tests/browser/run.sh   # page tests in headless Chrome
sh tests/browser/shot.sh today 390x844 's=main&w=390' 2   # screenshot to /tmp/baby-shots/today.png
```

When adding a script or stylesheet, list it in both `index.html` and `FILES` in `sw.js`; the unit tests fail if the two drift apart. After moving or renaming files, bump `CACHE` in `sw.js` so old caches are dropped.

## Content

Bedtime stories are public-domain works from Wikisource and Project Gutenberg. Recipes are ordinary home cooking, written for this app along the lines of the Chinese Dietary Guidelines for Pregnant Women (2022). Weaning recipes follow the Chinese Feeding Guidelines for Infants and Young Children aged 7–24 months (2022). Growth curves use the WHO Child Growth Standards. The vaccination schedule follows the 2021 national immunization program, with the DTaP change that took effect in 2025. Health information in the app is general guidance; the hospital and doctor have the final say.
