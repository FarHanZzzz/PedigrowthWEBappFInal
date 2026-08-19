import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

interface HackathonResult {
  id: string;
  payload: unknown;
}

export default async function SupabaseTestPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("hackathon_results")
    .select("id,payload")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Supabase Test</h1>
        <p>Query failed: {error.message}</p>
      </main>
    );
  }

  const rows = (data ?? []) as HackathonResult[];

  return (
    <main style={{ padding: 24 }}>
      <h1>Supabase Test</h1>
      <p>Rows found: {rows.length}</p>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>{row.id}</li>
        ))}
      </ul>
    </main>
  );
}