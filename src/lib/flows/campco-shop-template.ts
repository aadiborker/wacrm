/**
 * CAMPCO Chocolates WhatsApp shop flow — keyword “Hi”.
 *
 * Maps the brand conversation script onto Meta-safe list/button nodes
 * (row titles ≤24, button labels ≤20, section titles ≤24). Buy URLs are
 * placeholders — replace them in the builder after cloning.
 *
 * Out of scope for this keyword flow (use Shopify automations / broadcasts):
 * abandoned-cart nudge, purchase confirmation, and re-engagement blasts.
 */

import type {
  CollectInputNodeConfig,
  HandoffNodeConfig,
  SendButtonsNodeConfig,
  SendListNodeConfig,
  SendMessageNodeConfig,
} from "./types";

type CampcoFlowTemplate = {
  slug: string;
  name: string;
  description: string;
  icon: "MessageSquare" | "HelpCircle" | "UserPlus";
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: Record<string, unknown>;
  entry_node_id: string;
  nodes: Array<{
    node_key: string;
    node_type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: any;
  }>;
};

/** Live Campco Cart links + CDN images (from campcocart.com products JSON). */
const URLS = {
  funtan: "https://campcocart.com/products/campco-funtan-dark-chocolate",
  milkMarvel: "https://campcocart.com/products/campco-milk-marvel",
  dieter:
    "https://campcocart.com/products/campco-dieter-sugar-free-dark-chocolate-copy",
  krunch: "https://campcocart.com/products/campco-krunch-copy",
  premium: "https://campcocart.com/collections/premium-chocolate",
  cooking: "https://campcocart.com/collections/cooking-choclate",
  treats: "https://campcocart.com/collections/choco-treats",
  drinking: "https://campcocart.com/collections/drinking-choclate",
  everything: "https://campcocart.com/collections/all",
} as const;

const IMAGES = {
  funtan:
    "https://cdn.shopify.com/s/files/1/0767/3220/3234/files/FUNTAN4.png?v=1786543315",
  milkMarvel:
    "https://cdn.shopify.com/s/files/1/0767/3220/3234/files/MILK_MARVEL_2.png?v=1786537972",
  dieter:
    "https://cdn.shopify.com/s/files/1/0767/3220/3234/files/ditier.png?v=1786540741",
  krunch:
    "https://cdn.shopify.com/s/files/1/0767/3220/3234/files/KRUNCH_3.jpg?v=1786544601",
} as const;

function list(
  node_key: string,
  text: string,
  button_label: string,
  sectionTitle: string,
  rows: Array<{
    reply_id: string;
    title: string;
    description?: string;
    next_node_key: string;
  }>,
): CampcoFlowTemplate["nodes"][number] {
  return {
    node_key,
    node_type: "send_list",
    config: {
      text,
      button_label,
      sections: [{ title: sectionTitle, rows }],
    } as SendListNodeConfig,
  };
}

function productMessage(
  node_key: string,
  text: string,
  buy_url: string,
  next_node_key: string,
  image_url?: string,
): CampcoFlowTemplate["nodes"][number] {
  return {
    node_key,
    node_type: "send_message",
    config: {
      text,
      buy_url,
      ...(image_url ? { image_url } : {}),
      next_node_key,
    } as SendMessageNodeConfig,
  };
}

function buttons(
  node_key: string,
  text: string,
  opts: Array<{ reply_id: string; title: string; next_node_key: string }>,
): CampcoFlowTemplate["nodes"][number] {
  return {
    node_key,
    node_type: "send_buttons",
    config: {
      text,
      buttons: opts,
    } as SendButtonsNodeConfig,
  };
}

