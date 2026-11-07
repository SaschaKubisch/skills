---
name: options
description: >-
  Present options for a decision as a visual comparison page. Use whenever
  the person asks for options, alternatives, variants, versions, choices or
  "a few ways" to do something, or wants to choose between things: copy,
  layout, visual or print design, a screen or flow, architecture, naming, a
  plan. By default gives three genuinely different options, one
  recommendation, and a self-contained HTML page opened in the browser that
  shows each option as graphically as the context allows: the real rendered
  result for visual or print work, realistic screens or a built version of
  the UI for UX questions, a diagram per option for architecture or flows, a
  chart or matrix for trade-offs. The person can change the count ("five
  options") or the form ("just list them"). Applies nothing until the person
  chooses. Also typed as /options followed by what to choose between.
---

# Options

Turn "what are my choices?" into a page the person can look at and pick
from. The page does the explaining. The chat reply stays short.

## Defaults

- **Three options.**
- **A visual HTML page**, opened in the browser.
- **One recommendation**, with its reason.
- **Nothing applied** until the person chooses.

The person can override any of these in the request itself: "five options",
"two versions", "just list them", "no page". An explicit override wins.
Everything it does not mention stays at the default.

## Argument

Optional: what to choose between. With none, use the decision under
discussion.

```
/options a cover layout for the table menu
```

## Steps

### 1. Look at the real thing first

Read the files, run the generator, view the current screen, open the
current document. Build every option on what exists and use its names, its
tokens, its data and its constraints. Never ask what you can look up. Ask
one question only when there is nothing yet to choose between.

### 2. Make the options differ on something that matters

Each option differs from the others on an axis the person cares about:
approach, look, cost, risk, effort. Not in wording.

- If you cannot say in one line how B differs from A, one of them is
  redundant. Replace it.
- No strawman, and no "do nothing" as filler. "Do nothing" is an option only
  when it is a real contender.
- Every option must be feasible under the constraints already stated in the
  conversation.
- Use the person's own words and content verbatim. Do not invent facts,
  names, numbers or content they did not give. Mark anything you added, and
  say what you assumed.
- Find three. Show fewer only when the decision truly has fewer sound
  options, and say so.

### 3. Make each option concrete

Every option gets a name, a one-line pitch, what it trades away, and a
"choose this if". Then the visual.

### 4. Pick the visual by the kind of decision

Make it as graphic as the context allows. Where nothing is visual, still
draw something: a diagram, a chart, a matrix. A page of paragraphs is not
enough.

| The decision is about | Show |
|---|---|
| A screen, flow or UX | Realistic screens, not boxes. Build each option as real HTML and CSS with the project's own components, tokens and data where it has them, and embed a screenshot of it, or run it live in the page. Desktop and phone when the UI is responsive. If a build costs too much, a high-fidelity wireframe in the project's style, labelled as a wireframe. |
| Print or visual design: a page, cover, sign, poster, label, logo | The real rendered output of each option, produced by the project's own generator or source at true proportions, side by side. Not a sketch of it. |
| Text or copy | Each option set in place, in the actual layout or screen it will appear in. Not a list of sentences. |
| Architecture, data model, flow, process | One diagram per option, in the same notation and at the same scale, with the parts that differ highlighted. Inline SVG or Mermaid. |
| Plan, scope, cost, speed, risk | A bar or chart per criterion (effort, risk, time, reach), and a timeline when order matters. |
| Naming, branding, tone | Each option shown in use: a header, a button, a sign. Not a word list. |
| A code approach | A short snippet per option with the key difference marked, plus a diagram when the structure differs. |

End every page with a comparison matrix: criteria in rows, options in
columns, a visual mark per cell (a filled bar or a badge), the recommended
option marked.

When the project's instructions say who builds what, follow them for the
live versions: if code is delegated to an agent, delegate the build of the
options the same way.

### 5. Build the page

One self-contained HTML file: inline CSS, images embedded as base64 or
inline SVG, no external requests, no emojis. Start from `page-template.html`
beside this file and keep its structure:

- The title and the question being decided.
- The options side by side, stacking on narrow screens. Each is labelled
  Option A, B, C with its name and pitch. The recommended one carries a text
  badge.
- Each option's visual, large enough to judge. Clicking it opens the full
  size.
- The comparison matrix.
- The recommendation and the reason, and the assumptions.

Set the page's accent colour from the project's brand colour when it has
one.

**Where it goes.** Beside the rendered options when those files belong in
the project, for example in the generator's output folder. Otherwise in the
session's scratch directory or a temp directory, outside the repository.
Never commit it. Never upload or publish it unless the person asks.

### 6. Look at it before showing it

Render every option and view each image yourself. Take a screenshot of the
whole page at desktop width and at phone width and view both. Check that all
options are present and distinct, nothing is clipped or overlapping, no image
is blank, and every label matches the thing under it. Fix what is wrong and
check again. If something stays wrong, say so in the reply.

### 7. Open it

Open the page in the browser: `open` on macOS, `xdg-open` on Linux, `start`
on Windows. If it cannot open, give the full path.

### 8. Reply in the chat, briefly

- The path of the page.
- One line per option.
- The recommendation, and its reason in a sentence or two.
- Assumptions, and anything you added or could not verify.
- Which one to take: ask.

Do not restate the page.

## After the choice

Apply the chosen option exactly as shown. If the person mixes ("the text of
A with the layout of C"), apply the mix and show the result. Apply nothing
before the choice, not even the recommended option. Leave the page where it
is as the record of what was on the table.

## Rules

- Recommend. Say which option and why. Do not survey neutrally.
- Separate facts from assumptions.
- Keep it proportional. A small choice gets a small page, still visual.
- Follow the project's own instructions for language, naming, tone and
  style. The options are written and drawn the way the project's own work is.
