/** Shared fact-key vocabulary. Extractors and connectors write these; later steps read them. */
export const FK = {
  segment: "segment",
  stage: "stage",
  b2b: "b2b",
  token: "has_token",
  funding: "funding_round",
  tvl: "tvl",
  chains: "chains",
  audit: "audit_report",
  pentest: "pentest_mention",
  compliance: "compliance_claim",
  bugBounty: "bug_bounty",
  incident: "incident",
  contact: "contact",
  trigger: "trigger",
  language: "language",
  codeActivity: "code_activity",   // { lastPushAt, repo }
  codeLoc: "code_loc",             // number (estimate → inference)
} as const;
