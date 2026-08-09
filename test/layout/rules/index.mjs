/**
 * The rule table.
 *
 * Every rule has one shape, (observations, config) => findings, which is what
 * lets the runner treat them as a list and what lets a rule be unit-tested
 * against a hand-written observation array with no browser involved.
 */
import { A1, A2, A3 } from "./alignment.mjs";
import { G1, G2, G3 } from "./grid.mjs";
import { P1, P2, P3 } from "./separation.mjs";

export const RULES = { G1, G2, G3, A1, A2, A3, P1, P2, P3 };

export const RULE_GROUPS = {
    G: { title: "Grid conformance", rules: ["G1", "G2", "G3"] },
    A: { title: "Alignment", rules: ["A1", "A2", "A3"] },
    P: { title: "Separation", rules: ["P1", "P2", "P3"] },
};

/** Run every rule and stamp each finding with where it was found. */
export const evaluate = (observations, config, context) => {
    const findings = [];

    for (const [name, rule] of Object.entries(RULES)) {
        for (const found of rule(observations, config))
            findings.push({ ...found, rule: found.rule ?? name, ...context });
    }

    return findings;
};
