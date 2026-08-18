import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy policy for ReplyFlow, a WhatsApp CRM operated by The Web People.",
  robots: {
    index: true,
    follow: true,
  },
};

const LAST_UPDATED = "18 August 2026";
const SITE_URL = "https://replyflow.thewebpeople.co";
const OPERATOR = "The Web People";
const OPERATOR_SITE = "https://thewebpeople.co";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/login" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <MessageSquare className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              ReplyFlow
            </span>
          </Link>
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          Legal
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: {LAST_UPDATED}
        </p>
        <p className="mt-6 text-muted-foreground leading-relaxed">
          This policy explains how {OPERATOR} (“we”, “us”) collects, uses, and
          shares information when you use ReplyFlow at{" "}
          <a className="text-primary hover:underline" href={SITE_URL}>
            {SITE_URL}
          </a>
          . ReplyFlow is a WhatsApp CRM: it lets businesses manage WhatsApp
          conversations, contacts, broadcasts, templates, and related
          workflows through Meta’s WhatsApp Business Platform.
        </p>

        <PolicySection title="1. Who this applies to">
          <p>
            This policy covers people who create a ReplyFlow account (agents
            and administrators) and, indirectly, the end customers whose
            WhatsApp conversations those accounts handle. If you message a
            business that uses ReplyFlow, that business is the controller of
            your chat content; we process it on their behalf to operate the
            product.
          </p>
        </PolicySection>

        <PolicySection title="2. Information we collect">
          <h3 className="mt-4 font-medium text-foreground">Account data</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Name, email address, and password (stored by our auth provider)</li>
            <li>Company / workspace name and teammate invitations</li>
            <li>Role in the workspace (owner, admin, agent, viewer)</li>
          </ul>
          <h3 className="mt-4 font-medium text-foreground">WhatsApp and CRM data</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              WhatsApp Business credentials you save (phone number ID, WABA
              ID, access tokens — tokens are encrypted at rest)
            </li>
            <li>
              Contact records (name, phone number, tags, company, custom
              fields, notes)
            </li>
            <li>
              Message content and media sent or received via WhatsApp,
              including templates, broadcasts, delivery/read status, and
              replies
            </li>
            <li>
              Conversation metadata (assignment, unread state, session
              window)
            </li>
            <li>
              Automations, flows, AI-drafted replies, and related logs when
              you enable those features
            </li>
          </ul>
          <h3 className="mt-4 font-medium text-foreground">Usage data</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Sign-in sessions and approximate timestamps of activity</li>
            <li>Technical logs needed to run and secure the service</li>
          </ul>
        </PolicySection>

        <PolicySection title="3. How we use information">
          <ul className="list-disc space-y-1 pl-5">
            <li>Provide the inbox, contacts, broadcasts, templates, and settings</li>
            <li>
              Send and receive WhatsApp messages through Meta’s Cloud API on
              your behalf
            </li>
            <li>Authenticate users and keep workspaces isolated from each other</li>
            <li>Improve reliability, prevent abuse, and diagnose outages</li>
            <li>Comply with law and respond to valid requests from you or authorities</li>
          </ul>
          <p className="mt-3">
            We do not sell personal information. We do not use customer
            WhatsApp chats to train public AI models.
          </p>
        </PolicySection>

        <PolicySection title="4. WhatsApp and Meta">
          <p>
            ReplyFlow is not affiliated with Meta except as a customer of the
            WhatsApp Business Platform. When you connect a WhatsApp number:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Outbound messages (including marketing templates) are sent to
              Meta, which delivers them to WhatsApp users
            </li>
            <li>
              Inbound messages and status events are delivered to ReplyFlow
              via Meta webhooks
            </li>
            <li>
              Meta’s own terms and privacy policy apply to WhatsApp traffic
              they process
            </li>
          </ul>
          <p className="mt-3">
            Connecting WhatsApp is optional. If you disconnect, new events
            stop arriving; data already stored in your workspace remains until
            you delete it.
          </p>
        </PolicySection>

        <PolicySection title="5. Where data is stored">
          <p>
            ReplyFlow stores application data in a hosted database (Supabase)
            and related cloud infrastructure used to run this installation.
            Access tokens for WhatsApp are encrypted before storage. Access is
            limited to the workspace that owns the data and to operators who
            maintain this server.
          </p>
        </PolicySection>

        <PolicySection title="6. Sharing">
          <p>We share information only:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>With Meta, to send and receive WhatsApp messages you initiate or receive</li>
            <li>With infrastructure providers that host this instance (database, server, DNS, TLS)</li>
            <li>With teammates you invite into your ReplyFlow workspace</li>
            <li>When required by law, or to protect the service and its users</li>
          </ul>
        </PolicySection>

        <PolicySection title="7. Retention">
          <p>
            We keep account, contact, and message data for as long as the
            workspace remains active so the inbox and CRM history stay
            available. You may delete contacts, conversations, or the
            connection from Settings. If you close the workspace, we delete or
            anonymise remaining personal data within a reasonable period
            unless law requires a longer hold (for example billing or
            security logs).
          </p>
        </PolicySection>

        <PolicySection id="data-deletion" title="8. Your rights and data deletion">
          <p>
            Depending on where you live, you may have rights to access,
            correct, export, or delete personal data. Workspace owners can
            manage most CRM data inside ReplyFlow. To request deletion of an
            account or residual personal data, contact us using the details
            below. We will verify the request and complete it unless a legal
            exception applies.
          </p>
          <p className="mt-3">
            End customers who messaged a business on WhatsApp should contact
            that business first. We will help the workspace owner honour a
            valid deletion request about chat or contact records stored here.
          </p>
        </PolicySection>

        <PolicySection title="9. Cookies">
          <p>
            We use essential cookies (and similar storage) to keep you signed
            in and apply display preferences. We do not use advertising
            cookies on this product.
          </p>
        </PolicySection>

        <PolicySection title="10. Children">
          <p>
            ReplyFlow is a business tool. It is not directed at children under
            16, and we do not knowingly collect their data as account holders.
          </p>
        </PolicySection>

        <PolicySection title="11. Changes">
          <p>
            We may update this policy. The “Last updated” date at the top will
            change. Material changes will be reflected on this page.
          </p>
        </PolicySection>

        <PolicySection id="contact" title="12. Contact">
          <p>
            Controller for this ReplyFlow installation: {OPERATOR} (
            <a className="text-primary hover:underline" href={OPERATOR_SITE}>
              {OPERATOR_SITE}
            </a>
            ).
          </p>
          <p className="mt-3">
            Product: ReplyFlow — {SITE_URL}
          </p>
          <p className="mt-3">
            For privacy questions or deletion requests, email the operator at
            the address associated with your ReplyFlow workspace, or contact{" "}
            {OPERATOR} via {OPERATOR_SITE}.
          </p>
        </PolicySection>

        <p className="mt-12 text-xs leading-relaxed text-muted-foreground">
          This page is provided so Meta and users can review how ReplyFlow
          handles data. It is not legal advice. Have counsel review it if you
          need a jurisdiction-specific agreement.
        </p>
      </main>
    </div>
  );
}

function PolicySection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-2 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
