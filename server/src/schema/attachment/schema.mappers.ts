export interface AttachmentMapper {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  byteSize: number;
  url: string;
  localPath: string;
}
