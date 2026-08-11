"use client";

import { authClient } from "@/lib/auth-client";

type Filter =
  | { op: "eq"; column: string; value: unknown }
  | { op: "is"; column: string; value: unknown }
  | { op: "or"; expression: string };

type Order = { column: string; ascending: boolean };
type Operation = "select" | "insert" | "update" | "delete";
type DbRow = Record<string, any>;
type ApiResult<T = DbRow[]> = { data: T | null; error: { message: string } | null };

class NeonQueryBuilder<T = DbRow[]> implements PromiseLike<ApiResult<T>> {
  private operation: Operation = "select";
  private columns = "*";
  private payload: unknown = null;
  private filters: Filter[] = [];
  private orderBy: Order | null = null;
  private rowLimit: number | null = null;
  private wantsSingle = false;
  private returningColumns: string | null = null;

  constructor(private table: string) {}

  select(columns = "*") {
    if (this.operation === "insert" || this.operation === "update" || this.operation === "delete") {
      this.returningColumns = columns;
    } else {
      this.operation = "select";
      this.columns = columns;
    }
    return this;
  }
  insert(payload: unknown) { this.operation = "insert"; this.payload = payload; return this; }
  update(payload: unknown) { this.operation = "update"; this.payload = payload; return this; }
  delete() { this.operation = "delete"; return this; }
  eq(column: string, value: unknown) { this.filters.push({ op: "eq", column, value }); return this; }
  is(column: string, value: unknown) { this.filters.push({ op: "is", column, value }); return this; }
  or(expression: string) { this.filters.push({ op: "or", expression }); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.orderBy = { column, ascending: options?.ascending !== false }; return this; }
  limit(value: number) { this.rowLimit = value; return this; }
  single(): NeonQueryBuilder<DbRow> {
    this.wantsSingle = true;
    return this as unknown as NeonQueryBuilder<DbRow>;
  }

  private async execute(): Promise<ApiResult<T>> {
    try {
      const response = await fetch("/api/neon", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: this.table,
          operation: this.operation,
          columns: this.columns,
          payload: this.payload,
          filters: this.filters,
          order: this.orderBy,
          limit: this.rowLimit,
          single: this.wantsSingle,
          returning: this.returningColumns,
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) return { data: null, error: { message: json?.error || `Request failed (${response.status})` } };
      return { data: json.data ?? null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error?.message ?? "Database request failed" } };
    }
  }

  then<TResult1 = ApiResult<T>, TResult2 = never>(
    onfulfilled?: ((value: ApiResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

async function rpc(functionName: string, args: Record<string, unknown> = {}): Promise<ApiResult> {
  try {
    const response = await fetch("/api/neon", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "rpc", functionName, args }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return { data: null, error: { message: json?.error || `Request failed (${response.status})` } };
    return { data: json.data ?? null, error: null };
  } catch (error: any) {
    return { data: null, error: { message: error?.message ?? "RPC failed" } };
  }
}

const authCompat = {
  async getSession() {
    const { data, error } = await authClient.getSession();
    return {
      data: { session: data ? { user: data.user } : null },
      error: error ? { message: error.message || "Session error" } : null,
    };
  },

  async getUser() {
    const { data, error } = await authClient.getSession();
    return {
      data: { user: data?.user ?? null },
      error: error ? { message: error.message || "Session error" } : null,
    };
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      return { data: { session: null, user: null }, error: { message: result.error.message || "Login failed" } };
    }
    const sessionResult = await authClient.getSession();
    return {
      data: {
        session: sessionResult.data ? { user: sessionResult.data.user } : null,
        user: sessionResult.data?.user ?? result.data?.user ?? null,
      },
      error: null,
    };
  },

  async signOut() {
    const result = await authClient.signOut();
    return {
      error: result.error ? { message: result.error.message || "Logout failed" } : null,
    };
  },
};

// Compatibility facade: existing UI code can keep using `supabase.from(...)` while
// data comes from Neon and auth comes from Better Auth. No Supabase runtime service is used.
export const supabase = {
  auth: authCompat,
  from: (table: string) => new NeonQueryBuilder<DbRow[]>(table),
  rpc,
};
