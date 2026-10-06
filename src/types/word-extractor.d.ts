declare module 'word-extractor' {
    interface ExtractedDoc {
        getBody(): string
    }
    export default class WordExtractor {
        extract(input: Buffer | string): Promise<ExtractedDoc>
    }
}
