import { createClient } from "./client";

export interface CloudResultRecord {
  id: string;
  payload: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export async function fetchResultFromCloud(resultId: string): Promise<Record<string, unknown> | null> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from("hackathon_results")
    .select("payload")
    .eq("id", resultId)
    .single();

  if (error || !data) {
    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
      console.error("Error fetching from cloud:", error);
    }
    return null;
  }

  return data.payload as Record<string, unknown>;
}

export async function saveResultToCloud(resultId: string, payload: Record<string, unknown> | unknown): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("hackathon_results")
    .upsert({
      id: resultId,
      payload,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error("Error saving to cloud:", error);
    throw new Error("Failed to save result to Supabase");
  }
}

export async function fetchRecentResultsFromCloud(limit = 100): Promise<CloudResultRecord[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("hackathon_results")
    .select("id,payload,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error listing cloud results:", error);
    return [];
  }

  return (data ?? []) as CloudResultRecord[];
}
