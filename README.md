# 蜜罐 · Honey Pot

A gentle companion for pregnancy and the baby's first years that runs entirely in the browser. Everything stays on your own phone: no account, no server, no tracking.

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
  - The national vaccination schedule (with the 2025 DTaP change) with booked dates, reminders and a calendar file. Paid vaccines can be added too.
  - Well-child checkups up to age 3: the postnatal home visits and the 42-day check for mother and baby (as done in Shanghai), then the community checkups at 3, 6, 8, 12, 18, 24, 30 and 36 months. Each one lists what is checked and the developmental warning signs to mention to the doctor, and can be booked, reminded and added to the calendar.
  - Fever levels with when-to-see-a-doctor advice.
  - Weaning recipes by age, from iron-rich purées at 6 months to soft family meals at 1–2 years. New foods are introduced one at a time, and foods already tried are remembered. Each tried food can be marked as liked, disliked or caused a reaction (with a note such as a rash); dishes with a food that caused a reaction are left out of the suggestions and flagged in the recipes. The recipes can also be browsed from Tools before the baby arrives.
- **Tools**: kick counter, contraction timer that says when it's time to go, "can I eat this" food lookup, hospital bag checklist, a checklist of the paperwork and subsidies after the birth (birth certificate, household registration, medical insurance, childcare subsidy and so on, following Shanghai's one-stop "birth" service), a guided pelvic floor exercise (slow and quick squeezes with a breathing circle, counting sets per day), a summary for the doctor that prints or saves as PDF (weight, blood pressure, blood sugar, medicines and the latest ultrasound in pregnancy; growth, the last 7 days, temperatures, medicines, vaccines, checkups and food reactions for the baby), week-by-week changes for mom and baby, and bedtime stories with read-aloud.
- **Feels like an app**: add it to the home screen, use it offline, light and dark themes, and less motion when the system asks for it.
- **Your data, your copy**: records live in `localStorage`; Settings exports and imports a JSON backup.

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
