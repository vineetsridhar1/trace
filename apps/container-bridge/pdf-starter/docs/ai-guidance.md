# PDF artifact guidance

## Artifact contract

- Build one self-contained, print-ready document in `src/App.tsx`.
- Use semantic HTML, local styles, and explicit page-break rules. The document must work at A4 and Letter sizes.
- Keep the `Download PDF` button and the print CSS. It opens the browser print-to-PDF workflow from the live preview.
- Do not add server routes, databases, authentication, network calls, or package dependencies unless the document itself truly needs them.

## Workflow

1. Resolve the audience, goal, page count, required content, and visual direction.
2. Read `docs/playbooks/README.md` and the most relevant playbook.
3. Make a valid first document change quickly, then refine hierarchy, typography, content, and page breaks in small batches.
4. Check the document in the live preview and print preview. Avoid clipped content, stranded headings, tiny type, and decorative elements that obscure information.
5. Run `pnpm test` before delivery.

## Print rules

- Use `break-before`, `break-after`, and `break-inside: avoid` purposefully rather than fixed viewport heights.
- Keep body text readable in print (generally 10–12pt), provide sufficient contrast, and ensure links or calls to action still make sense on paper.
- Hide authoring-only controls in `@media print`.
