import type { BlotatoClient } from "./client.ts";
import { BlotatoApiError, BlotatoConfigError } from "./errors.ts";
import { diagnosePost, type Diagnosis } from "./diagnose.ts";
import { platformLabel } from "./platforms.ts";
import type { Account } from "./types.ts";

export type TicketCategory = "billing" | "how-to" | "technical";

export interface TicketInput {
  customerName?: string;
  subject?: string;
  message: string;
  submissionId?: string;
}

export interface TriageResult {
  category: TicketCategory;
  confidence: "high" | "medium";
  reasons: string[];
  submissionId: string | null;
  escalate: boolean;
  reply: string;
  internalLog: string | null;
  connectedPlatforms: string[];
  diagnosis: Diagnosis | null;
}

const SUBMISSION_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function classifyTicket(ticket: TicketInput): {
  category: TicketCategory;
  confidence: "high" | "medium";
  reasons: string[];
  submissionId: string | null;
} {
  const subject = ticket.subject ?? "";
  const blob = `${subject}\n${ticket.message}`;
  const fromField = ticket.submissionId?.trim() || "";
  const fromText = blob.match(SUBMISSION_ID)?.[0] ?? "";
  const submissionId = fromField || fromText || null;

  const asksHow = /\b(how do i|how to|where do i|where can i|can you show me how|what is the way)\b/i.test(blob);
  const hardTechnical = Boolean(submissionId)
    || /\b(401|403|422|500|429|timeout|n8n|webhook|stack trace|error message|postsubmissionid)\b/i.test(blob);
  const negatedFailure = /\bnothing failed\b|\bdidn't fail\b|\bdid not fail\b|\bnot a failed post\b/i.test(blob);
  const publishFailure = !negatedFailure && /\b(post failed|failed to publish|failed post|won't publish|will not publish|did not publish|publishing failed|status failed)\b/i.test(blob);
  const billing = /\b(refund|invoice|charged|billing|subscription|pricing|receipt|payment|cancel my plan|double charged)\b/i.test(blob);

  if (asksHow && !submissionId && !hardTechnical) {
    return { category: "how-to", confidence: "high", reasons: ["The customer is asking how something works."], submissionId };
  }
  if (billing && !submissionId && !publishFailure && !hardTechnical) {
    return { category: "billing", confidence: "high", reasons: ["The customer is asking about a charge, plan, or invoice."], submissionId };
  }
  if (hardTechnical || publishFailure) {
    return {
      category: "technical",
      confidence: submissionId || publishFailure ? "high" : "medium",
      reasons: [
        submissionId ? "A submission id is present." : "The message describes a failed or stuck publish.",
      ],
      submissionId,
    };
  }
  if (billing) {
    return { category: "billing", confidence: "medium", reasons: ["Billing words are present without a publish failure."], submissionId };
  }
  return {
    category: "how-to",
    confidence: "medium",
    reasons: ["No billing charge and no publish failure. Treated as a product question."],
    submissionId,
  };
}

export async function triageTicket(ticket: TicketInput, client: BlotatoClient | null): Promise<TriageResult> {
  const classified = classifyTicket(ticket);
  const name = ticket.customerName?.trim() || "";
  let diagnosis: Diagnosis | null = null;
  let connectedPlatforms: string[] = [];
  let lookupNote: string | null = null;

  if (client && classified.category === "technical" && classified.submissionId) {
    try {
      diagnosis = await diagnosePost(client, classified.submissionId);
    } catch (error) {
      lookupNote = lookupFailure(error);
    }
  }

  if (client && classified.category !== "technical") {
    try {
      const accounts = await client.listAccounts();
      connectedPlatforms = uniquePlatforms(accounts);
    } catch (error) {
      lookupNote = lookupFailure(error);
    }
  }

  const escalate = classified.category === "technical" && diagnosis?.escalate === true;
  const reply = renderReply({
    name,
    category: classified.category,
    diagnosis,
    connectedPlatforms,
    lookupNote,
    submissionId: classified.submissionId,
    escalate,
  });

  return {
    ...classified,
    escalate,
    reply,
    internalLog: escalate ? renderLog(classified.submissionId, diagnosis, lookupNote) : null,
    connectedPlatforms,
    diagnosis,
  };
}

function uniquePlatforms(accounts: Account[]): string[] {
  return [...new Set(accounts.map((account) => platformLabel(account.platform)))];
}

function lookupFailure(error: unknown): string {
  if (error instanceof BlotatoConfigError || error instanceof BlotatoApiError) return error.message;
  return error instanceof Error ? error.message : "The lookup failed.";
}

function greeting(name: string): string {
  return name ? `Hi ${name},` : "Hi,";
}

function renderReply(input: {
  name: string;
  category: TicketCategory;
  diagnosis: Diagnosis | null;
  connectedPlatforms: string[];
  lookupNote: string | null;
  submissionId: string | null;
  escalate: boolean;
}): string {
  switch (input.category) {
    case "billing":
      return billingReply(input.name, input.connectedPlatforms, input.lookupNote);
    case "how-to":
      return howToReply(input.name, input.connectedPlatforms, input.lookupNote);
    case "technical":
      return technicalReply(input);
    default: {
      const _exhaustive: never = input.category;
      return _exhaustive;
    }
  }
}

function billingReply(name: string, platforms: string[], lookupNote: string | null): string {
  const seen = platforms.length > 0
    ? `I can see these connected networks on the workspace: ${platforms.join(", ")}.`
    : "I did not change anything on the connected networks.";
  const lookup = lookupNote ? `\n\nI could not list the accounts just now: ${lookupNote}` : "";
  return `${greeting(name)}

Thanks for writing in. I treated this as a billing question. I have not changed the plan, and I have not issued a refund.

${seen}

Please open Settings > Billing and check the plan name and the newest charge. If you see two charges for the same period, reply with the date and the last four digits of the card. Leave the full card number out.

A person on billing confirms refunds. I can't approve one from this note. Generating an API key in Settings > API also starts the paid plan, so tell us if that click lines up with the charge.${lookup}`;
}

function howToReply(name: string, platforms: string[], lookupNote: string | null): string {
  const seen = platforms.length > 0
    ? `These networks are already connected: ${platforms.join(", ")}.`
    : "After you connect a network, it shows up under Accounts.";
  const lookup = lookupNote ? `\n\nI could not list the accounts just now: ${lookupNote}` : "";
  return `${greeting(name)}

Here is the short path.

1. Open Accounts. Use a private browser window and log into only the network you want to connect.
2. Instagram needs to be a Professional or Business account. Facebook needs a Page, not a personal profile.
3. ${seen}
4. To schedule from the API, put scheduledTime next to post, not inside it, and include a timezone. A request with no time and no slot publishes immediately.
5. Save the postSubmissionId from the create response. That is the id to check later. The id on a row in the posts list is a different kind of id.

I have not published or scheduled anything for you.${lookup}`;
}

function technicalReply(input: {
  name: string;
  diagnosis: Diagnosis | null;
  lookupNote: string | null;
  submissionId: string | null;
  escalate: boolean;
}): string {
  if (!input.submissionId) {
    return `${greeting(input.name)}

I can look this up once I have the postSubmissionId from the original publish response. The number on a failed row in the posts list is a different id, so please send the submission id if you have it.

I have not published a replacement. If you retry, change the thing the error names first. The same payload usually fails again.`;
  }
  if (input.lookupNote) {
    return `${greeting(input.name)}

I tried to look up submission ${input.submissionId} and the read did not complete.

${input.lookupNote}

I have not published a replacement. Please keep that submission id handy.`;
  }
  if (!input.diagnosis) {
    return `${greeting(input.name)}

I have the submission id ${input.submissionId} and I have not published a replacement. I still need a successful status read before I can name the fix.`;
  }
  const handoff = input.escalate
    ? "\n\nI sent the log to our technical team. You do not need to reconnect or retry until we write back with a specific step."
    : "";
  return `${greeting(input.name)}

I looked up submission ${input.diagnosis.postSubmissionId}. I have not published a replacement.

${input.diagnosis.likelyCause}

${input.diagnosis.fix}${handoff}`;
}

function renderLog(submissionId: string | null, diagnosis: Diagnosis | null, lookupNote: string | null): string {
  const lines = [
    "LOG SUMMARY",
    "category: technical",
    `postSubmissionId: ${submissionId ?? "(none)"}`,
    `status: ${diagnosis?.status ?? "lookup-failed"}`,
    `http: ${diagnosis?.httpStatus ?? "(none)"}`,
    `reqId: ${diagnosis?.reqId ?? "(none)"}`,
    `errorMessage: ${diagnosis?.errorMessage ?? lookupNote ?? "(none)"}`,
    `likelyCause: ${diagnosis?.likelyCause ?? "(see lookup note)"}`,
    "alreadyChecked:",
    ...(diagnosis?.alreadyChecked ?? ["Status lookup did not return a record."]).map((item) => `- ${item}`),
    "doNot:",
    ...(diagnosis?.doNot ?? ["Do not publish a replacement.", "Do not ask for the API key."]).map((item) => `- ${item}`),
    "customerReplySent: no, held for human review",
  ];
  return lines.join("\n");
}
