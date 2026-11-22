import { describe, it, expect } from "vitest";
import { shuffleItems, shuffleMatchRight, shuffleOrderBank } from "../questionShuffle";

describe("questionShuffle", () => {
  it("never returns order bank in exact answer order (even for 2 items)", () => {
    const bank = [{ id: "b1" }, { id: "b2" }];
    for (let s = 0; s < 50; s++) {
      const out = shuffleOrderBank(bank, ["b1", "b2"], `q_two:${s}`);
      expect(out.map((x) => x.id)).toEqual(["b2", "b1"]);
    }
  });

  it("never returns order bank with answer as exact prefix when distractors exist", () => {
    const bank = [{ id: "b1" }, { id: "b2" }, { id: "b3" }, { id: "d1" }, { id: "d2" }];
    const answer = ["b1", "b2", "b3"];
    for (let s = 0; s < 50; s++) {
      const out = shuffleOrderBank(bank, answer, `q_dist:${s}`);
      expect(out.map((x) => x.id).sort()).toEqual(bank.map((x) => x.id).sort());
      const prefixMatches = answer.every((id, i) => out[i].id === id);
      expect(prefixMatches).toBe(false);
    }
  });

  it("avoids identity alignment for match right column", () => {
    const left = [{ id: "l1" }, { id: "l2" }, { id: "l3" }];
    const right = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];
    const pairs: [string, string][] = [["l1", "r1"], ["l2", "r2"], ["l3", "r3"]];
    for (let s = 0; s < 50; s++) {
      const out = shuffleMatchRight(left, right, pairs, `q_match:${s}`);
      expect(out.map((x) => x.id).sort()).toEqual(["r1", "r2", "r3"]);
      const allAligned = left.every((_l, i) => out[i].id === pairs[i][1]);
      expect(allAligned).toBe(false);
    }
  });

  it("preserves all items when shuffling choices", () => {
    const opts = [{ id: "o1" }, { id: "o2" }, { id: "o3" }, { id: "o4" }];
    const out = shuffleItems(opts, "choice:q1:123");
    expect(out.map((x) => x.id).sort()).toEqual(["o1", "o2", "o3", "o4"]);
  });
});
