/**
 * Stera Pro — Catalogus pagina
 *
 * Toont enkel de twee productgroepen die voor de bedrijven-app
 * relevant zijn:
 *   - product_group_code = '100' → Hydrocultuur-planten
 *   - product_group_code = '300' → Plantenbakken (buitenpotten)
 *
 * Alle andere Nieuwkoop-artikelen zijn niet van toepassing en worden
 * niet getoond.
 */

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 48;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);

type Kind = "plant" | "pot";
const KIND_GROUP: Record<Kind, string> = {
  plant: "100",
  pot: "300",
};
const KIND_LABEL: Record<Kind, string> = {
  plant: "Hydrocultuur-planten",
  pot: "Potten",
};

type Product = {
  itemcode: string;
  description: string;
  item_picture_name: string | null;
  cost_price: number;
  effective_margin_factor: number;
  suggested_sale_price: number;
  product_group_code: string;
  height: number | null;
  diameter: number | null;
  diameter_culture_pot: number | null;
  pot_size: string | null;
  location_icon_nl: string | null;
};

/** Genereer een Stera-naam (white-label) op basis van het Nieuwkoop product */
function generateSteraName(p: Product): string {
  let name = p.description || p.itemcode;
  if (p.product_group_code === "100" && p.height && Number(p.height) > 0) {
    name += `, H${Math.round(Number(p.height))}cm`;
  } else if (p.diameter_culture_pot && Number(p.diameter_culture_pot) > 0) {
    name += `, Ø${Math.round(Number(p.diameter_culture_pot))}cm`;
  } else if (p.diameter && Number(p.diameter) > 0) {
    name += `, Ø${Math.round(Number(p.diameter))}cm`;
  }
  return name;
}

