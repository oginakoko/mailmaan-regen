import { MailmaanClient, type TrackedEvent } from "mailmaan-sdk";

/**
 * SokoStore — example Mailmaan integration (Day 7).
 *
 * Server-side only: the API key stays on the server. Signup and checkout
 * emit app events; Mailmaan workflows turn them into welcome/receipt
 * emails. `sendWelcomeDirect` shows the direct-send path for cases with
 * no workflow.
 */
export class SokoStore {
  private mailmaan: MailmaanClient;

  constructor(mailmaan?: MailmaanClient) {
    this.mailmaan =
      mailmaan ??
      new MailmaanClient({
        apiKey: process.env.MAILMAAN_API_KEY ?? "",
        baseUrl: process.env.MAILMAAN_API_URL,
      });
  }

  /** New account → `user.signed_up` → welcome workflow. */
  async signup(input: { userId: string; email: string; firstName: string }): Promise<TrackedEvent> {
    return this.mailmaan.trackEvent({
      id: `soko-signup/${input.userId}`,
      name: "user.signed_up",
      data: { email: input.email, firstName: input.firstName },
    });
  }

  /**
   * Paid order → `order.paid` → receipt workflow. Event data must carry
   * every template variable (validation is strict: missing or unknown
   * variables fail the send).
   */
  async checkout(input: {
    orderId: string;
    customerEmail: string;
    customerFirstName: string;
    total: string;
    currency: string;
  }): Promise<TrackedEvent> {
    return this.mailmaan.trackEvent({
      id: `soko-order/${input.orderId}`,
      name: "order.paid",
      data: {
        customerEmail: input.customerEmail,
        firstName: input.customerFirstName,
        orderId: input.orderId,
        total: input.total,
        currency: input.currency,
      },
    });
  }

  /** Direct template send (no workflow involved). */
  async sendWelcomeDirect(input: { email: string; firstName: string; idempotencyKey: string }) {
    return this.mailmaan.sendEmail({
      to: input.email,
      template: "welcome",
      variables: { firstName: input.firstName },
      metadata: { source: "soko-store-direct" },
      idempotencyKey: input.idempotencyKey,
    });
  }

  /**
   * Referral invite (added via MCP discovery): invites a friend with the
   * welcome template. Template slug and required variables were confirmed
   * through the `list_templates` MCP tool, not the database.
   */
  async inviteFriend(input: { inviteToken: string; friendEmail: string; friendName: string }) {
    return this.mailmaan.sendEmail({
      to: input.friendEmail,
      template: "welcome",
      variables: { firstName: input.friendName },
      metadata: { source: "soko-invite", invite_token: input.inviteToken },
      idempotencyKey: `soko-invite/${input.inviteToken}`,
    });
  }
}
