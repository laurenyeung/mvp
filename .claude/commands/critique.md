Perform a UI/UX critique of the specified component, page, or feature.

## Process

Read the component file(s), then evaluate against each category below.
State the file path and line number for each finding.

## Visual consistency
- [ ] Spacing follows the Tailwind scale (no arbitrary px values where a scale value exists)
- [ ] Typography uses defined classes (page-header, text-sm, text-xs) consistently
- [ ] Colors come from the design token set (pixel-accent, pixel-border, brand-50, etc.) — no raw hex
- [ ] Icon sizes consistent within context (nav = 20, inline = 16, micro = 12–13)

## Component reuse
- [ ] Does this duplicate a pattern that already exists in another component?
- [ ] Could shared markup be extracted into a reusable component without over-engineering?

## States coverage
- [ ] Loading state present (skeleton or spinner)?
- [ ] Empty state present (not just a blank screen)?
- [ ] Error state present (API failure handled gracefully)?
- [ ] Disabled/pending state on buttons that trigger async actions?

## Mobile
- [ ] Layout works at 375px width (iPhone SE)
- [ ] Touch targets ≥ 44px for interactive elements
- [ ] No horizontal overflow introduced
- [ ] Safe-area padding applied where needed (bottom nav, notch)

## Accessibility
- [ ] Interactive elements have accessible labels (aria-label where icon-only)
- [ ] Colour contrast adequate for text on coloured backgrounds
- [ ] Focus states visible (not removed with outline-none without replacement)

## UX flow
- [ ] Is the user's next action obvious?
- [ ] Are destructive actions confirmed before executing?
- [ ] Do success/error states give clear feedback?
- [ ] Are long operations (saves, uploads) communicated with a loading state?

Report each finding as: **[category] file:line — Issue — Suggested fix**
