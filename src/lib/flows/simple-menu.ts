/**
 * Simple Menu builder — turns a short wizard form into a full flow
 * graph (start → list menus → message/handoff → end).
 *
 * Keeps Meta limits in mind (≤10 list rows, ≤24 char titles) so the
 * wizard can validate before we hit the Cloud API.
 */

import { INTERACTIVE_LIMITS } from "@/lib/whatsapp/meta-api";
import type {
  HandoffNodeConfig,
  KeywordTriggerConfig,
  SendListNodeConfig,
  SendMessageNodeConfig,
  StartNodeConfig,
} from "./types";
import type { FlowTemplateNode } from "./templates";

export type SimpleLeafAction = "handoff" | "message";

export interface SimpleMenuLeaf {
  title: string;
  action: SimpleLeafAction;
  /** Sent as a WhatsApp text bubble before handoff when action=message. */
  messageText?: string;
  /** Internal note on the handoff node (agents see this in the run). */
  handoffNote?: string;
}

export type SimpleMenuOptionAction = "handoff" | "message" | "submenu";

export interface SimpleMenuOption {
  title: string;
  action: SimpleMenuOptionAction;
  messageText?: string;
  handoffNote?: string;
  /** Body text for the nested list when action=submenu. */
  submenuBody?: string;
  submenuOptions?: SimpleMenuLeaf[];
}

export interface SimpleMenuSpec {
  name: string;
  keyword: string;
  welcomeText: string;
  /** Label on the tap-to-open list button (Meta ≤ 20 chars). */
  buttonLabel?: string;
  options: SimpleMenuOption[];
}

export interface BuiltSimpleMenuFlow {
  name: string;
  description: string;
  trigger_type: "keyword";
  trigger_config: KeywordTriggerConfig;
  entry_node_id: string;
  nodes: FlowTemplateNode[];
}

export interface SimpleMenuIssue {
  field: string;
  message: string;
}

const ROW_MAX = INTERACTIVE_LIMITS.listRowTitleMaxLength;
const BUTTON_LABEL_MAX = 20;
const BODY_MAX = INTERACTIVE_LIMITS.bodyMaxLength;

function trim(s: string | undefined): string {
  return (s ?? "").trim();
}

function slugReplyId(prefix: string, title: string, index: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return `${prefix}_${index}_${base || "opt"}`.slice(0, 200);
}

export function validateSimpleMenuSpec(spec: SimpleMenuSpec): SimpleMenuIssue[] {
  const issues: SimpleMenuIssue[] = [];
  if (!trim(spec.name)) {
    issues.push({ field: "name", message: "Give this flow a name." });
  }
  if (!trim(spec.keyword)) {
    issues.push({
      field: "keyword",
      message: "Add a start word customers will type (e.g. Help).",
    });
  }
  if (!trim(spec.welcomeText)) {
    issues.push({
      field: "welcomeText",
      message: "Add a welcome message for the first menu.",
    });
  } else if (trim(spec.welcomeText).length > BODY_MAX) {
    issues.push({
      field: "welcomeText",
      message: `Welcome message must be ≤ ${BODY_MAX} characters.`,
    });
  }

  const buttonLabel = trim(spec.buttonLabel) || "View options";
  if (buttonLabel.length > BUTTON_LABEL_MAX) {
    issues.push({
      field: "buttonLabel",
      message: `Button label must be ≤ ${BUTTON_LABEL_MAX} characters.`,
    });
  }

  const options = spec.options ?? [];
  if (options.length < 1) {
    issues.push({
      field: "options",
      message: "Add at least one menu option.",
    });
  }
  if (options.length > INTERACTIVE_LIMITS.maxListRowsTotal) {
    issues.push({
      field: "options",
      message: `Main menu supports at most ${INTERACTIVE_LIMITS.maxListRowsTotal} options.`,
    });
  }

  options.forEach((opt, i) => {
    const title = trim(opt.title);
    const prefix = `options.${i}`;
    if (!title) {
      issues.push({ field: `${prefix}.title`, message: `Option ${i + 1} needs a title.` });
    } else if (title.length > ROW_MAX) {
      issues.push({
        field: `${prefix}.title`,
        message: `Option ${i + 1} title must be ≤ ${ROW_MAX} characters (Meta limit).`,
      });
    }

    if (opt.action === "message" && !trim(opt.messageText)) {
      issues.push({
        field: `${prefix}.messageText`,
        message: `Option ${i + 1}: add the message to send, or choose Hand off.`,
      });
    }
    if (opt.action === "submenu") {
      const subs = opt.submenuOptions ?? [];
      if (!trim(opt.submenuBody)) {
        issues.push({
          field: `${prefix}.submenuBody`,
          message: `Option ${i + 1}: add a question for the submenu.`,
        });
      }
      if (subs.length < 1) {
        issues.push({
          field: `${prefix}.submenuOptions`,
          message: `Option ${i + 1}: add at least one submenu choice.`,
        });
      }
      if (subs.length > INTERACTIVE_LIMITS.maxListRowsTotal) {
        issues.push({
          field: `${prefix}.submenuOptions`,
          message: `Option ${i + 1}: submenu supports at most ${INTERACTIVE_LIMITS.maxListRowsTotal} choices.`,
        });
      }
      subs.forEach((leaf, j) => {
        const lt = trim(leaf.title);
        const lp = `${prefix}.submenuOptions.${j}`;
        if (!lt) {
          issues.push({
            field: `${lp}.title`,
            message: `Sub-option ${j + 1} under option ${i + 1} needs a title.`,
          });
        } else if (lt.length > ROW_MAX) {
          issues.push({
            field: `${lp}.title`,
            message: `Sub-option title must be ≤ ${ROW_MAX} characters.`,
          });
        }
        if (leaf.action === "message" && !trim(leaf.messageText)) {
          issues.push({
            field: `${lp}.messageText`,
            message: `Sub-option ${j + 1}: add a message or choose Hand off.`,
          });
        }
      });
    }
  });

  return issues;
}

