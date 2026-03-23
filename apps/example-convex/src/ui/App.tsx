import React, { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";

type Tab = "recommend" | "products";

function getUserId() {
  const key = "veil_demo_userId";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = `user_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(key, next);
  return next;
}

export function App() {
  const [tab, setTab] = useState<Tab>("recommend");
  const userId = useMemo(() => getUserId(), []);

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Veil (Convex Component) Demo</div>
          <div className="muted" style={{ fontSize: 13 }}>
            userId: {userId}
          </div>
        </div>
        <div className="tabs">
          <button className="tab" aria-selected={tab === "recommend"} onClick={() => setTab("recommend")}>
            Recommendations
          </button>
          <button className="tab" aria-selected={tab === "products"} onClick={() => setTab("products")}>
            Product List
          </button>
        </div>
      </div>

      {tab === "products" ? <ProductsTab /> : <RecommendTab userId={userId} />}
    </div>
  );
}

function ProductsTab() {
  const products = useQuery(api.products.list, {}) ?? [];
  const upsert = useMutation(api.products.upsert);
  const remove = useMutation(api.products.remove);

  const [form, setForm] = useState({
    itemId: "",
    name: "",
    category: "",
    tags: "",
    region: "BD",
    price: 99,
    rating: 4.2,
    active: true,
  });

  const submit = async () => {
    const now = Date.now();
    await upsert({
      itemId: form.itemId.trim() ? form.itemId.trim() : undefined,
      name: form.name.trim(),
      category: form.category.trim(),
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      meta: { region: form.region.trim(), price: Number(form.price), rating: Number(form.rating), recency: now },
      active: form.active,
    });
    setForm((f) => ({ ...f, itemId: "", name: "", category: "", tags: "" }));
  };

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "flex-end", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Create / Update Product</div>
          <div className="muted" style={{ fontSize: 13 }}>
            This saves into Convex `items`.
          </div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>Item ID (optional)</label>
          <input value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Category</label>
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 240 }}>
          <label>Tags (comma)</label>
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        </div>
        <div className="field" style={{ width: 120 }}>
          <label>Region</label>
          <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
        </div>
        <div className="field" style={{ width: 140 }}>
          <label>Price</label>
          <input
            type="number"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
          />
        </div>
        <div className="field" style={{ width: 140 }}>
          <label>Rating</label>
          <input
            type="number"
            step="0.1"
            value={form.rating}
            onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
          />
        </div>
        <div className="field" style={{ width: 120 }}>
          <label>Active</label>
          <select
            value={form.active ? "true" : "false"}
            onChange={(e) => setForm({ ...form, active: e.target.value === "true" })}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
        <button className="btn primary" onClick={submit} disabled={!form.name.trim() || !form.category.trim()}>
          Save
        </button>
      </div>

      <div style={{ fontWeight: 700, marginBottom: 10 }}>Products ({products.length})</div>
      <div className="list">
        {products
          .slice()
          .sort((a, b) => (a.itemId > b.itemId ? 1 : -1))
          .map((p) => (
            <div className="card" key={p._id} style={{ padding: 12 }}>
              <div className="itemTitle">{p.name}</div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                {p.itemId} • {p.category} • {p.active ? "active" : "inactive"}
              </div>
              <div style={{ marginBottom: 8 }}>
                <span className="pill">region:{p.meta?.region}</span>
                <span className="pill">price:{p.meta?.price}</span>
                <span className="pill">rating:{p.meta?.rating}</span>
              </div>
              {p.tags?.length ? (
                <div style={{ marginBottom: 10 }}>
                  {p.tags.map((t: string) => (
                    <span className="pill" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="row">
                <button className="btn" onClick={() => setForm({ ...form, ...toForm(p) })}>
                  Edit
                </button>
                <button className="btn danger" onClick={() => remove({ itemId: p.itemId })}>
                  Delete
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function toForm(p: any) {
  return {
    itemId: p.itemId ?? "",
    name: p.name ?? "",
    category: p.category ?? "",
    tags: (p.tags ?? []).join(", "),
    region: p.meta?.region ?? "BD",
    price: p.meta?.price ?? 99,
    rating: p.meta?.rating ?? 4.2,
    active: Boolean(p.active),
  };
}

function RecommendTab(props: { userId: string }) {
  const [region, setRegion] = useState("BD");
  const [budget, setBudget] = useState(900);

  const recommendations =
    useQuery(api.recommendations.list, {}) ?? [];
  
    console.log(recommendations)

  const runCycle = useAction(api.recommendations.runCycle);
  const record = useMutation(api.components.veil.feedback.record as any);

  const viewItem = async (itemId: string) => {
    await record({ userId: props.userId, itemId, event: "view" });
  };
  const likeItem = async (itemId: string) => {
    await record({ userId: props.userId, itemId, event: "click" });
    await runCycle({ userId: props.userId });
  };
  const dislikeItem = async (itemId: string) => {
    await record({ userId: props.userId, itemId, event: "dislike" });
    await runCycle({ userId: props.userId });
  };

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Recommendations</div>
          <div className="muted" style={{ fontSize: 13 }}>
            View/Like/Dislike writes feedback into the Veil component and re-runs the cycle.
          </div>
        </div>
        <button className="btn primary" onClick={() => runCycle({ userId: props.userId })}>
          Run cycle now
        </button>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <div className="field">
          <label>Region</label>
          <input value={region} onChange={(e) => setRegion(e.target.value)} />
        </div>
        <div className="field">
          <label>Budget</label>
          <input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        </div>
      </div>

      <div className="list">
        {recommendations.map((r: any) => (
          <div className="card" key={r.id} style={{ padding: 12 }}>
            <div className="itemTitle">{r.name}</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
              {r.id} • {r.category} • rank {r.rank}
            </div>
            <div style={{ marginBottom: 10 }}>
              <span className="pill">hard:{Number(r.hard_score).toFixed?.(2) ?? r.hard_score}</span>
              <span className="pill">llm:{Number(r.llm_score).toFixed?.(2) ?? r.llm_score}</span>
              <span className="pill">price:{r.meta?.price}</span>
              <span className="pill">rating:{r.meta?.rating}</span>
              <span className="pill">region:{r.meta?.region}</span>
            </div>
            <div className="row">
              <button className="btn" onClick={() => viewItem(r.id)}>
                View
              </button>
              <button className="btn primary" onClick={() => likeItem(r.id)}>
                Like
              </button>
              <button className="btn danger" onClick={() => dislikeItem(r.id)}>
                Dislike
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

