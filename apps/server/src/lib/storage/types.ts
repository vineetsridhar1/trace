export interface StorageAdapter {
  /** Generate a URL the client can PUT file bytes to. */
  getPutUrl(key: string, contentType: string): Promise<string>;
  /** Generate a URL any client (including bridges) can GET the file from. */
  getGetUrl(key: string): Promise<string>;
}
