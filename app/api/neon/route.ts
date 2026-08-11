import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/neon";

type Filter =
  | { op: "eq"; column: string; value: unknown }
  | { op: "is"; column: string; value: unknown }
  | { op: "or"; expression: string };

type Body = {
  table?: string;
  operation?: "select" | "insert" | "update" | "delete" | "rpc";
  columns?: string;
  payload?: Record<string, unknown> | Record<string, unknown>[] | null;
  filters?: Filter[];
  order?: { column: string; ascending: boolean } | null;
  limit?: number | null;
  single?: boolean;
  returning?: string | null;
  functionName?: string;
  args?: Record<string, unknown>;
};

const allowedTables = new Set([
  "profiles",
  "events",
  "event_members",
  "guests",
  "apartments",
  "apartment_occupancy",
  "notifications",
]);

const identifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertIdentifier(value: string, label = "identifier") {
  if (!identifier.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function parseColumns(input = "*") {
  if (input.trim() === "*") return ["*"];
  return input.split(",").map((part) => assertIdentifier(part.trim(), "column"));
}

function qIdent(value: string) {
  return `"${assertIdentifier(value).replace(/"/g, '""')}"`;
}


function normalizeDatabaseDates<T>(input: T): T {
  const dateOnlyColumns = new Set(["start_date", "end_date", "checkin_date", "checkout_date"]);

  const normalizeRow = (row: any) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;

    const out: Record<string, unknown> = { ...row };
    for (const column of dateOnlyColumns) {
      const value = out[column];
      if (value == null) continue;

      if (value instanceof Date) {
        out[column] = value.toISOString().slice(0, 10);
        continue;
      }

      if (typeof value === "string") {
        const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) out[column] = match[1];
      }
    }

    return out;
  };

  if (Array.isArray(input)) return input.map(normalizeRow) as T;
  return normalizeRow(input) as T;
}

async function getUserFromRequest(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user ?? null;
}

async function isAdmin(userId: string) {
  const rows = await sql`SELECT is_admin FROM public.profiles WHERE id = ${userId} LIMIT 1`;
  return Boolean(rows[0]?.is_admin);
}

async function canAccessEvent(userId: string, eventId: string, admin: boolean) {
  if (admin) return true;
  const rows = await sql`
    SELECT 1
    FROM public.events e
    WHERE e.id = ${eventId}::uuid
      AND (
        e.created_by = ${userId}::uuid
        OR EXISTS (
          SELECT 1 FROM public.event_members em
          WHERE em.event_id = e.id AND em.user_id = ${userId}::uuid
        )
      )
    LIMIT 1
  `;
  return rows.length > 0;
}

async function eventIsDraft(eventId: string) {
  const rows = await sql`SELECT status FROM public.events WHERE id = ${eventId}::uuid LIMIT 1`;
  return rows[0]?.status === "draft";
}

function findEq(filters: Filter[], column: string) {
  const f = filters.find((item) => item.op === "eq" && item.column === column);
  return f && f.op === "eq" ? String(f.value) : null;
}

