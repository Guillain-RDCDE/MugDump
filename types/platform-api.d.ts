/**
 * The platform contract shared by the browser implementation
 * (src/platform/web-api.js) and the Electron preload bridge (electron/preload.cjs).
 */
export interface PocketSave {
  name: string;
  volume: string;
  path: string;
  /** Desktop: absolute path. Web: File System Access handles. */
  handle?: FileSystemFileHandle;
  parent?: FileSystemDirectoryHandle;
  previewPixels?: Uint8Array | number[] | null;
}

export interface OpenedFile {
  buffer: ArrayBuffer;
  name: string;
  path: string | null;
  error?: string;
}

export interface PlatformApi {
  openSavFile(): Promise<OpenedFile | { error: string } | null>;
  getPathForFile(file: File): string | null;
  detectPocket(): Promise<{ saves: PocketSave[]; unsupported?: boolean }>;
  readFile(saveOrPath: PocketSave | string): Promise<OpenedFile | { error: string }>;
  deletePocketSave(
    save: PocketSave,
  ): Promise<{ deleted: true } | { canceled: true } | { error: string }>;
  savePng(dataUrl: string, defaultName: string): Promise<string | null>;
  savePngBatch(
    photos: { dataUrl: string; name: string }[],
    zipName?: string,
  ): Promise<{ dir: string; count: number; zipped?: boolean } | null>;
  saveGif(options: { bytes: Uint8Array; defaultName: string }): Promise<string | null>;
  exportSav(buffer: ArrayBuffer, defaultName: string): Promise<string | null>;
  saveProject(json: string, defaultName: string): Promise<string | null>;
  openProject(): Promise<{ json: string; name: string } | { error: string } | null>;
  fetchJson(url: string): Promise<unknown>;
  onMenuOpenSav(callback: () => void): void;
  onMenuOpenPocket(callback: () => void): void;
  onMenuExportAll(callback: () => void): void;
}

declare global {
  interface Window {
    /** Injected by electron/preload.cjs in the desktop build. */
    api?: PlatformApi;
    // File System Access API (Chromium only)
    showOpenFilePicker?(options?: object): Promise<FileSystemFileHandle[]>;
    showDirectoryPicker?(options?: object): Promise<FileSystemDirectoryHandle>;
  }
}
