import { describe, it, expect } from "vitest";
import {
  classifyInvitationOutcome,
  isValidInvitationEmail,
  type InvitationInput,
} from "@/lib/invitationOutcome";

const base: InvitationInput = {
  type: "budget",
  invitedEmail: "user@example.com",
  invitedUserExists: true,
  isAlreadyMember: false,
  hasPendingInviteByUserId: false,
  hasPendingInviteByEmail: false,
};

describe("isValidInvitationEmail", () => {
  it("accepts a standard email", () => {
    expect(isValidInvitationEmail("a@b.co")).toBe(true);
  });
  it("rejects missing @", () => {
    expect(isValidInvitationEmail("ab.co")).toBe(false);
  });
  it("rejects whitespace", () => {
    expect(isValidInvitationEmail("a b@c.co")).toBe(false);
  });
  it("rejects missing TLD", () => {
    expect(isValidInvitationEmail("a@b")).toBe(false);
  });
});

describe("classifyInvitationOutcome", () => {
  it("returns invalid_email for malformed email", () => {
    expect(classifyInvitationOutcome({ ...base, invitedEmail: "broken" })).toBe(
      "invalid_email",
    );
  });

  it("returns project_closed when project is archived", () => {
    expect(
      classifyInvitationOutcome({
        ...base,
        type: "project",
        project: { archived: true, status: "active" },
      }),
    ).toBe("project_closed");
  });

  it("returns project_closed when project status is completed", () => {
    expect(
      classifyInvitationOutcome({
        ...base,
        type: "project",
        project: { archived: false, status: "completed" },
      }),
    ).toBe("project_closed");
  });

  it("returns project_closed when project status is cancelled", () => {
    expect(
      classifyInvitationOutcome({
        ...base,
        type: "project",
        project: { archived: false, status: "cancelled" },
      }),
    ).toBe("project_closed");
  });

  it("returns user_not_found for missing user on non-project type", () => {
    expect(
      classifyInvitationOutcome({
        ...base,
        type: "budget",
        invitedUserExists: false,
      }),
    ).toBe("user_not_found");
  });

  it("allows email-only project invite when workerId is set", () => {
    expect(
      classifyInvitationOutcome({
        ...base,
        type: "project",
        invitedUserExists: false,
        workerId: "worker-1",
        project: { archived: false, status: "active" },
      }),
    ).toBe("ok");
  });

  it("allows email-only project invite when sendEmail is true", () => {
    expect(
      classifyInvitationOutcome({
        ...base,
        type: "project",
        invitedUserExists: false,
        sendEmail: true,
        project: { archived: false, status: "active" },
      }),
    ).toBe("ok");
  });

  it("rejects email-only project invite without workerId/sendEmail", () => {
    expect(
      classifyInvitationOutcome({
        ...base,
        type: "project",
        invitedUserExists: false,
        project: { archived: false, status: "active" },
      }),
    ).toBe("user_not_found");
  });

  it("returns already_member when user is already a member", () => {
    expect(
      classifyInvitationOutcome({ ...base, isAlreadyMember: true }),
    ).toBe("already_member");
  });

  it("returns already_invited when user has pending invite by user_id", () => {
    expect(
      classifyInvitationOutcome({ ...base, hasPendingInviteByUserId: true }),
    ).toBe("already_invited");
  });

  it("returns already_invited when email-only invite already exists", () => {
    expect(
      classifyInvitationOutcome({
        ...base,
        type: "project",
        invitedUserExists: false,
        sendEmail: true,
        hasPendingInviteByEmail: true,
        project: { archived: false, status: "active" },
      }),
    ).toBe("already_invited");
  });

  it("returns ok for happy path on each invitation type", () => {
    const types: InvitationInput["type"][] = [
      "project",
      "budget",
      "payment_source",
      "family",
    ];
    for (const type of types) {
      expect(
        classifyInvitationOutcome({
          ...base,
          type,
          project: type === "project" ? { archived: false, status: "active" } : null,
        }),
      ).toBe("ok");
    }
  });

  it("prioritizes already_member over already_invited", () => {
    expect(
      classifyInvitationOutcome({
        ...base,
        isAlreadyMember: true,
        hasPendingInviteByUserId: true,
      }),
    ).toBe("already_member");
  });
});