function formatPrice(n: number): string {
  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const kindParam = typeof params.kind === "string" ? params.kind : "plant";
  const kind: Kind = kindParam === "pot" ? "pot" : "plant";
  const light = typeof params.light === "string" ? params.light : "";
  const priceMin = Number(params.priceMin) || 0;
  const priceMax = Number(params.priceMax) || 0;
  const potDiameter =
    typeof params.potDiameter === "string" ? params.potDiameter : "";
  const page = Math.max(1, Number(params.page) || 1);

  const groupCode = KIND_GROUP[kind];

  // Beschikbare pot-diameters voor de huidige tab. Bij planten kijken
  // we naar de cultuurpot-maten, bij potten naar de pot-diameter zelf.
  // We lezen ze direct uit de view zodat we enkel maten tonen die ook
  // echt voorkomen in deze groep.
  const potColumn =
    kind === "pot" ? "diameter" : "diameter_culture_pot";

  const { data: diameterRows } = await supabase
    .from("v_nieuwkoop_with_margin")
    .select(potColumn)
    .eq("product_group_code", groupCode)
    .not(potColumn, "is", null);

  const allDiameters: number[] = Array.from(
    new Set(
      ((diameterRows ?? []) as Array<Record<string, unknown>>)
        .map((d) => Number(d[potColumn]))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  ).sort((a, b) => a - b);

  // Hoofdquery met filters
  let query = supabase
    .from("v_nieuwkoop_with_margin")
    .select(
      "itemcode, description, item_picture_name, cost_price, effective_margin_factor, suggested_sale_price, product_group_code, height, diameter, diameter_culture_pot, pot_size, location_icon_nl",
      { count: "exact" }
    )
    .eq("product_group_code", groupCode);

  if (q) query = query.ilike("description", `%${q}%`);
  if (kind === "plant" && light)
    query = query.eq("location_icon_nl", light);
  if (priceMin > 0) query = query.gte("suggested_sale_price", priceMin);
  if (priceMax > 0) query = query.lte("suggested_sale_price", priceMax);
  if (potDiameter) query = query.eq(potColumn, Number(potDiameter));

  query = query.order("description").range(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE - 1
  );

  const { data: products, count, error } = await query;

  // Helper: URL bouwen met behoud van alle filters
  function buildHref(overrides: Record<string, string | number>) {
    const usp = new URLSearchParams();
    if (kind !== "plant") usp.set("kind", kind);
    if (q) usp.set("q", q);
    if (light) usp.set("light", light);
    if (priceMin > 0) usp.set("priceMin", String(priceMin));
    if (priceMax > 0) usp.set("priceMax", String(priceMax));
    if (potDiameter) usp.set("potDiameter", potDiameter);
    if (page > 1) usp.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === "" || v === 0) usp.delete(k);
      else usp.set(k, String(v));
    }
    const s = usp.toString();
    return "/catalog" + (s ? `?${s}` : "");
  }

  const totalPages = count ? Math.max(1, Math.ceil(count / PAGE_SIZE)) : 1;
  const list = (products ?? []) as Product[];

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <header className="mb-4">
        <h1 className="text-3xl font-serif text-stera-ink">Catalogus</h1>
        <p className="text-sm text-stera-ink/70 mt-1">
          Hydrocultuur-planten en bijhorende potten uit het Nieuwkoop-assortiment.
        </p>
      </header>

      {/* Tabs — Hydrocultuur / Potten */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(["plant", "pot"] as Kind[]).map((k) => {
          const href =
            "/catalog" + (k === "plant" ? "" : `?kind=${k}`);
          const active = kind === k;
          return (
            <Link
              key={k}
              href={href}
              className={
                active
                  ? "rounded-full bg-stera-green px-4 py-2.5 text-sm font-semibold text-white"
                  : "rounded-full border border-stera-ink/20 bg-white px-4 py-2.5 text-sm font-medium text-stera-ink hover:border-stera-green"
              }
            >
              {KIND_LABEL[k]}
            </Link>
          );
        })}
      </div>

      {/* Filter bar — server-rendered form met GET */}
      <form
        method="GET"
        action="/catalog"
        className="mb-6 bg-white/60 border border-stera-ink/10 rounded-xl p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <input type="hidden" name="kind" value={kind} />

        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Zoek op naam..."
          className="sm:col-span-2 lg:col-span-2 rounded-lg border border-stera-ink/20 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-stera-ink/30"
        />

        {kind === "plant" ? (
          <select
            name="light"
            defaultValue={light}
            className="rounded-lg border border-stera-ink/20 px-3 py-2 bg-white"
          >
            <option value="">Alle lichtbehoeften</option>
            <option value="zon">Zon</option>
            <option value="half-schaduw">Half-schaduw</option>
            <option value="schaduw">Schaduw</option>
          </select>
        ) : (
          <div />
        )}

        <select
          name="potDiameter"
          defaultValue={potDiameter}
          className="rounded-lg border border-stera-ink/20 px-3 py-2 bg-white"
        >
          <option value="">
            {kind === "pot" ? "Alle pot-diameters" : "Alle plant-pot-diameters"}
          </option>
          {allDiameters.map((d) => (
            <option key={d} value={d}>
              Ø {d} cm
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <input
            type="number"
            name="priceMin"
            min={0}
            defaultValue={priceMin || ""}
            placeholder="€ min"
            className="w-1/2 rounded-lg border border-stera-ink/20 px-3 py-2 bg-white"
          />
          <input
            type="number"
            name="priceMax"
            min={0}
            defaultValue={priceMax || ""}
            placeholder="€ max"
            className="w-1/2 rounded-lg border border-stera-ink/20 px-3 py-2 bg-white"
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-6 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="rounded-lg bg-stera-ink text-white px-4 py-2 font-medium hover:opacity-90 transition"
          >
            Filter toepassen
          </button>
          <Link
            href={kind === "plant" ? "/catalog" : "/catalog?kind=pot"}
            className="rounded-lg border border-stera-ink/20 px-4 py-2 font-medium hover:bg-white transition"
          >
            Reset
          </Link>
          <span className="ml-auto text-xs text-stera-ink/50">
            {error
              ? `Fout: ${error.message}`
              : `${(count ?? 0).toLocaleString("nl-BE")} resultaten`}
          </span>
        </div>
      </form>

      {/* Resultaten grid */}
      {list.length === 0 ? (
        <div className="text-center py-16 text-stera-ink/60 bg-white/40 rounded-xl border border-stera-ink/10">
          Geen producten gevonden met deze filters.
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
          {list.map((p) => (
            <li
              key={p.itemcode}
              className="bg-white rounded-xl overflow-hidden border border-stera-ink/10 hover:shadow-md hover:border-stera-green transition"
            >
              <Link
                href={`/catalog/${p.itemcode}`}
                className="flex h-full flex-col"
              >
                <div className="aspect-square bg-stera-cream/40 relative">
                  {p.item_picture_name ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/nieuwkoop/image/${p.itemcode}`}
                      alt={p.description}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-stera-ink/30 text-xs">
                      Geen foto
                    </div>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col">
                  <h3 className="text-sm font-medium text-stera-ink leading-tight line-clamp-2 min-h-[2.5em]">
                    {generateSteraName(p)}
                  </h3>
                  <div className="mt-2 flex items-baseline justify-between gap-2 mt-auto pt-2">
                    <span className="font-semibold text-stera-ink">
                      {formatPrice(Number(p.suggested_sale_price ?? 0))}
                    </span>
                    {kind === "plant" && p.location_icon_nl ? (
                      <span className="text-[10px] uppercase tracking-wider text-stera-ink/50 truncate">
                        {p.location_icon_nl}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Paginatie */}
      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-between gap-2">
          <Link
            href={buildHref({ page: Math.max(1, page - 1) })}
            aria-disabled={page <= 1}
            className={`rounded-lg px-4 py-2 border border-stera-ink/20 transition ${
              page <= 1
                ? "pointer-events-none opacity-40"
                : "hover:bg-white"
            }`}
          >
            ← Vorige
          </Link>
          <span className="text-sm text-stera-ink/70">
            Pagina {page.toLocaleString("nl-BE")} van{" "}
            {totalPages.toLocaleString("nl-BE")}
          </span>
          <Link
            href={buildHref({ page: Math.min(totalPages, page + 1) })}
            aria-disabled={page >= totalPages}
            className={`rounded-lg px-4 py-2 border border-stera-ink/20 transition ${
              page >= totalPages
                ? "pointer-events-none opacity-40"
                : "hover:bg-white"
            }`}
          >
            Volgende →
          </Link>
        </nav>
      )}
    </main>
  );
}
