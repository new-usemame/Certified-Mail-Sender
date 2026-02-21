# Mobile Responsive Design Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the site fully mobile-friendly across all pages with CSS-only changes.

**Architecture:** Add a 768px tablet breakpoint and expand the existing 480px phone breakpoint in `public/style.css`. All changes are pure CSS -- no JS or HTML template modifications.

**Tech Stack:** CSS (vanilla), EJS templates (read-only reference)

---

### Task 1: Add Tablet Breakpoint (768px) with Navigation Fix

**Files:**
- Modify: `public/style.css:908-927` (responsive section)

**Step 1: Add 768px breakpoint before the existing 480px block**

Insert this new media query block at line 909, before the existing `@media (max-width: 480px)`:

```css
@media (max-width: 768px) {
  .site-nav {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: .25rem;
  }

  .site-nav a {
    font-size: .75rem;
    padding: .5rem .65rem;
    margin: 0;
  }

  .footer-nav {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: .15rem;
  }

  .footer-nav a {
    padding: .45rem .55rem;
    margin: 0;
  }

  .steps {
    flex-direction: column;
  }
}
```

**Step 2: Verify visually**

Run: `node server.js`
Open browser at the site URL, resize to ~700px width. Confirm:
- Header nav wraps into 2 rows, centered, each link comfortably tappable
- Footer nav wraps similarly
- Steps on "How It Works" stack vertically

**Step 3: Commit**

```bash
git add public/style.css
git commit -m "feat: add 768px tablet breakpoint for nav and steps"
```

---

### Task 2: Fix Info Rows for Mobile (Order & Success Pages)

**Files:**
- Modify: `public/style.css` (inside the 480px media query)

**Step 1: Add info-row stacking rules to the 480px breakpoint**

Add these rules inside `@media (max-width: 480px) { ... }`:

```css
  .info-row {
    flex-direction: column;
    align-items: flex-start;
    gap: .15rem;
  }

  .info-value {
    text-align: left;
  }
```

**Step 2: Verify visually**

Resize browser to ~375px. Navigate to an order page. Confirm:
- Info label is on top, value is below it (not side-by-side)
- Tracking number URLs don't overflow
- All info rows look clean and readable

**Step 3: Commit**

```bash
git add public/style.css
git commit -m "feat: stack info rows vertically on mobile"
```

---

### Task 3: Vertical Timeline on Mobile

**Files:**
- Modify: `public/style.css` (inside the 480px media query)

**Step 1: Replace horizontal timeline with vertical layout at 480px**

Replace these existing 480px timeline rules:

```css
  .timeline { overflow-x: auto; justify-content: flex-start; padding-bottom: .5rem; }
  .timeline-label { font-size: .55rem; max-width: 55px; }
  .timeline-dot { width: 30px; height: 30px; font-size: .65rem; }
  .timeline-connector { min-width: 12px; margin-top: 15px; }
```

With:

```css
  .timeline {
    flex-direction: column;
    align-items: flex-start;
    padding: 0 0 0 1rem;
    overflow-x: visible;
  }

  .timeline-step {
    flex-direction: row;
    align-items: center;
    gap: .75rem;
  }

  .timeline-dot {
    width: 32px;
    height: 32px;
    font-size: .7rem;
    flex-shrink: 0;
  }

  .timeline-label {
    font-size: .7rem;
    max-width: none;
    text-align: left;
  }

  .timeline-connector {
    width: 2px;
    height: 20px;
    min-width: 2px;
    margin-top: 0;
    margin-left: calc(1rem + 15px);
  }
```

**Step 2: Verify visually**

Resize to ~375px. Navigate to an order page with an active timeline. Confirm:
- Timeline displays vertically (top to bottom)
- Dots on the left, labels to the right
- Connectors are vertical lines between dots
- No horizontal scrolling needed

**Step 3: Commit**

```bash
git add public/style.css
git commit -m "feat: vertical timeline layout on mobile"
```

---

### Task 4: Pricing Table Mobile Adjustment

**Files:**
- Modify: `public/style.css` (inside the 480px media query)

**Step 1: Add pricing table mobile rules to the 480px breakpoint**

```css
  .pricing-table {
    font-size: .85rem;
  }

  .pricing-table th,
  .pricing-table td {
    padding: .45rem .5rem;
  }
```

**Step 2: Verify visually**

Resize to ~375px. Navigate to /pricing. Confirm:
- Table fits within the viewport
- Text is readable
- No horizontal overflow

**Step 3: Commit**

```bash
git add public/style.css
git commit -m "feat: tighten pricing table on mobile"
```

---

### Task 5: Touch Target and Spacing Polish

**Files:**
- Modify: `public/style.css` (both breakpoints)

**Step 1: Add remaining polish rules**

In the **768px** breakpoint, add:

```css
  .faq-item summary {
    padding: .85rem 2.5rem .85rem 1rem;
    min-height: 44px;
  }
```

In the **480px** breakpoint, add:

```css
  .form-section {
    padding: 1rem .75rem .5rem;
  }

  p.subtitle {
    font-size: .85rem;
  }

  hr {
    margin: 1.25rem 0;
  }

  .order-status-banner {
    padding: 1.25rem .75rem;
  }

  .tracking-link-box {
    padding: .75rem;
  }

  .magic-link {
    font-size: .7rem;
  }
```

**Step 2: Verify visually**

Resize to ~375px. Test each page:
- / (home): form sections have comfortable but not excessive padding
- /how-it-works: steps stacked, subtitle readable
- /pricing: table fits, spacing clean
- /faq: each summary item is comfortably tappable
- /about: content flows well
- /contact: form looks good
- /order: info rows stacked, timeline vertical, tracking link doesn't overflow
- /success: same as order page

**Step 3: Commit**

```bash
git add public/style.css
git commit -m "feat: mobile touch targets and spacing polish"
```

---

### Task 6: Final Verification Across All Pages

**Step 1: Open browser dev tools, test at 375px, 414px, 768px, and 640px**

Verify all 10 pages render correctly:
1. `/` -- form fields, rows, price box, submit button
2. `/how-it-works` -- steps, CTA button
3. `/pricing` -- table, CTA button
4. `/faq` -- accordion items, CTA button
5. `/about` -- content, lists, CTA button
6. `/contact` -- form, submit button
7. `/success` -- status banner, order grid, info rows, timeline, tracking box
8. `/order/:token` -- same as success
9. `/cancel` -- message box, link
10. `/status` -- if enabled

**Step 2: Check for any overflow or text clipping**

At each width, ensure no horizontal scrollbar appears on any page.

**Step 3: Final commit if any fixes needed**
