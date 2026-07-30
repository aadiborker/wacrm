import { createClient } from "@/lib/supabase/server";
import { FlowsList } from "@/components/flows/flows-list";
import { listFlowTemplateSummaries } from "@/lib/flows/templates";
import type { FlowRow } from "@/lib/flows/types";

/**
 * Flows list — server-rendered.
 *
 * Loads flows + static template summaries on the server so the page
 * paints cards immediately instead of: hydrate → spinner → double
 * client fetch → /api/flows + /api/flows/templates.
 */
export default async function FlowsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let flows: FlowRow[] = [];
  if (user) {
    const { data } = await supabase
      .from("flows")
      .select("*")
      .order("created_at", { ascending: false });
    flows = (data as FlowRow[] | null) ?? [];
  }

  const templates = listFlowTemplateSummaries();

  return <FlowsList initialFlows={flows} initialTemplates={templates} />;
}