async function authorizedForQuery(table: string, operation: string, filters: Filter[], payload: any, userId: string, admin: boolean) {
  if (admin) return;

  if (table === "apartments") {
    if (operation !== "select") throw new Error("Not allowed");
    return;
  }

  if (table === "profiles") {
    const id = findEq(filters, "id");
    if (!id || id !== userId || operation !== "select") throw new Error("Not allowed");
    return;
  }

  if (table === "event_members") {
    const uid = findEq(filters, "user_id");
    if (!uid || uid !== userId || operation !== "select") throw new Error("Not allowed");
    return;
  }

  if (table === "events") {
    const eventId = findEq(filters, "id");
    const createdBy = findEq(filters, "created_by");

    if (operation === "select") {
      if (eventId) {
        if (!(await canAccessEvent(userId, eventId, false))) throw new Error("Not allowed");
        return;
      }
      if (createdBy === userId) return;
      throw new Error("Not allowed");
    }

    if (operation === "update") {
      if (!eventId || !(await canAccessEvent(userId, eventId, false))) throw new Error("Not allowed");
      const current = await sql`SELECT status, created_by FROM public.events WHERE id = ${eventId}::uuid LIMIT 1`;
      if (!current[0] || String(current[0].created_by) !== userId) throw new Error("Not allowed");
      const currentStatus = String(current[0].status);
      const nextStatus = payload?.status;
      const allowedSubmit = currentStatus === "draft" && nextStatus === "submitted";
      const regularDraftUpdate = currentStatus === "draft" && (nextStatus === undefined || nextStatus === "draft");
      if (!allowedSubmit && !regularDraftUpdate) throw new Error("Event is locked");
      return;
    }

    throw new Error("Not allowed");
  }

  if (table === "guests" || table === "apartment_occupancy") {
    let eventId = findEq(filters, "event_id");

    if (!eventId && table === "guests") {
      const guestId = findEq(filters, "id");
      if (guestId) {
        const rows = await sql`SELECT event_id FROM public.guests WHERE id = ${guestId}::uuid LIMIT 1`;
        eventId = rows[0]?.event_id ? String(rows[0].event_id) : null;
      }
      if (!eventId && operation === "insert") {
        const row = Array.isArray(payload) ? payload[0] : payload;
        eventId = row?.event_id ? String(row.event_id) : null;
      }
    }

    if (!eventId || !(await canAccessEvent(userId, eventId, false))) throw new Error("Not allowed");
    if (operation !== "select" && !(await eventIsDraft(eventId))) throw new Error("The list has already been submitted and is locked");
    return;
  }

  if (table === "notifications") {
    if (operation !== "select") throw new Error("Not allowed");
    return;
  }

  throw new Error("Not allowed");
}

function buildWhere(filters: Filter[], values: unknown[]) {
  const parts: string[] = [];
  for (const filter of filters) {
    if (filter.op === "eq") {
      assertIdentifier(filter.column, "filter column");
      values.push(filter.value);
      parts.push(`${qIdent(filter.column)} = $${values.length}`);
    } else if (filter.op === "is") {
      assertIdentifier(filter.column, "filter column");
      if (filter.value === null) parts.push(`${qIdent(filter.column)} IS NULL`);
      else if (filter.value === true) parts.push(`${qIdent(filter.column)} IS TRUE`);
      else if (filter.value === false) parts.push(`${qIdent(filter.column)} IS FALSE`);
      else throw new Error("Unsupported IS filter");
    } else if (filter.op === "or") {
      // Supports the only .or(...) pattern currently used by PlannerHouse:
      // first_name.ilike.%query%,last_name.ilike.%query%
      const pieces = filter.expression.split(",");
      const ors: string[] = [];
      for (const piece of pieces) {
        const match = piece.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.ilike\.(.*)$/);
        if (!match) throw new Error("Unsupported OR filter");
        const [, col, pattern] = match;
        values.push(pattern);
        ors.push(`${qIdent(col)} ILIKE $${values.length}`);
      }
      parts.push(`(${ors.join(" OR ")})`);
    }
  }
  return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
}

