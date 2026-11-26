declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const url: string;
  export default url;
}

declare module "mammoth/mammoth.browser.js" {
  interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  const mammoth: {
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<MammothResult>;
    convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<MammothResult>;
  };
  export default mammoth;
}
