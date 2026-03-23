import React, { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";

type Tab = "recommend" | "products" | "chat";

function getOrCreateLocalStorageValue(key: string, factory: () => string) {
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = factory();
  localStorage.setItem(key, next);
  return next;
}

function getUserId() {
  return getOrCreateLocalStorageValue("veil_demo_userId", () => `user_${Math.random().toString(36).slice(2, 10)}`);
}

function getStoredThreadId(userId: string) {
  return localStorage.getItem(`veil_demo_thread_${userId}`);
}

function setStoredThreadId(userId: string, threadId: string | null) {
  const key = `veil_demo_thread_${userId}`;
  if (threadId) localStorage.setItem(key, threadId);
  else localStorage.removeItem(key);
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
          <button className="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>
            Chat
          </button>
        </div>
      </div>

      {tab === "products" ? <ProductsTab /> : null}
      {tab === "recommend" ? <RecommendTab userId={userId} /> : null}
      {tab === "chat" ? <ChatTab userId={userId} /> : null}
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
          <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
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

  const recommendations = useQuery(api.recommendations.list, { region, budget, userId: props.userId }) ?? [];
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
            View/Like/Dislike writes feedback into Veil and re-runs the ranking cycle.
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

function ChatTab(props: { userId: string }) {
  const createThread = useAction(api.chat.createThread);
  const respond = useAction(api.chat.respond);
  const orders = useQuery(api.chat_tools.listOrders, { userId: props.userId }) ?? [];

  const [threadId, setThreadId] = useState<string | null>(() => getStoredThreadId(props.userId));
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("Ready.");

  const messages = useQuery(api.chat.listMessages, threadId ? { threadId } : ("skip" as any)) ?? [];

  const sendMessage = async () => {
    const text = message.trim();
    if (!text) return;

    setStatus("Sending...");
    let activeThreadId = threadId;

    if (!activeThreadId) {
      const thread = await createThread({
        userId: props.userId,
        title: "Shopping assistant",
      });
      activeThreadId = thread.id;
      setThreadId(activeThreadId);
      setStoredThreadId(props.userId, activeThreadId);
    }

    setMessage("");
    const result = await respond({
      threadId: activeThreadId,
      userId: props.userId,
      message: text,
    });
    setStatus(`Last run: ${result.runId}`);
  };

  const resetThread = () => {
    setThreadId(null);
    setStoredThreadId(props.userId, null);
    setStatus("Ready.");
  };

  return (
    <div className="chatLayout">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Snapshot-first Chat</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Demo wrapper registers local tools plus a plugin-style commerce tool pack on each request.
            </div>
          </div>
          <div className="row">
            <button className="btn" onClick={resetThread}>
              New thread
            </button>
          </div>
        </div>

        <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Thread: {threadId ?? "none"} • {status}
        </div>

        <div className="chatTranscript">
          {messages.length === 0 ? (
            <div className="muted">Try asking for recommendations, product details, shipping, or to place an order.</div>
          ) : (
            messages.map((entry: any) => (
              <div className={`chatBubble ${entry.role === "assistant" ? "assistant" : "user"}`} key={entry.id}>
                <div className="chatRole">{entry.role}</div>
                <div>{typeof entry.parts === "string" ? entry.parts : JSON.stringify(entry.parts)}</div>
              </div>
            ))
          )}
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <textarea
            className="chatInput"
            placeholder="Ask for ideas from the snapshot, or say something like: place an order for the best headphone under 120."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={sendMessage} disabled={!message.trim()}>
            Send
          </button>
          <button className="btn" onClick={() => setMessage("Show me 3 strong options for travel gear under 150.")}>
            Prompt: recommendations
          </button>
          <button className="btn" onClick={() => setMessage("Give me fresh details for the top ranked item and quote shipping to BD.")}>
            Prompt: details
          </button>
          <button className="btn" onClick={() => setMessage("Place an order for the top item with quantity 1 for user " + props.userId + ".")}>
            Prompt: order
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Orders Created By Tools</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          `place_order` is part of the demo plugin-style tool pack.
        </div>
        <div className="list">
          {orders.map((order: any) => (
            <div className="card" key={order.orderId} style={{ padding: 12 }}>
              <div className="itemTitle">{order.orderId}</div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                {order.itemId} • qty {order.quantity} • {order.status}
              </div>
              <div>
                <span className="pill">total:{order.totalPrice}</span>
                <span className="pill">user:{order.userId}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
