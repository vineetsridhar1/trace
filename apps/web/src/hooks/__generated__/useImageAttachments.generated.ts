import { gql } from "@apollo/client";
import * as Apollo from "@apollo/client";
const defaultOptions = {} as const;

export type UploadAttachmentMutationVariables = {
  data: string;
  filename: string;
  contentType: string;
};

export type UploadAttachmentMutation = {
  __typename?: "Mutation";
  uploadAttachment: {
    __typename?: "Attachment";
    id: string;
    key: string;
    filename: string;
    contentType: string;
    byteSize: number;
    url: string;
    localPath: string;
  };
};

export const UploadAttachmentDocument = gql`
  mutation UploadAttachment(
    $data: String!
    $filename: String!
    $contentType: String!
  ) {
    uploadAttachment(
      data: $data
      filename: $filename
      contentType: $contentType
    ) {
      id
      key
      filename
      contentType
      byteSize
      url
      localPath
    }
  }
`;

export function useUploadAttachmentMutation(
  baseOptions?: Apollo.MutationHookOptions<
    UploadAttachmentMutation,
    UploadAttachmentMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useMutation<
    UploadAttachmentMutation,
    UploadAttachmentMutationVariables
  >(UploadAttachmentDocument, options);
}
