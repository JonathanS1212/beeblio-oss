declare module "word-extractor" {
  interface ExtractedDocument {
    getBody(): string;
    getFootnotes(): string;
    getEndnotes(): string;
    getHeaders(): string;
    getTextboxes(): string;
  }
  export default class WordExtractor {
    extract(input: Buffer): Promise<ExtractedDocument>;
  }
}
