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
  /** Store bytes server-side using the same key namespace as client uploads. */
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Read a server-owned object without exposing the storage provider to a client. */
  getObject(key: string): Promise<Buffer>;
  /** Generate a URL any client (including bridges) can GET the file from. */
  getGetUrl(key: string, options?: { downloadFilename?: string }): Promise<string>;
}
