import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { ldb } from "../../../db/learningDb";
import { getMeta } from "../../../services/metaStore";
import { completeOnboarding } from "../OnboardingFlow";

describe("OnboardingFlow skip / completion (U2)", () => {
  beforeEach(async () => {
    await ldb.delete();
    await ldb.open();
  });

  it("skipping and completing onboarding marks onboardingDone=true and creates zero cards or unitProgress records", async () => {
    expect(await getMeta<boolean>("onboardingDone", false)).toBe(false);

    await completeOnboarding();

    expect(await getMeta<boolean>("onboardingDone", false)).toBe(true);
    expect(await ldb.cards.count()).toBe(0);
    expect(await ldb.unitProgress.count()).toBe(0);
  });
});
