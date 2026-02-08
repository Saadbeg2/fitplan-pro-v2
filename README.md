# FitPlan Pro v2

FitPlan Pro v2 is a minimalist, offline-first workout tracking app built around **consistency**, **structure**, and **accountability**.

No clutter. No analytics overload. Just log the day and move forward.

---

## Core Features

### Weekly Structure
- 5 workout days
- 2 rest days
- Week expires after 7 days if not completed

### Streak Tracking
- Tracks consecutive logged days
- Rest days count toward streak
- Subtle micro-animation when streak increases

### Workout Logging
- Fixed target reps per day (light / heavy logic)
- Weight-only input per set
- Workout cannot be finished unless all sets are filled
- No double-logging

### Offline-First
- Data stored locally using IndexedDB
- Fully usable without internet
- Service Worker enabled

### Intentional Constraints
- Cannot rest before Day 1
- Cannot exceed rest limit
- Cannot skip required inputs

---

## Tech Stack
- Vanilla JavaScript (ES Modules)
- IndexedDB
- Service Workers
- HTML + CSS (no frameworks)

---

## Local Development

No build step required.

Open `index.html` in a browser and start logging.

---

## Status

Active development  
Current milestone: **v0.2 — simplified Home UI + streak reinforcement**

---

Built for discipline, not motivation.