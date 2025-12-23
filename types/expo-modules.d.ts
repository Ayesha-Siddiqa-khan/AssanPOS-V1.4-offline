declare module 'expo-sharing' {
  interface ShareOptions {
    mimeType?: string;
    UTI?: string;
    dialogTitle?: string;
  }

  export function isAvailableAsync(): Promise<boolean>;
  export function shareAsync(url: string, options?: ShareOptions): Promise<void>;
}

declare module 'expo-print' {
  interface PrintToFileOptions {
    html: string;
    base64?: boolean;
  }

  interface PrintToFileResult {
    uri: string;
    base64?: string;
  }

  export function printToFileAsync(
    options: PrintToFileOptions
  ): Promise<PrintToFileResult>;
}
