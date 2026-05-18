/**
 * Stera Pro — Catalogus pagina
 *
 * Plaats op: app/catalog/page.tsx
 *
 * Server component die de Nieuwkoop catalogus toont met filters + paginatie.
 * Filters worden via URL search params doorgegeven (GET form), zodat de pagina
 * deelbaar / bookmarkbaar is en altijd server-rendered.
 *
 * Vereiste env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Vereiste views (al aangemaakt):
 *   v_nieuwkoop_with_margin
 *   v_catalog_groups
 *   v_catalog_pot_diameters
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

type Product = {
  itemcode: string;
  description: string;
  item_picture_name: string | null;
  cost_price: number;
  effective_margin_factor: number;
  suggested_sale_price: number;
  main_group_code: string;
  main_group_description_nl: string;
  product_group_code: string;
  height: number | null;
  diameter: number | null;
  diameter_culture_pot: number | null;
  pot_size: string | null;
  location_icon_nl: string | null;
  show_on_website: boolean;
};

/** Genereer een Stera-naam (white-label) op basis van het Nieuwkoop product */
function generateSteraName(p: Product): string {
  let name = p.description || p.itemcode;
  if (p.main_group_code === "100" && p.height && Number(p.height) > 0) {
    name += `, H${Math.round(Number(p.height))}cm`;
  } else if (p.diameter_culture_pot && Number(p.diameter_culture_pot) > 0) {
    name += `, Ø${Math.round(Number(p.diameter_culture_pot))}cm`;
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
  const group = typeof params.group === "string" ? params.group : "";
  const light = typeof params.light === "string" ? params.light : "";
  const priceMin = Number(params.priceMin) || 0;
  const priceMax = Number(params.priceMax) || 0;
  const potDiameter =
    typeof params.potDiameter === "string" ? params.potDiameter : "";
  const page = Math.max(1, Number(params.page) || 1);

  // Filter-opties ophalen (parallel)
  const [groupsRes, diametersRes] = await Promise.all([
    supabase.from("v_catalog_groups").select("code, name"),
    supabase.from("v_catalog_pot_diameters").select("diameter"),
  ]);

  const allGroups: { code: string; name: string }[] = groupsRes.data ?? [];
  const allDiameters: number[] =
    (diametersRes.data ?? []).map((d: any) => Number(d.diameter)) ?? [];

  // Hoofdquery met filters
  let query = supabase
    .from("v_nieuwkoop_with_margin")
    .select(
      "itemcode, description, item_picture_name, cost_price, effective_margin_factor, suggested_sale_price, main_group_code, main_group_description_nl, product_group_code, height, diameter, diameter_culture_pot, pot_size, location_icon_nl, show_on_website",
      { count: "exact" }
    )
    .eq("show_on_website", true);

  if (q) query = query.ilike("description", `%${q}%`);
  if (group) query = query.eq("main_group_code", group);
  if (light) query = query.eq("location_icon_nl", light);
  if (priceMin > 0) query = query.gte("suggested_sale_price", priceMin);
  if (priceMax > 0) query = query.lte("suggested_sale_price", priceMax);
  if (potDiameter)
    query = query.eq("diameter_culture_pot", Number(potDiameter));

  query = query.order("description").range(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE - 1
  );

  const { data: products, count, error } = await query;

  // Helper: URL bouwen met behoud van alle filters
  function buildHref(overrides: Record<string, string | number>) {
    const usp = new URLSearchParams();
    if (q) usp.set("q", q);
    if (group) usp.set("group", group);
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
      <header className="mb-6">
        <h1 className="text-3xl font-serif text-stera-ink">Catalogus</h1>
        <p className="text-sm text-stera-ink/70 mt-1">
          {error
            ? `Fout bij ophalen: ${error.message}`
            : `${(count ?? 0).toLocaleString("nl-BE")} producten beschikbaar`}
        </p>
      </header>

      {/* Filter bar — server-rendered form met GET */}
      <form
        method="GET"
        action="/catalog"
        className="mb-6 bg-white/60 border border-stera-ink/10 rounded-xl p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Zoek op naam..."
          className="sm:col-span-2 lg:col-span-2 rounded-lg border border-stera-ink/20 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-stera-ink/30"
        />

        <select
          name="group"
          defaultValue={group}
          className="rounded-lg border border-stera-ink/20 px-3 py-2 bg-white"
        >
          <option value="">Alle groepen</option>
          {allGroups.map((g) => (
            <option key={g.code} value={g.code}>
              {g.name}
            </option>
          ))}
        </select>

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

        <select
          name="potDiameter"
          defaultValue={potDiameter}
          className="rounded-lg border border-stera-ink/20 px-3 py-2 bg-white"
        >
          <option value="">Alle pot-diameters</option>
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
            href="/catalog"
            className="rounded-lg border border-stera-ink/20 px-4 py-2 font-medium hover:bg-white transition"
          >
            Reset
          </Link>
          <span className="ml-auto text-xs text-stera-ink/50">
            {(count ?? 0).toLocaleString("nl-BE")} resultaten
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
              className="bg-white rounded-xl overflow-hidden border border-stera-ink/10 hover:shadow-md transition flex flex-col"
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
                  {p.location_icon_nl && (
                    <span className="text-[10px] uppercase tracking-wider text-stera-ink/50 truncate">
                      {p.location_icon_nl}
                    </span>
                  )}
                </div>
              </div>
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
