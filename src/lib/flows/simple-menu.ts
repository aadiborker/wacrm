/**
 * Simple Menu builder — turns a short wizard form into a full flow
 * graph (start → list menus → message/handoff/end).
 *
 * Keeps Meta limits in mind (≤10 list rows, ≤24 char titles) so the
 * wizard can validate before we hit the Cloud API.
 *
 * Nesting: main option → submenu → optional nested submenu (max 2
 * menu levels under the main list). Deeper "Show another menu" is
 * blocked in validation.
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

/** Actions available on submenu / nested choices. */
export type SimpleLeafAction = "handoff" | "message" | "submenu" | "end";

export interface SimpleMenuLeaf {
  title: string;
  action: SimpleLeafAction;
  /** Sent as a WhatsApp text bubble before handoff when action=message. */
  messageText?: string;
  /** Internal note on the handoff node (agents see this in the run). */
  handoffNote?: string;
  /** Body for a nested list when action=submenu. */
  submenuBody?: string;
  submenuOptions?: SimpleMenuLeaf[];
}

export type SimpleMenuOptionAction =
  | "handoff"
  | "message"
  | "submenu"
  | "end";

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
/** Main list → submenu → nested submenu. No deeper. */
export const SIMPLE_MENU_MAX_NEST = 2;

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

function validateLeaves(
  leaves: SimpleMenuLeaf[],
  fieldPrefix: string,
  nestDepth: number,
  issues: SimpleMenuIssue[],
): void {
  if (leaves.length < 1) {
    issues.push({
      field: fieldPrefix,
      message: "Add at least one menu choice.",
    });
  }
  if (leaves.length > INTERACTIVE_LIMITS.maxListRowsTotal) {
    issues.push({
      field: fieldPrefix,
      message: `Menu supports at most ${INTERACTIVE_LIMITS.maxListRowsTotal} choices.`,
    });
  }

  leaves.forEach((leaf, j) => {
    const lt = trim(leaf.title);
    const lp = `${fieldPrefix}.${j}`;
    if (!lt) {
      issues.push({
        field: `${lp}.title`,
        message: `Choice ${j + 1} needs a title.`,
      });
    } else if (lt.length > ROW_MAX) {
      issues.push({
        field: `${lp}.title`,
        message: `Choice title must be ≤ ${ROW_MAX} characters.`,
      });
    }

    if (leaf.action === "message" && !trim(leaf.messageText)) {
      issues.push({
        field: `${lp}.messageText`,
        message: `Choice ${j + 1}: add a message, or pick another action.`,
      });
    }

    if (leaf.action === "submenu") {
      if (nestDepth >= SIMPLE_MENU_MAX_NEST) {
        issues.push({
          field: `${lp}.action`,
          message: `Choice ${j + 1}: nesting limit reached — use Hand off, Send a message, or End.`,
        });
        return;
      }
      if (!trim(leaf.submenuBody)) {
        issues.push({
          field: `${lp}.submenuBody`,
          message: `Choice ${j + 1}: add a question for the next menu.`,
        });
      }
      validateLeaves(
        leaf.submenuOptions ?? [],
        `${lp}.submenuOptions`,
        nestDepth + 1,
        issues,
      );
    }
  });
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
      if (!trim(opt.submenuBody)) {
        issues.push({
          field: `${prefix}.submenuBody`,
          message: `Option ${i + 1}: add a question for the submenu.`,
        });
      }
      validateLeaves(
        opt.submenuOptions ?? [],
        `${prefix}.submenuOptions`,
        1,
        issues,
      );
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
 * Emit nodes for a leaf choice; returns the node_key the parent row
 * should point at. `keyBase` must be unique across the flow.
 */
function emitLeaf(
  nodes: FlowTemplateNode[],
  leaf: SimpleMenuLeaf,
  keyBase: string,
  replyPrefix: string,
  buttonLabel: string,
  nestDepth: number,
  needsEnd: { value: boolean },
): string {
  const lt = trim(leaf.title);

  if (leaf.action === "end") {
    needsEnd.value = true;
    return "end";
  }

  if (leaf.action === "handoff") {
    const hk = `handoff_${keyBase}`;
    nodes.push(
      handoffNode(hk, trim(leaf.handoffNote) || `Customer chose: ${lt}`),
    );
    return hk;
  }

  if (leaf.action === "message") {
    const mk = `msg_${keyBase}`;
    const hk = `handoff_${keyBase}`;
    nodes.push(messageNode(mk, trim(leaf.messageText)!, hk));
    nodes.push(
      handoffNode(hk, trim(leaf.handoffNote) || `Follow-up after: ${lt}`),
    );
    return mk;
  }

  // submenu
  const subKey = `menu_${keyBase}`;
  const subBody =
    trim(leaf.submenuBody) || `You chose “${lt}”. What next?`;
  const subRows: Array<{
    reply_id: string;
    title: string;
    next_node_key: string;
  }> = [];

  (leaf.submenuOptions ?? []).forEach((child, j) => {
    const ct = trim(child.title);
    const childReply = slugReplyId(replyPrefix, ct, j);
    const next = emitLeaf(
      nodes,
      child,
      `${keyBase}_${j}`,
      `${replyPrefix}${j}`,
      buttonLabel,
      nestDepth + 1,
      needsEnd,
    );
    subRows.push({ reply_id: childReply, title: ct, next_node_key: next });
  });

  nodes.push(listNode(subKey, subBody, buttonLabel, subRows));
  return subKey;
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
  const needsEnd = { value: false };

  nodes.push({
    node_key: "start",
    node_type: "start",
    config: { next_node_key: "menu_main" } satisfies StartNodeConfig,
  });

  const mainRows: Array<{
    reply_id: string;
    title: string;
    next_node_key: string;
  }> = [];

  spec.options.forEach((opt, i) => {
    const title = trim(opt.title);
    const reply_id = slugReplyId("main", title, i);

    if (opt.action === "end") {
      needsEnd.value = true;
      mainRows.push({ reply_id, title, next_node_key: "end" });
      return;
    }

    if (opt.action === "handoff") {
      const key = `handoff_${i}`;
      nodes.push(
        handoffNode(
          key,
          trim(opt.handoffNote) || `Customer chose: ${title}`,
        ),
      );
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

    // submenu under main option
    const asLeaf: SimpleMenuLeaf = {
      title,
      action: "submenu",
      submenuBody: opt.submenuBody,
      submenuOptions: opt.submenuOptions,
    };
    const next = emitLeaf(
      nodes,
      asLeaf,
      `sub_${i}`,
      `sub${i}`,
      buttonLabel,
      1,
      needsEnd,
    );
    mainRows.push({ reply_id, title, next_node_key: next });
  });

  nodes.splice(
    1,
    0,
    listNode("menu_main", welcomeText, buttonLabel, mainRows),
  );

  if (needsEnd.value) {
    nodes.push({
      node_key: "end",
      node_type: "end",
      config: {},
    });
  }

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

export {
  ROW_MAX as SIMPLE_MENU_TITLE_MAX,
  BUTTON_LABEL_MAX as SIMPLE_MENU_BUTTON_LABEL_MAX,
};