export const CAMPCO_SHOP: CampcoFlowTemplate = {
  slug: "campco_shop",
  name: "CAMPCO Chocolates shop",
  description:
    "Full CAMPCO WhatsApp shop using live campcocart.com product links: premium picker, categories, upsell, order capture, and support. Triggered by Hi / Hello.",
  icon: "MessageSquare",
  trigger_type: "keyword",
  trigger_config: {
    keywords: ["hi", "hai", "hello", "campco"],
    match_type: "contains",
  },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "main_menu" },
    },

    // ── 1. Main menu ──────────────────────────────────────────
    list(
      "main_menu",
      "Hi! Welcome to *CAMPCO Chocolates*\n\nLooking for something delicious? We’d love to help you find the perfect chocolate.\n\nWhat would you like to do today?",
      "Choose option",
      "Main menu",
      [
        {
          reply_id: "shop_premium",
          title: "Shop Premium",
          description: "Find your perfect chocolate",
          next_node_key: "mood_menu",
        },
        {
          reply_id: "explore_all",
          title: "Explore All Products",
          description: "Browse categories",
          next_node_key: "explore_cats",
        },
        {
          reply_id: "track_order",
          title: "Track My Order",
          description: "Check order status",
          next_node_key: "ask_order",
        },
        {
          reply_id: "support",
          title: "Customer Support",
          description: "We’re happy to help",
          next_node_key: "support_menu",
        },
      ],
    ),

    // ── 2. Mood / premium picker ──────────────────────────────
    list(
      "mood_menu",
      "Great choice!\n\nLet’s find a chocolate you’ll love.\n\n*What are you in the mood for?*",
      "Pick a mood",
      "Mood",
      [
        {
          reply_id: "mood_dark",
          title: "Rich & Dark",
          next_node_key: "prod_funtan",
        },
        {
          reply_id: "mood_creamy",
          title: "Smooth & Creamy",
          next_node_key: "prod_milk",
        },
        {
          reply_id: "mood_sugarfree",
          title: "Sugar-Free Dark",
          next_node_key: "prod_dieter",
        },
        {
          reply_id: "mood_surprise",
          title: "Surprise Me!",
          next_node_key: "prod_krunch",
        },
        {
          reply_id: "mood_help",
          title: "Help Me Choose",
          description: "Tell us what you prefer",
          next_node_key: "help_choose",
        },
      ],
    ),

    // ── 3. Product replies (image + name + buy link) ─────────
    productMessage(
      "prod_funtan",
      "*CAMPCO Funtan Dark Chocolate*\n\nRich cocoa. Smooth finish. A classic dark chocolate experience for those who like their chocolate a little more intense.\n\n*50 g | ₹80*\n\nLearn more / buy:",
      URLS.funtan,
      "after_product",
      IMAGES.funtan,
    ),
    productMessage(
      "prod_milk",
      "*CAMPCO Milk Marvel*\n\nSilky, smooth milk chocolate with a rich, creamy taste — perfect for treating yourself, sharing or gifting.\n\n*50 g | ₹80*\n\nLearn more / buy:",
      URLS.milkMarvel,
      "after_product",
      IMAGES.milkMarvel,
    ),
    productMessage(
      "prod_dieter",
      "*CAMPCO Dieter Sugar-Free Dark Chocolate*\n\nA rich dark chocolate experience with *no added sugar*, made for chocolate lovers looking for a sugar-free option.\n\n*50 g | ₹80*\n\nLearn more / buy:",
      URLS.dieter,
      "after_product",
      IMAGES.dieter,
    ),
    productMessage(
      "prod_krunch",
      "*CAMPCO Krunch*\n\nRich, smooth and creamy milk chocolate — an easy pick when you just want to enjoy a good chocolate moment.\n\n*50 g | ₹80*\n\nLearn more / buy:",
      URLS.krunch,
      "after_product",
      IMAGES.krunch,
    ),

    buttons("after_product", "Want to keep exploring?", [
      {
        reply_id: "another",
        title: "Another chocolate",
        next_node_key: "mood_menu",
      },
      {
        reply_id: "upsell",
        title: "Why stop at one?",
        next_node_key: "upsell_msg",
      },
      {
        reply_id: "main",
        title: "Main menu",
        next_node_key: "main_menu",
      },
    ]),

    // ── 7. Multi-chocolate upsell ─────────────────────────────
    productMessage(
      "upsell_msg",
      "Why stop at one?\n\nCAMPCO Cart offers *free delivery on orders above ₹200*.\n\nPick a few favourites and make your chocolate delivery even sweeter.",
      URLS.premium,
      "after_upsell",
    ),
    buttons("after_upsell", "What next?", [
      {
        reply_id: "shop_more",
        title: "Shop premium",
        next_node_key: "mood_menu",
      },
      {
        reply_id: "main2",
        title: "Main menu",
        next_node_key: "main_menu",
      },
    ]),

    // ── 4. Explore categories ─────────────────────────────────
    list(
      "explore_cats",
      "Of course!\n\nThere’s a lot more to explore at CAMPCO.\n\nChoose a category and we’ll take you there:",
      "Categories",
      "Shop by category",
      [
        {
          reply_id: "cat_premium",
          title: "Premium Chocolates",
          next_node_key: "premium_picks",
        },
        {
          reply_id: "cat_cooking",
          title: "Cooking Chocolates",
          next_node_key: "link_cooking",
        },
        {
          reply_id: "cat_treats",
          title: "Treats & Gifts",
          next_node_key: "link_treats",
        },
        {
          reply_id: "cat_drink",
          title: "Drinking Chocolate",
          next_node_key: "link_drinking",
        },
        {
          reply_id: "cat_all",
          title: "Explore Everything",
          next_node_key: "link_everything",
        },
      ],
    ),

    // ── 5. Premium quick picks ────────────────────────────────
    list(
      "premium_picks",
      "Here are a few CAMPCO favourites.\n\nSelect a chocolate to get its purchase link:",
      "Pick chocolate",
      "Premium picks",
      [
        {
          reply_id: "pick_funtan",
          title: "Funtan Dark",
          description: "Bold cocoa flavour",
          next_node_key: "prod_funtan",
        },
        {
          reply_id: "pick_milk",
          title: "Milk Marvel",
          description: "Smooth & creamy",
          next_node_key: "prod_milk",
        },
        {
          reply_id: "pick_dieter",
          title: "Dieter Sugar-Free",
          description: "No added sugar",
          next_node_key: "prod_dieter",
        },
        {
          reply_id: "pick_krunch",
          title: "Krunch",
          description: "Anytime milk treat",
          next_node_key: "prod_krunch",
        },
      ],
    ),

    productMessage(
      "link_cooking",
      "*Cooking Chocolates*\n\nPerfect for baking, melting and making desserts at home.",
      URLS.cooking,
      "after_category",
    ),
    productMessage(
      "link_treats",
      "*Chocolate Treats & Gifts*\n\nReady-to-gift picks for celebrations and sweet surprises.",
      URLS.treats,
      "after_category",
    ),
    productMessage(
      "link_drinking",
      "*Drinking Chocolate*\n\nWarm, comforting cocoa moments — anytime.",
      URLS.drinking,
      "after_category",
    ),
    productMessage(
      "link_everything",
      "Explore the full CAMPCO range — something delicious for every craving.",
      URLS.everything,
      "after_category",
    ),

    buttons("after_category", "Keep browsing?", [
      {
        reply_id: "more_cats",
        title: "More categories",
        next_node_key: "explore_cats",
      },
      {
        reply_id: "main3",
        title: "Main menu",
        next_node_key: "main_menu",
      },
    ]),

    // ── 6. Help me choose ─────────────────────────────────────
    list(
      "help_choose",
      "Not sure which one to pick?\n\nNo problem — tell us what you prefer.",
      "My preference",
      "I prefer…",
      [
        {
          reply_id: "pref_strong",
          title: "Strong cocoa taste",
          next_node_key: "prod_funtan",
        },
        {
          reply_id: "pref_creamy",
          title: "Creamy & sweet",
          next_node_key: "prod_milk",
        },
        {
          reply_id: "pref_sugarfree",
          title: "Sugar-free",
          next_node_key: "prod_dieter",
        },
        {
          reply_id: "pref_gift",
          title: "Buying for someone",
          next_node_key: "prod_krunch",
        },
      ],
    ),

    // ── 8. Order tracking (capture + agent) ───────────────────
    {
      node_key: "ask_order",
      node_type: "collect_input",
      config: {
        prompt_text:
          "Absolutely!\n\nLet’s check your CAMPCO order.\n\nPlease send us your *Order Number*.\n\nExample: #12345",
        var_key: "order_id",
        next_node_key: "order_ack",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "order_ack",
      node_type: "send_message",
      config: {
        text: "Thanks! We’ve noted order *{{vars.order_id}}*.\n\nA teammate will confirm the latest status shortly. You can also track from your CAMPCO account if you have one.",
        next_node_key: "order_next",
      } as SendMessageNodeConfig,
    },
    buttons("order_next", "Need anything else?", [
      {
        reply_id: "order_support",
        title: "Talk to support",
        next_node_key: "support_handoff",
      },
      {
        reply_id: "order_main",
        title: "Main menu",
        next_node_key: "main_menu",
      },
    ]),

    // ── 9. Customer support ───────────────────────────────────
    list(
      "support_menu",
      "We’re happy to help.\n\nPlease choose what you need assistance with:",
      "Support topics",
      "I need help with",
      [
        {
          reply_id: "sup_order",
          title: "Existing Order",
          next_node_key: "support_handoff",
        },
        {
          reply_id: "sup_pay",
          title: "Payment Issue",
          next_node_key: "support_handoff",
        },
        {
          reply_id: "sup_product",
          title: "Product Question",
          next_node_key: "support_handoff",
        },
        {
          reply_id: "sup_delivery",
          title: "Delivery Question",
          next_node_key: "support_handoff",
        },
        {
          reply_id: "sup_other",
          title: "Something Else",
          next_node_key: "support_handoff",
        },
      ],
    ),
    {
      node_key: "support_handoff",
      node_type: "handoff",
      config: {
        note: "CAMPCO support — customer chose a support topic (or order follow-up). Order id if captured: {{vars.order_id}}",
      } as HandoffNodeConfig,
    },
  ],
};
