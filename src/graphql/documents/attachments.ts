import { gql } from 'urql';

export const UPLOAD_ATTACHMENT_MUTATION = gql`
  mutation UploadAttachment($data: String!, $filename: String!, $contentType: String!) {
    uploadAttachment(data: $data, filename: $filename, contentType: $contentType) {
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
