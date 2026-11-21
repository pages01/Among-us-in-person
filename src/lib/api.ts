import { supabase } from "./supabase";

export async function gameAction<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase) throw new Error("Connect the Supabase project first.");
  const { data, error } = await supabase.functions.invoke("game-api", {
    body: { action, ...payload },
  });
  if (error) {
    const details = data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : error.message;
    throw new Error(details || "The game server could not complete that action.");
  }
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}