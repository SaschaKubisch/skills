# 0001 — Sample ticket

Summary: A minimal ticket used only to test the evidence checker.
Parent: None yet
Kind: feat

## Type

AFK

## What to build

A widget appears on the page.

## Invariants this touches

- 1. The widget is always visible when active, checked by exit condition 4.

## Steps

1. the checks pass: the baseline confirmed — proves: the commands run green
2. the widget's condition — proves: settled line 1
3. the widget on the page — proves: settled line 2

## Exit conditions

```
npm run lint
npx tsc --noEmit
npm test
npx playwright test e2e/widget.spec.ts
```

NOT CHECKED
- None.

HUMAN CHECK
- None.

## Blocked by

Nothing — can start now.

## Out of scope for this slice

Nothing.
