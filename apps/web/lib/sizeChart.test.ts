import { describe, expect, it } from "vitest";
import { looksLikeJson, parseSizeChart } from "./sizeChart";

const SKIRT =
  '{"sizeInfoList":[{"length":{"cm":"68-84","inch":"26.77-33.07"},"size":"S","vid":100014064},{"length":{"cm":"72-88","inch":"28.35-34.65"},"size":"M","vid":361386},{"length":{"cm":"76-92","inch":"29.92-36.22"},"size":"L","vid":361385},{"length":{"cm":"78-96","inch":"30.71-37.80"},"size":"XL","vid":100014065}]}';

describe("parseSizeChart", () => {
  it("turns AliExpress's sizeInfoList into rows and columns", () => {
    const chart = parseSizeChart(SKIRT)!;
    expect(chart.measures).toEqual([{ key: "length", label: "Length" }]);
    expect(chart.rows.map((r) => r.size)).toEqual(["S", "M", "L", "XL"]);
    expect(chart.rows[0].values.length).toEqual({ cm: "68–84", inch: "26.77–33.07" });
  });

  it("keeps several measurements, in the supplier's order, and ignores ids", () => {
    const chart = parseSizeChart(
      JSON.stringify({ sizeInfoList: [{ size: "M", bust: { cm: "88", inch: "34.6" }, waistLine: { cm: "70" }, vid: -2 }] }),
    )!;
    expect(chart.measures.map((m) => m.label)).toEqual(["Bust", "Waist line"]);
    expect(chart.rows[0].values.waistLine).toEqual({ cm: "70", inch: null });
  });

  it("rejects anything that isn't a size chart", () => {
    expect(parseSizeChart("Standard Size")).toBeNull();
    expect(parseSizeChart('{"other":1}')).toBeNull();
    expect(parseSizeChart('{"sizeInfoList":[{"size":"S","vid":1}]}')).toBeNull();
  });
});

describe("looksLikeJson", () => {
  it("spots raw JSON values", () => {
    expect(looksLikeJson(SKIRT)).toBe(true);
    expect(looksLikeJson("Cotton")).toBe(false);
  });
});
