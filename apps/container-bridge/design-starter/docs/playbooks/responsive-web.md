# Responsive product playbook

- Treat desktop, tablet, and mobile as related compositions with shared intent, not scaled copies.
- Declare representative viewports in `design.canvas.json` and keep the same task recognizable at each size.
- Decide which navigation collapses, which content reorders, and which secondary controls become progressive disclosure.
- Preserve primary actions and critical context across breakpoints; remove low-value decoration before hiding essential information.
- Use fluid line lengths and explicit wrapping behavior. Test the longest realistic labels and content.
- Include at least one interaction or state that proves responsive behavior when the brief asks for a responsive system.
- Record breakpoint-specific assumptions in `design.brief.json` rather than burying them in component code.
