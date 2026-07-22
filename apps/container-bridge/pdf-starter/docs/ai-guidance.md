# PDF artifact guidance

## Artifact contract

- Build one self-contained, print-ready document in `src/App.tsx`.
- `document.format.json` is the source of truth for the canvas size. Update its width, height, and unit (`mm` or `in`) when the user asks for a different size. The preview canvas and downloaded PDF both use that format.
- Use semantic HTML, local styles, and explicit page-break rules.
- Keep the print CSS. Trace owns the size picker and Download PDF button outside the document. Use `document.format.json` for the durable AI-authored default; do not add authoring or download controls inside the artifact.
- Edit document content in `src/App.tsx`. Do not modify `src/main.tsx` or `src/TracePdfRuntime.tsx`; Trace owns those files so preview sizing and printing remain reliable.
- Give meaningful layout and text elements stable, unique `data-trace-id` attributes and set
  `data-trace-source="src/App.tsx"`. Preserve these attributes so manual content and visual edits
  can round-trip into the document source. Static text is content-editable; dynamic or nested markup
  remains appearance-only.
- Do not stop, restart, or replace the managed dev server. It is already running on port 3000; edit files and let Vite's HMR or automatic config restart update the preview.
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
