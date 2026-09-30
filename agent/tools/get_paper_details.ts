import { defineTool } from "eve/tools";
import { z } from "zod";
import { lookupLiteratureWork } from "../../lib/literature/search";
import { truncateText } from "../lib/tool-runtime";

const inputSchema = z.object({
  paperId: z
    .string()
    .trim()
    .min(3)
    .max(300)
    .describe(
      "The paper identifier: a DOI ('10.1038/nrn3241'), PMID, OpenAlex ID ('W1973275441'), " +
      "a doi.org / pubmed.ncbi.nlm.nih.gov / openalex.org URL, or an id returned by search_literature " +
      "('openalex:W...', 'pubmed:...', 'crossref:...').",
    ),
  includeReferences: z
    .boolean()
    .default(false)
    .describe("Resolve the paper's reference list to titles and years."),
  referenceLimit: z.number().int().min(1).max(50).default(10).describe("Max references to resolve."),
});

export default defineTool({
  description:
    "Get detailed information about a specific academic paper from OpenAlex using a DOI, PMID, OpenAlex ID, paper URL, or an id returned by search_literature. Returns the abstract, authors, venue, citation count, open-access PDF links, and optionally the paper's reference list.",
  inputSchema,
  async execute({ paperId, includeReferences, referenceLimit }) {
    const { work, references, referencesTruncated, referencesUnavailable } = await lookupLiteratureWork({
      paperId,
      includeReferences,
      referenceLimit,
    });
    return {
      id: `openalex:${work.openalexId}`,
      title: work.title,
      authors: work.authors.slice(0, 50),
      year: work.year ?? null,
      publicationDate: work.publicationDate ?? null,
      venue: work.venue ?? null,
      type: work.workType ?? null,
      abstract: work.abstract ? truncateText(work.abstract, 8_000).content : null,
      keywords: work.keywords ?? null,
      doi: work.doi ?? null,
      pmid: work.pmid ?? null,
      pmcid: work.pmcid ?? null,
      url: work.url,
      openAccessUrl: work.openAccessUrl ?? null,
      pdfUrl: work.pdfUrl ?? null,
      isOpenAccess: work.isOpenAccess,
      citationCount: work.citationCount ?? null,
      referencedWorksCount: work.referencedWorksCount ?? null,
      references: includeReferences ? references : undefined,
      referencesTruncated: includeReferences ? referencesTruncated : undefined,
      referencesUnavailable: includeReferences && referencesUnavailable ? true : undefined,
    };
  },
});