function listNode(
  node_key: string,
  text: string,
  buttonLabel: string,
  rows: Array<{ reply_id: string; title: string; next_node_key: string }>,
): FlowTemplateNode {
  const config: SendListNodeConfig = {
    text,
    button_label: buttonLabel,
    sections: [{ title: "Options", rows }],
  };
  return { node_key, node_type: "send_list", config };
}

function messageNode(
  node_key: string,
  text: string,
  next_node_key: string,
): FlowTemplateNode {
  const config: SendMessageNodeConfig = { text, next_node_key };
  return { node_key, node_type: "send_message", config };
}

function handoffNode(node_key: string, note: string): FlowTemplateNode {
  const config: HandoffNodeConfig = { note };
  return { node_key, node_type: "handoff", config };
}

/**
 * Compile a wizard spec into flow nodes. Caller must validate first
 * (or rely on validateSimpleMenuSpec). Throws if invalid.
 */
export function buildSimpleMenuFlow(spec: SimpleMenuSpec): BuiltSimpleMenuFlow {
  const issues = validateSimpleMenuSpec(spec);
  if (issues.length > 0) {
    throw new Error(issues[0]?.message ?? "Invalid simple menu");
  }

  const name = trim(spec.name);
  const keyword = trim(spec.keyword);
  const welcomeText = trim(spec.welcomeText);
  const buttonLabel = trim(spec.buttonLabel) || "View options";
  const nodes: FlowTemplateNode[] = [];

  nodes.push({
    node_key: "start",
    node_type: "start",
    config: { next_node_key: "menu_main" } satisfies StartNodeConfig,
  });
  nodes.push({
    node_key: "end",
    node_type: "end",
    config: {},
  });

  const mainRows: Array<{
    reply_id: string;
    title: string;
    next_node_key: string;
  }> = [];

  spec.options.forEach((opt, i) => {
    const title = trim(opt.title);
    const reply_id = slugReplyId("main", title, i);

    if (opt.action === "handoff") {
      const key = `handoff_${i}`;
      nodes.push(
        handoffNode(
          key,
          trim(opt.handoffNote) || `Customer chose: ${title}`,
        ),
      );
      // Engine ends handoff by completing the run; no next needed.
      mainRows.push({ reply_id, title, next_node_key: key });
      return;
    }

    if (opt.action === "message") {
      const msgKey = `msg_${i}`;
      const handoffKey = `handoff_${i}`;
      nodes.push(messageNode(msgKey, trim(opt.messageText)!, handoffKey));
      nodes.push(
        handoffNode(
          handoffKey,
          trim(opt.handoffNote) || `Follow-up after: ${title}`,
        ),
      );
      mainRows.push({ reply_id, title, next_node_key: msgKey });
      return;
    }

    // submenu
    const subKey = `menu_sub_${i}`;
    const subBody =
      trim(opt.submenuBody) || `You chose “${title}”. What next?`;
    const subRows: Array<{
      reply_id: string;
      title: string;
      next_node_key: string;
    }> = [];

    (opt.submenuOptions ?? []).forEach((leaf, j) => {
      const lt = trim(leaf.title);
      const leafReply = slugReplyId(`sub${i}`, lt, j);
      if (leaf.action === "handoff") {
        const hk = `handoff_${i}_${j}`;
        nodes.push(
          handoffNode(hk, trim(leaf.handoffNote) || `Customer chose: ${lt}`),
        );
        subRows.push({ reply_id: leafReply, title: lt, next_node_key: hk });
      } else {
        const mk = `msg_${i}_${j}`;
        const hk = `handoff_${i}_${j}`;
        nodes.push(messageNode(mk, trim(leaf.messageText)!, hk));
        nodes.push(
          handoffNode(
            hk,
            trim(leaf.handoffNote) || `Follow-up after: ${lt}`,
          ),
        );
        subRows.push({ reply_id: leafReply, title: lt, next_node_key: mk });
      }
    });

    nodes.push(listNode(subKey, subBody, buttonLabel, subRows));
    mainRows.push({ reply_id, title, next_node_key: subKey });
  });

  nodes.splice(
    1,
    0,
    listNode("menu_main", welcomeText, buttonLabel, mainRows),
  );

  return {
    name,
    description: `Simple menu — starts when customers type “${keyword}”.`,
    trigger_type: "keyword",
    trigger_config: {
      keywords: [keyword],
      match_type: "contains",
    },
    entry_node_id: "start",
    nodes,
  };
}

export function blankSimpleMenuSpec(): SimpleMenuSpec {
  return {
    name: "",
    keyword: "Help",
    welcomeText: "",
    buttonLabel: "View options",
    options: [
      {
        title: "",
        action: "handoff",
        handoffNote: "",
      },
    ],
  };
}

export { ROW_MAX as SIMPLE_MENU_TITLE_MAX, BUTTON_LABEL_MAX as SIMPLE_MENU_BUTTON_LABEL_MAX };
