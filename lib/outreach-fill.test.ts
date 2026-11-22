import { describe, expect, it } from "vitest";
import { fillTemplate, firstName, segmentsToText } from "@/app/_components/outreach-fill";

const tg1 = "Hey [Name] — saw [Project] just [launched / raised / went live on testnet]. Congrats!";
const tg2 = "Saw [Chain/Project] is [building / approaching mainnet / raising].";
const email5 = "Given [what they're building / recent launch / recent exploit in their ecosystem], now is a good time.";

describe("outreach template filling", () => {
  it("fills name, project and the trigger in the form the sentence needs", () => {
    const segs = fillTemplate(tg1, { project: "Morpho", firstName: "Merlin", trigger: "funding" });
    expect(segmentsToText(segs)).toBe("Hey Merlin — saw Morpho just raised. Congrats!");
    expect(segs.filter((s) => s.kind === "filled").map((s) => s.text)).toEqual(["Merlin", "Morpho", "raised"]);
    expect(segmentsToText(fillTemplate(tg2, { project: "Morpho", trigger: "mainnet_launch" }))).toBe("Saw Morpho is approaching mainnet.");
    expect(segmentsToText(fillTemplate(email5, { project: "Morpho", trigger: "ecosystem_incident" })))
      .toBe("Given the recent exploit in your ecosystem, now is a good time.");
  });

  it("leaves what it can't fill honestly as a [bracket] to do", () => {
    const segs = fillTemplate(`${tg1} [Your Name] | [Phone]`, { project: "Acme" });
    expect(segs.filter((s) => s.kind === "todo").map((s) => s.text)).toEqual([
      "[Name]", "[launched / raised / went live on testnet]", "[Your Name]", "[Phone]",
    ]);
  });

  it("first names", () => {
    expect(firstName("Paul Frambot 🦋")).toBe("Paul");
    expect(firstName("@rubilmax")).toBe("@rubilmax");
    expect(firstName(undefined)).toBeUndefined();
  });
});
