/**
 * Static enforcement: supervisor-agent.service.ts must not contain any pattern
 * listed in SUPERVISOR_FORBIDDEN_SERVICE_PATTERNS. If this test fails, a
 * developer has introduced a capability that violates governance boundaries.
 */

import * as fs from "fs";
import * as path from "path";
import { SUPERVISOR_FORBIDDEN_SERVICE_PATTERNS } from "../governance";

const SERVICE_PATH = path.resolve(
  __dirname,
  "../../../services/supervisor-agent.service.ts"
);

describe("Supervisor AI governance boundary", () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SERVICE_PATH, "utf-8");
  });

  for (const pattern of SUPERVISOR_FORBIDDEN_SERVICE_PATTERNS) {
    it(`supervisor-agent.service.ts must not contain forbidden pattern: "${pattern}"`, () => {
      expect(source).not.toContain(pattern);
    });
  }

  it("supervisor-agent.service.ts exists and is non-empty", () => {
    expect(source.length).toBeGreaterThan(100);
  });
});
