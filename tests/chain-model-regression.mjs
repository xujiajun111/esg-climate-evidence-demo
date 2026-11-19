import assert from "node:assert/strict";
import {
  buildEvidenceChains,
  buildYearSeries,
  filterEvidenceChains,
  findChainForEvidence
} from "../public/chain-model.js";

const analysis = {
  elements: [
    {
      id: "C-01",
      element_type: "commitment",
      content: "2030 年绿电占比达到 40%",
      report_year: 2022,
      linked_actions: ["A-01"],
      linked_performances: ["P-01"],
      chain_status: "complete"
    },
    {
      id: "C-02",
      element_type: "commitment",
      content: "2028 年吨钢碳排放下降 18%",
      report_year: 2022,
      linked_actions: ["A-02"],
      linked_performances: ["P-02"],
      chain_status: "breakpoint_b"
    },
    {
      id: "C-03",
      element_type: "commitment",
      content: "2027 年运营边界碳中和",
      report_year: 2023,
      linked_actions: [],
      linked_performances: [],
      chain_status: "breakpoint_a"
    },
    {
      id: "A-01",
      element_type: "action",
      content: "建设分布式光伏",
      report_year: 2023,
      commitment_id: "C-01"
    },
    {
      id: "A-02",
      element_type: "action",
      content: "完成余热回收改造",
      report_year: 2023,
      commitment_id: "C-02"
    },
    {
      id: "P-01",
      element_type: "performance",
      content: "绿电占比 21%",
      report_year: 2024,
      commitment_id: "C-01",
      action_id: "A-01"
    },
    {
      id: "P-02",
      element_type: "performance",
      content: "吨钢碳排放同比下降 4.2%",
      report_year: 2024,
      commitment_id: "C-02"
    },
    {
      id: "P-03",
      element_type: "performance",
      content: "碳排放同比下降 10%",
      report_year: 2024
    }
  ],
  breakpoints: [
    {
      id: "BP-001",
      type: "A",
      commitment_id: "C-03",
      evidence_ids: ["C-03"]
    },
    {
      id: "BP-002",
      type: "B",
      commitment_id: "C-02",
      evidence_ids: ["C-02", "A-02", "P-02"]
    },
    {
      id: "BP-003",
      type: "C",
      commitment_id: null,
      evidence_ids: ["P-03"]
    }
  ]
};

const chains = buildEvidenceChains(analysis);
assert.equal(chains.length, 4);
assert.deepEqual(
  chains.slice(0, 3).map((chain) => chain.type),
  ["complete", "B", "A"]
);
assert.equal(chains[3].type, "C");
assert.equal(chains[3].isOrphan, true);
assert.deepEqual(chains[0].elementIds, ["C-01", "A-01", "P-01"]);
assert.equal(chains[0].breakpoints.length, 0);
assert.equal(chains[1].breakpoints[0].id, "BP-002");
assert.equal(findChainForEvidence(chains, "P-03").id, "orphan-P-03");

assert.equal(filterEvidenceChains(chains, "all").length, 4);
assert.equal(filterEvidenceChains(chains, "complete").length, 1);
assert.equal(filterEvidenceChains(chains, "A").length, 1);
assert.equal(filterEvidenceChains(chains, "B").length, 1);
assert.equal(filterEvidenceChains(chains, "C").length, 1);

assert.deepEqual(buildYearSeries(analysis.elements), [
  { year: 2022, commitment: 2, action: 0, performance: 0, total: 2 },
  { year: 2023, commitment: 1, action: 2, performance: 0, total: 3 },
  { year: 2024, commitment: 0, action: 0, performance: 3, total: 3 }
]);

console.log("chain-model regression passed");
