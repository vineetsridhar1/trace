import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DesignBadge } from "./DesignBadge";
import { DesignButton } from "./DesignButton";
import { DesignCard } from "./DesignCard";
import { DesignField } from "./DesignField";
import { DesignGrid } from "./DesignGrid";
import { DesignScreen } from "./DesignScreen";
import { DesignStack } from "./DesignStack";

test("renders token-driven composition primitives with accessible defaults", () => {
  const html = renderToStaticMarkup(
    <DesignScreen>
      <DesignStack>
        <DesignBadge>Status</DesignBadge>
        <DesignGrid>
          <DesignCard>Summary</DesignCard>
          <DesignField label="Project name" hint="Use a memorable name" />
        </DesignGrid>
        <DesignButton>Continue</DesignButton>
      </DesignStack>
    </DesignScreen>,
  );

  assert.match(html, /bg-design-background/);
  assert.match(html, /bg-design-surface/);
  assert.match(html, /<label/);
  assert.match(html, /<button type="button"/);
  assert.match(html, /Continue/);
});
