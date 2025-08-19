<p align="center">
  <img src="varcac.png" width=400>

</p>

**Incentive Compensation Management (ICM) engine; compute, track, and prove payouts with confidence.**

**VarCAC** is a local-first commissions platform for modern sales orgs. It pairs a clean, admin-friendly UI with a powerful JavaScript computation engine, so you can model *any* plan—from simple rate cards to multi-tier accelerators, SPIFFs, draws, manager roll-ups, without giving up control of your data.

---

## Why VarCAC
- 🔒 **Local-first & private by design** — run it on your own machine or network (Docker). Your data never leaves your environment.
- 🧠 **Real logic, real results** — a robust **JavaScript** engine drives calculations, letting you encode rules exactly as you pay. It's simpler and more precise than spreadsheet formuals.
- 🧩 **Flexible data sources & team structures** — bring your data as-is; include plans for reps, managers, stack-ups, or anything else you can imagine.
- ⏪ **Version everything** — export/import your entire dataset to *replay, compare, audit, backup, and restore* any period.
- 🤝 **Shareable** — between team-members that use VarCAC enabling collaboration without exposing your whole system.
- ✔ **Elegant & minimal** — simple to understand, sophisticated capabilities, fast to operate, with no heavy external dependencies.

---

## What you can do
- **Quota-based tiers & accelerators** by period or plan window.
- **SPIFFs/bonuses** - one-off or scheduled.
- **Draws / Clawbacks** - for those new reps, or poor performing reps.
- **Flexible** manager / team roll-ups
- **Multi-plan assignments** per participant (AE + SE + stack-ups)
- **Comp Plan Statements** per participant: detailed comprehensive, auditable, traceable comp plan statements.

---

## How it works
1. **Populate your team structure** with flexible roll-ups.
2. **Define Comp Plans** with flexible payout periodicity. 
3. **Build computations** to apply your comp plan logic.
4. **Post data** into a flexible data source model.  
5. **Run Comp Plan Calculations** → deterministic payout lines with comp plan statements.
6. **Export/import** for backup/restore → results in packaged-up files for mobility.

---

## Architecture (some technicals)
- **Client:** Vue + Vite SPA
- **Server:** Express (Node 22+) serving API and static assets on **port 3001**
- **DB:** MariaDB (containerized).

---

## Quick start (Docker)
**Prereqs:** Docker Desktop.


**Download and Install Docker Desktop (you will need at least a free personal account)**
```
https://www.docker.com/products/docker-desktop/
```
**Get VarCAC. Download it from right here on github!**
**After downloading, unzip the file where you will be running VarCAC (on your desktop, or a sub-folder)**

**Next, we'll build the docker images that you'll be turning on.**

**You'll need to get into your termainal for this, and navigate to the folder where you extracted the VarCAC zip file.**
**Run the following commands at your terminal prompt while being in the right folder:**
```
docker compose build --no-cache
docker compose up -d
```
**Open up Docker Desktop, and inspect your container. If it's not running, click the play button on both the mariadb container and the varcac-app container.**
**That should be it!**
**Open up VarCAC in a browser window:**
```
http://localhost:3001
```
---

## License
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

---

**VarCAC**: pay exactly how you plan - **locally, transparently, and repeatably**.
