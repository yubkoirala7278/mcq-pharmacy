# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Practice MCQ exam sets for the **Nepal Health Service, Pharmacy (भेषज) Group, Fifth Level** examination, plus a dependency-free static site that runs them as a timed exam. Everything lives at the repository root; there is no build system, package manager, or test suite, and the directory is not a git repository.

- `1.json` … `5.json` — one exam set each (the data; see the contract below).
- `index.html`, `styles.css`, `app.js` — the exam site. Vanilla HTML/CSS/JS, no dependencies, no build step. Edit and reload.
- `serve.ps1` — minimal local HTTP server (`powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8000]`). Needed because `fetch` of the JSON sets fails under `file://`; the app detects that protocol and says so.

**Adding a set requires no code change.** `app.js` discovers sets by probing `1.json`, `2.json`, … in order and stopping after 3 consecutive misses (`MISS_TOLERANCE`), so dropping in `6.json` and reloading is enough. A gap of more than 2 missing numbers truncates discovery.

### How the app works

Single page, three screens (`#screen-home` / `#screen-exam` / `#screen-result`) toggled by `show()`; no router, no framework. On start, `buildQuiz()` Fisher–Yates shuffles the question order *and* each question's options, then displays options with positional letters (A–D by display position) while grading against the original `correct_answer` key stored on each option — so shuffling never breaks grading, and two students never see the same paper. Submission is blocked until every question is answered; answers and score are revealed only on the result screen, which renders the same `questionCard()` in review mode with correct/chosen highlighting and All / Mistakes / Correct filters. Nothing is persisted — a reload loses the attempt (guarded by `beforeunload`).

`app.js` validates each set on load and refuses to start with a clear message if a file breaks the data contract (missing keys, or a `correct_answer` that is not one of its own option keys).

## Data contract

Every set file is a single JSON object with exactly these top-level keys, in this order:

```json
{
  "title": "…",
  "total_questions": 70,
  "marks_per_question": 1,
  "total_marks": 70,
  "questions": [
    { "id": 1, "question": "…", "options": { "A": "…", "B": "…", "C": "…", "D": "…" }, "correct_answer": "B" }
  ]
}
```

Invariants that all existing files satisfy and any new/edited file must preserve:

- `questions` has exactly `total_questions` entries; `id` runs 1..N contiguously in array order.
- `options` always has exactly the four keys `A`,`B`,`C`,`D`.
- `correct_answer` is one of those four keys (never the option text).
- `total_marks == total_questions * marks_per_question`.
- 2-space indentation, UTF-8 **without** BOM, CRLF line endings (matches the existing files).

## Set conventions

- **Language:** `1.json` is written in Nepali (Devanagari) with English pharmacy/technical terms left in English; `2.json`–`5.json` are in English. Match the language of the file being edited; don't mix.
- **`title`:** "Nepal Health Service … Fifth Level - … Set N" (or the Nepali equivalent). Wording of the title varies slightly between files, but the trailing set number must match the filename.
- **Topic ordering within a set** (roughly, and worth preserving when adding questions): Q1–~15 general knowledge / geography / international organizations; ~15–30 office management, administration, constitution, professional conduct; ~30–70 pharmacy subject matter — dosage forms, drug policy and quality (GMP, pharmacopoeias), dispensing, primary health care, pharmaceutical analysis (titrimetry, chromatography), pharmacology/pharmacokinetics, and drug supply/inventory management.

## Known data issues (do not "fix" silently — confirm with the user first)

- `3.json` is a byte-identical duplicate of `2.json`, including its `"… MCQ Set 2"` title. If a genuine Set 3 is needed, it must be authored from scratch.
- A handful of questions repeat across sets (e.g. `2.json` q8 ≡ `4.json` q6; `2.json` q41 ≡ `4.json` q37; `2.json` q65 ≡ `4.json` q67; `2.json` q57 ≡ `5.json` q53).
- Correct answers are heavily skewed toward `A`/`B` (e.g. 45/70 are `A` in sets 2, 3 and 5). When authoring a new set, distribute the correct option more evenly.

## Validating a set

Neither `node` nor `python` is on PATH in this environment — use PowerShell for validation. This checks the invariants above for every set:

```powershell
foreach ($f in Get-ChildItem *.json) {
  $d = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json
  $qs = $d.questions
  $ids = $qs | ForEach-Object { $_.id }
  $badOpts = $qs | Where-Object { (($_.options.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'A,B,C,D' }
  $badAns  = $qs | Where-Object { $null -eq $_.options.($_.correct_answer) }
  $dist = ($qs | Group-Object correct_answer | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ' '
  Write-Output "$($f.Name): declared=$($d.total_questions) actual=$($qs.Count) contiguousIds=$((Compare-Object $ids (1..$qs.Count)).Count -eq 0) badOptionSets=$($badOpts.Count) badAnswers=$(($badAns | ForEach-Object { $_.id }) -join ',') dist: $dist"
}
```

Run it after any edit to a set file — a hand-edit that drops an option key or renumbers ids is the most likely way to break the data.
