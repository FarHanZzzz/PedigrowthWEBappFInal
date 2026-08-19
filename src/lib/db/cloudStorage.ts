import { createClient } from "./client";

export interface CloudResultRecord {
  id: string;
  payload: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

const VIDEO_BUCKET = "hackathon_videos";
const MAX_CLOUD_VIDEO_BYTES = 50 * 1024 * 1024;

function sanitizeStorageName(filename: string): string {
  const trimmed = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return trimmed.length > 0 ? trimmed.slice(-80) : "clip.mp4";
}

export async function uploadVideoToCloud(
  resultId: string,
  blob: Blob,
  filename = "clip.mp4",
): Promise<string | null> {
  if (!blob || blob.size === 0 || blob.size > MAX_CLOUD_VIDEO_BYTES) {
    return null;
  }

  const supabase = createClient();
  const safeName = sanitizeStorageName(filename);
  const path = `${resultId}/${safeName}`;
  const contentType = blob.type || "video/mp4";

  const { error } = await supabase.storage.from(VIDEO_BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
    cacheControl: "3600",
  });

  if (error) {
    console.error("Error uploading video to cloud:", error);
    return null;
  }

  const { data } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path);
  return data.publicUrl || null;
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
