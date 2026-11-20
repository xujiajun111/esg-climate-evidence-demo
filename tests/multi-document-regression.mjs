import assert from "node:assert/strict";
import { analyzeDocuments } from "../public/analyzer.js";

function extraction(name, year, text) {
  return {
    file: { name, size_bytes: text.length },
    extracted_text: text,
    pages: [
      {
        page_number: 1,
        text,
        clean_text: text
      }
    ]
  };
}

const commitment =
  "公司承诺到2030年将绿电采购占比提升至40%。";
const documents = [
  extraction("某企业-2022可持续发展报告.pdf", 2022, commitment),
  extraction("某企业-2023可持续发展报告.pdf", 2023, commitment),
  extraction(
    "某企业-2024可持续发展报告.pdf",
    2024,
    [
      "报告期内，公司完成分布式光伏项目并网发电。",
      "本期绿电采购占比为21%，较上年提升5个百分点。"
    ].join("\n")
  )
];

const analysis = analyzeDocuments(documents, { multi_document: true });
assert.equal(analysis.report_context.document_count, 3);
assert.deepEqual(analysis.report_context.report_years, [2022, 2023, 2024]);

const commitments = analysis.elements.filter(
  (element) => element.element_type === "commitment"
);
assert.equal(
  commitments.length,
  1,
  "identical repeated commitments should be deduplicated"
);
assert.equal(commitments[0].report_year, 2022);
assert.equal(commitments[0].source_occurrences.length, 2);
assert.deepEqual(
  commitments[0].source_occurrences.map((item) => item.report_year).sort(),
  [2022, 2023]
);

const action = analysis.elements.find(
  (element) => element.element_type === "action"
);
const performance = analysis.elements.find(
  (element) => element.element_type === "performance"
);
assert.ok(action);
assert.ok(performance);
assert.equal(action.source_document.report_year, 2024);
assert.equal(performance.source_document.report_year, 2024);
assert.equal(commitments[0].chain_status, "complete");
assert.equal(performance.action_id, action.id);

console.log("multi-document regression passed");
