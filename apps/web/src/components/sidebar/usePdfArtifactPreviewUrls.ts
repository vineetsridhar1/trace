import { useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import type { SessionGroupEntity } from "@trace/client-core";
import { client } from "../../lib/urql";

type PdfPreviewResponse = Record<string, string | null | undefined>;

export function usePdfArtifactPreviewUrls(groups: SessionGroupEntity[]): Record<string, string> {
  const requestKey = groups
    .map(
      (group) =>
        `${group.id}:${group.pdfExportStatus ?? ""}:${group.pdfExportCommitSha ?? ""}:${group.pdfExportCapturedAt ?? ""}`,
    )
    .join("|");
  const request = useMemo(() => {
    const groupIds = requestKey ? requestKey.split("|").map((entry) => entry.split(":")[0]) : [];
    const variables: Record<string, string> = {};
    const fields = groupIds.map((groupId, index) => {
      const variableName = `sessionGroupId${index}`;
      variables[variableName] = groupId;
      return `preview${index}: pdfSessionPreviewUrl(sessionGroupId: $${variableName})`;
    });
    const declarations = Object.keys(variables)
      .map((variableName) => `$${variableName}: ID!`)
      .join(", ");

    return {
      groupIds,
      query: fields.length
        ? gql`query PdfArtifactPreviews(${declarations}) { ${fields.join(" ")} }`
        : null,
      variables,
    };
  }, [requestKey]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!request.query) {
      setPreviewUrls({});
      return;
    }

    let active = true;
    void client
      .query<PdfPreviewResponse, Record<string, string>>(request.query, request.variables, {
        requestPolicy: "network-only",
      })
      .toPromise()
      .then((result) => {
        if (!active || result.error) return;
        const nextUrls: Record<string, string> = {};
        request.groupIds.forEach((groupId, index) => {
          const url = result.data?.[`preview${index}`];
          if (typeof url === "string") nextUrls[groupId] = url;
        });
        setPreviewUrls(nextUrls);
      });

    return () => {
      active = false;
    };
  }, [request]);

  return previewUrls;
}
