import { removeResult, readResultRaw } from "@/lib/session/sessionStorage";
import { deleteResult, deleteVideo } from "@/lib/session/videoStore";

function readLocalSessionId(resultId: string): string | null {
  const raw = readResultRaw(resultId);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      trace?: { sessionId?: string };
      session?: { sessionId?: string };
    };
    const sessionId = parsed.trace?.sessionId ?? parsed.session?.sessionId;
    return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null;
  } catch {
    return null;
  }
}

export async function deleteAssessmentLocally(resultId: string): Promise<void> {
  const sessionId = readLocalSessionId(resultId);
  removeResult(resultId);
  await Promise.allSettled([
    deleteResult(resultId),
    deleteVideo(resultId),
    sessionId ? deleteVideo(sessionId) : Promise.resolve(),
  ]);
}

export async function deleteAssessmentAsAdmin(resultId: string): Promise<void> {
  const response = await fetch(`/api/admin/assessments/${encodeURIComponent(resultId)}`, {
    method: "DELETE",
  });

  let message = "Could not delete this assessment.";
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload?.error) message = payload.error;
  } catch {
    // Keep the default message if the server did not return JSON.
  }

  if (!response.ok) {
    throw new Error(message);
  }

  await deleteAssessmentLocally(resultId);
}
