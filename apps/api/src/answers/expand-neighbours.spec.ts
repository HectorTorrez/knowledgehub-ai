import { describe, expect, it } from "vitest";
import { renderSourcesSection, type AnswerSource } from "./answer-context.js";
import { expandNeighbours } from "./expand-neighbours.js";

const source: AnswerSource = {
  marker: 1,
  chunkId: "a",
  documentId: "doc",
  documentTitle: "Title",
  pageNumber: 2,
  chunkIndex: 1,
  content: "x".repeat(320) + "end",
  similarity: 1,
};

describe("expandNeighbours", () => {
  it("joins ordered neighbours, removes overlap, and preserves citation metadata", () => {
    const result = expandNeighbours(
      [source],
      [
        {
          chunkId: "before",
          documentId: "doc",
          chunkIndex: 0,
          content: "start" + "x".repeat(320),
        },
        { chunkId: "after", documentId: "doc", chunkIndex: 2, content: "next" },
      ],
      10000,
    );
    expect(result).toEqual([
      { ...source, content: "start" + source.content + "\nnext" },
    ]);
  });

  it("reserves selected chunks and assigns a shared neighbour only once", () => {
    const other = {
      ...source,
      marker: 2,
      chunkId: "b",
      chunkIndex: 3,
      content: "other",
    };
    const shared = {
      chunkId: "shared",
      documentId: "doc",
      chunkIndex: 2,
      content: "shared",
    };
    const result = expandNeighbours(
      [source, other],
      [shared, { ...shared, chunkId: "b", chunkIndex: 3 }],
      10000,
    );
    expect(result[0]!.content).toContain("shared");
    expect(result[1]!.content).toBe("other");
  });

  it("respects the rendered character budget", () => {
    const neighbour = {
      chunkId: "n",
      documentId: "doc",
      chunkIndex: 2,
      content: "&".repeat(10),
    };
    expect(
      expandNeighbours(
        [source],
        [neighbour],
        renderSourcesSection([source]).length,
      ),
    ).toEqual([source]);
  });
});
