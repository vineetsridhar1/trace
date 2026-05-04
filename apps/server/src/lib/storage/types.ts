export type UploadTarget =
  | {
      method: "PUT";
      url: string;
    }
  | {
      method: "POST";
      url: string;
      fields: Record<string, string>;
    };

export interface StorageAdapter {
  /** Generate a target the client can upload file bytes to. */
  getUploadTarget(key: string, contentType: string, maxBytes: number): Promise<UploadTarget>;
  /** Generate a URL any client (including bridges) can GET the file from. */
  getGetUrl(key: string, options?: { downloadFilename?: string }): Promise<string>;
}
