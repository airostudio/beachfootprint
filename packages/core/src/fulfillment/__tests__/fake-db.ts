// A minimal, hand-rolled fake of the subset of the @supabase/supabase-js
// query-builder API the fulfillment service uses (from/select/eq/is/not/
// limit/update/insert/upsert/single/maybeSingle, plus the two `!inner(...)`
// embedded-relation selects it reads). Not a general-purpose Postgrest
// emulator — just enough to exercise the business logic in service.ts
// against an in-memory table store.

type Row = Record<string, any>;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `fake-id-${idCounter}`;
}

export class FakeSupabase {
  private tables = new Map<string, Row[]>();

  seed(table: string, rows: Row[]): void {
    this.tables.set(table, rows.map((r) => ({ ...r })));
  }

  rows(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  from(table: string): FakeQuery {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return new FakeQuery(table, this.tables);
  }
}

class FakeQuery implements PromiseLike<{ data: any; error: any }> {
  private filters: Array<(row: Row) => boolean> = [];
  private mode: "select" | "update" | "insert" | "upsert" = "select";
  private payload: any;
  private upsertConflict?: string;
  private selectCols?: string;
  private limitN?: number;
  private singleFlag = false;
  private maybeSingleFlag = false;

  constructor(
    private table: string,
    private store: Map<string, Row[]>,
  ) {}

  select(cols?: string): this {
    this.selectCols = cols;
    return this;
  }
  eq(col: string, value: any): this {
    if (col.includes(".")) {
      const [relation, relationCol] = col.split(".");
      this.filters.push((row) => this.resolveRelation(relation, row)?.[relationCol] === value);
    } else {
      this.filters.push((row) => row[col] === value);
    }
    return this;
  }
  is(col: string, value: null): this {
    this.filters.push((row) => row[col] === value || row[col] === undefined);
    return this;
  }
  not(col: string, _op: string, value: null): this {
    this.filters.push((row) => row[col] !== value && row[col] !== undefined);
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  update(payload: Row): this {
    this.mode = "update";
    this.payload = payload;
    return this;
  }
  insert(payload: Row | Row[]): this {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[], opts?: { onConflict: string }): this {
    this.mode = "upsert";
    this.payload = payload;
    this.upsertConflict = opts?.onConflict;
    return this;
  }
  single(): this {
    this.singleFlag = true;
    return this;
  }
  maybeSingle(): this {
    this.maybeSingleFlag = true;
    return this;
  }

  private resolveRelation(relation: string, row: Row): Row | undefined {
    if (relation === "products" && this.table === "product_variants") {
      return this.store.get("products")?.find((p) => p.id === row.product_id);
    }
    return undefined;
  }

  private withEmbeds(row: Row): Row {
    if (!this.selectCols) return row;
    const result = { ...row };
    if (this.selectCols.includes("products!inner") && this.table === "product_variants") {
      result.products = this.store.get("products")?.find((p) => p.id === row.product_id);
    }
    if (this.selectCols.includes("product_variants!inner") && this.table === "order_items") {
      result.product_variants = this.store.get("product_variants")?.find((v) => v.id === row.variant_id);
    }
    return result;
  }

  private execute(): { data: any; error: any } {
    const table = this.store.get(this.table)!;

    if (this.mode === "select") {
      let matched = table.filter((row) => this.filters.every((f) => f(row)));
      if (this.limitN) matched = matched.slice(0, this.limitN);
      const withEmbeds = matched.map((r) => this.withEmbeds(r));
      if (this.singleFlag) return { data: withEmbeds[0] ?? null, error: withEmbeds[0] ? null : { message: "no rows found" } };
      if (this.maybeSingleFlag) return { data: withEmbeds[0] ?? null, error: null };
      return { data: withEmbeds, error: null };
    }

    if (this.mode === "update") {
      const matched = table.filter((row) => this.filters.every((f) => f(row)));
      matched.forEach((row) => Object.assign(row, this.payload));
      if (this.singleFlag || this.maybeSingleFlag) {
        const row = matched[0] ? this.withEmbeds(matched[0]) : null;
        return { data: row, error: this.singleFlag && !row ? { message: "no rows found" } : null };
      }
      return { data: matched.map((r) => this.withEmbeds(r)), error: null };
    }

    if (this.mode === "insert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({ id: r.id ?? nextId(), ...r }));
      table.push(...rows);
      if (this.singleFlag) return { data: rows[0], error: null };
      return { data: rows, error: null };
    }

    // upsert
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
    const results: Row[] = [];
    for (const incoming of rows) {
      let existing: Row | undefined;
      if (this.upsertConflict) {
        const keys = this.upsertConflict.split(",");
        existing = table.find((row) => keys.every((k) => row[k] === incoming[k]));
      }
      if (existing) {
        Object.assign(existing, incoming);
        results.push(existing);
      } else {
        const inserted = { id: incoming.id ?? nextId(), ...incoming };
        table.push(inserted);
        results.push(inserted);
      }
    }
    if (this.singleFlag) return { data: results[0], error: null };
    return { data: results, error: null };
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}