async function executeQuery(body: Body) {
  const table = body.table!;
  const operation = body.operation!;
  const filters = body.filters ?? [];
  const values: unknown[] = [];
  const tableSql = `public.${qIdent(table)}`;
  const where = buildWhere(filters, values);
  let query = "";

  if (operation === "select") {
    const columns = parseColumns(body.columns).map((c) => (c === "*" ? "*" : qIdent(c))).join(", ");
    query = `SELECT ${columns} FROM ${tableSql}${where}`;
    if (body.order) {
      query += ` ORDER BY ${qIdent(body.order.column)} ${body.order.ascending ? "ASC" : "DESC"}`;
    }
    if (body.limit != null) {
      const n = Math.max(0, Math.min(Number(body.limit), 1000));
      query += ` LIMIT ${n}`;
    }
  } else if (operation === "insert") {
    const rows = Array.isArray(body.payload) ? body.payload : [body.payload ?? {}];
    if (!rows.length) throw new Error("Missing insert payload");
    const cols = Object.keys(rows[0] ?? {}).map((c) => assertIdentifier(c, "insert column"));
    if (!cols.length) throw new Error("Empty insert payload");
    const tuples: string[] = [];
    for (const row of rows) {
      const tuple: string[] = [];
      for (const col of cols) {
        values.push((row as any)[col] ?? null);
        tuple.push(`$${values.length}`);
      }
      tuples.push(`(${tuple.join(", ")})`);
    }
    query = `INSERT INTO ${tableSql} (${cols.map(qIdent).join(", ")}) VALUES ${tuples.join(", ")}`;
  } else if (operation === "update") {
    const payload = (body.payload ?? {}) as Record<string, unknown>;
    const cols = Object.keys(payload).map((c) => assertIdentifier(c, "update column"));
    if (!cols.length) throw new Error("Empty update payload");
    // Build SET before WHERE so parameter positions stay deterministic.
    const updateValues: unknown[] = [];
    const setSql = cols.map((col) => {
      updateValues.push(payload[col]);
      return `${qIdent(col)} = $${updateValues.length}`;
    });
    const whereValues: unknown[] = [];
    const whereSql = buildWhere(filters, whereValues);
    values.splice(0, values.length, ...updateValues, ...whereValues);
    // Re-number WHERE placeholders because it was built from 1.
    const shiftedWhere = whereSql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + updateValues.length}`);
    query = `UPDATE ${tableSql} SET ${setSql.join(", ")}${shiftedWhere}`;
  } else if (operation === "delete") {
    query = `DELETE FROM ${tableSql}${where}`;
  } else {
    throw new Error("Unsupported operation");
  }

  if (body.returning) {
    const returning = parseColumns(body.returning).map((c) => (c === "*" ? "*" : qIdent(c))).join(", ");
    query += ` RETURNING ${returning}`;
  }

  // Neon HTTP driver supports parameterized queries through sql.query().
  const rows = await sql.query(query, values as any[]);
  const normalizedRows = normalizeDatabaseDates(rows);
  if (body.single) return normalizedRows[0] ?? null;
  return normalizedRows;
}

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = await isAdmin(user.id);
    const body = (await req.json()) as Body;

    if (body.operation === "rpc") {
      if (!admin) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
      if (body.functionName !== "admin_set_event_status") {
        return NextResponse.json({ error: "Unsupported RPC" }, { status: 400 });
      }
      const eventId = String(body.args?.p_event_id ?? "");
      const status = String(body.args?.p_status ?? "");
      if (!eventId || !["draft", "submitted", "final"].includes(status)) {
        return NextResponse.json({ error: "Invalid RPC arguments" }, { status: 400 });
      }
      await sql`UPDATE public.events SET status = ${status} WHERE id = ${eventId}::uuid`;
      return NextResponse.json({ data: null });
    }

    const table = body.table ?? "";
    const operation = body.operation ?? "";
    if (!allowedTables.has(table)) return NextResponse.json({ error: "Table not allowed" }, { status: 400 });
    if (!["select", "insert", "update", "delete"].includes(operation)) {
      return NextResponse.json({ error: "Invalid operation" }, { status: 400 });
    }
    if (table === "apartment_occupancy" && operation !== "select") {
      return NextResponse.json({ error: "View is read-only" }, { status: 400 });
    }

    const filters = body.filters ?? [];
    await authorizedForQuery(table, operation, filters, body.payload, user.id, admin);
    const data = await executeQuery(body);
    return NextResponse.json({ data });
  } catch (error: any) {
    const message = error?.message ?? "Database error";
    const status = message === "Not allowed" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
