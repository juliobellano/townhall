"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  CircleAlert,
  Landmark,
  Loader2,
  Lock,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/*
 * A scripted, autoplaying walkthrough of Town Hall with a fake cursor: two people on two computers,
 * each with their own Claude, sharing tools through Town Hall. Nothing here calls the backend: the
 * script below drives a mock, so it always plays the same way.
 */

type Who = "sarah" | "maria";
type Msg =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "call"; name: string; arg: string; status: "running" | "ok" | "error"; note?: string }
  | { kind: "peer"; from: string; text: string }
  | { kind: "result"; rows: [string, string][]; total: string };

type Tool = { id: string; name: string; owner: string; version: number; access: string };
type Audit = { who: string; what: string; ok: boolean };

type State = {
  chapter: number;
  chats: Record<Who, Msg[]>;
  prompts: Record<Who, string>;
  tools: Tool[];
  gate: { tool: string; n: number } | null; // checks passed so far
  relay: string | null; // a message passing between the two agents through Town Hall
  audit: Audit[];
  toast: string | null;
  ended: boolean; // the script finished: show the summary
};

type Action =
  | { t: "chapter"; i: number }
  | { t: "move"; to: string }
  | { t: "click" }
  | { t: "wait"; ms: number }
  | { t: "set"; patch: Partial<State> }
  | { t: "type"; who: Who; text: string }
  | { t: "push"; who: Who; msg: Msg }
  | { t: "update"; who: Who; name: string; patch: Partial<Extract<Msg, { kind: "call" }>> }
  | { t: "tool"; tool: Tool }
  | { t: "audit"; entry: Audit };

const TAX_V1: Tool = { id: "tax", name: "Tax filing report", owner: "Sarah", version: 1, access: "Engineering, Sales" };
const PIPELINE_V1: Tool = { id: "pipeline", name: "Sales pipeline", owner: "Maria", version: 1, access: "Sales, Engineering" };

const INITIAL: State = {
  chapter: 0,
  chats: { sarah: [], maria: [] },
  prompts: { sarah: "", maria: "" },
  tools: [PIPELINE_V1],
  gate: null,
  relay: null,
  audit: [],
  toast: null,
  ended: false,
};

const PEOPLE: Record<Who, { name: string; dept: string; other: string }> = {
  sarah: { name: "Sarah", dept: "Engineering", other: "Maria" },
  maria: { name: "Maria", dept: "Sales", other: "Sarah" },
};
const GATE = ["Tool contract", "Only adds an optional input", "Source scan", "Same output on old examples", "Recorded expectations"];
const CHAPTERS = ["Sarah shares a tool", "Maria's agent uses it", "Agents talk", "v2 is live", "Fixing each other's tools"];

const gateSteps = (tool: string): Action[] =>
  [1, 2, 3, 4, 5].flatMap((n): Action[] => [{ t: "set", patch: { gate: { tool, n } } }, { t: "wait", ms: 170 }]);

const typeAndSend = (who: Who, text: string): Action[] => [
  { t: "move", to: `${who}-input` },
  { t: "click" },
  { t: "type", who, text },
  { t: "move", to: `${who}-send` },
  { t: "click" },
  { t: "push", who, msg: { kind: "user", text } },
  { t: "set", patch: { prompts: { sarah: "", maria: "" } } },
];

const SCRIPT: Action[] = [
  // 1. Sarah tells her Claude to put her tool on Town Hall.
  { t: "chapter", i: 0 },
  ...typeAndSend("sarah", "Publish my tax filing report to Town Hall"),
  { t: "push", who: "sarah", msg: { kind: "call", name: "publish_tool", arg: "tax-filing-report", status: "running" } },
  { t: "wait", ms: 400 },
  { t: "update", who: "sarah", name: "publish_tool", patch: { status: "ok", note: "v1 · Engineering, Sales" } },
  { t: "tool", tool: TAX_V1 },
  { t: "audit", entry: { who: "sarah", what: "publish_tool tax-filing-report", ok: true } },
  { t: "set", patch: { toast: "Deployed v1 · MCP ready" } },
  { t: "push", who: "sarah", msg: { kind: "agent", text: "Published. Engineering and Sales can use it, and every run is logged." } },
  { t: "wait", ms: 900 },
  { t: "set", patch: { toast: null } },

  // 2. Maria asks her Claude to use Sarah's tool. It fails, so she asks why.
  { t: "chapter", i: 1 },
  ...typeAndSend("maria", "Use Sarah's tax filing tool: October totals in Jakarta time"),
  { t: "push", who: "maria", msg: { kind: "call", name: "search_tools", arg: "tax filing", status: "running" } },
  { t: "update", who: "maria", name: "search_tools", patch: { status: "ok", note: "Tax filing report, owner Sarah" } },
  { t: "push", who: "maria", msg: { kind: "call", name: "get_tool", arg: "tax-filing-report", status: "running" } },
  { t: "update", who: "maria", name: "get_tool", patch: { status: "ok", note: "inputs: month, branches" } },
  { t: "push", who: "maria", msg: { kind: "call", name: "run_tool", arg: '{"month":"2026-10","timezone":"Asia/Jakarta"}', status: "running" } },
  { t: "update", who: "maria", name: "run_tool", patch: { status: "error", note: "Unknown input: timezone" } },
  { t: "audit", entry: { who: "maria", what: "run_tool tax-filing-report", ok: false } },
  { t: "wait", ms: 500 },
  ...typeAndSend("maria", "Hey, why is it not working?"),
  { t: "push", who: "maria", msg: { kind: "agent", text: "The tool has no timezone input, and month-end totals change with the zone. I'll ask Sarah's agent." } },

  // 3. Maria's agent consults Sarah's agent, which decides, changes the tool and deploys it.
  { t: "chapter", i: 2 },
  { t: "push", who: "maria", msg: { kind: "call", name: "request_change", arg: "add a timezone input", status: "running" } },
  { t: "set", patch: { relay: "Maria's agent → Sarah's agent: can the tax filing report take a timezone?" } },
  { t: "wait", ms: 500 },
  { t: "push", who: "sarah", msg: { kind: "peer", from: "Maria's agent", text: "Can the tax filing report take a timezone? Month-end totals differ by zone." } },
  { t: "wait", ms: 400 },
  { t: "push", who: "sarah", msg: { kind: "agent", text: "Reasonable and low risk. I'll add an optional timezone, default UTC, so existing results don't change." } },
  { t: "push", who: "sarah", msg: { kind: "call", name: "update_tool", arg: "tax-filing-report", status: "running" } },
  ...gateSteps("Tax filing report v2"),
  { t: "update", who: "sarah", name: "update_tool", patch: { status: "ok", note: "v2 deployed · v1 kept" } },
  { t: "tool", tool: { ...TAX_V1, version: 2 } },
  { t: "audit", entry: { who: "sarah", what: "update_tool tax-filing-report v2", ok: true } },
  { t: "set", patch: { gate: null, relay: null, toast: "v2 deployed · v1 kept" } },
  { t: "wait", ms: 400 },
  { t: "set", patch: { toast: null } },

  // 4. Maria's agent sees the new field and runs it.
  { t: "chapter", i: 3 },
  { t: "update", who: "maria", name: "request_change", patch: { status: "ok", note: "v2 deployed" } },
  { t: "push", who: "maria", msg: { kind: "peer", from: "Sarah's agent", text: "Added an optional timezone input, default UTC. v2 is live." } },
  { t: "push", who: "maria", msg: { kind: "agent", text: "Oh, there's a new field. Running it again." } },
  { t: "push", who: "maria", msg: { kind: "call", name: "run_tool ", arg: '{"month":"2026-10","timezone":"Asia/Jakarta"}', status: "running" } },
  { t: "update", who: "maria", name: "run_tool ", patch: { status: "ok", note: "v2" } },
  { t: "audit", entry: { who: "maria", what: "run_tool tax-filing-report v2", ok: true } },
  {
    t: "push",
    who: "maria",
    msg: { kind: "result", rows: [["jakarta", "503,890"], ["london", "527,350"], ["taipei", "511,120"]], total: "1,542,360" },
  },
  { t: "push", who: "maria", msg: { kind: "agent", text: "Done: 1,542,360 in Jakarta time (UTC would have said 1,620,060)." } },
  { t: "wait", ms: 1000 },

  // 5. It works both ways: Sarah's agent uses Maria's tool, and Maria's agent fixes it.
  { t: "chapter", i: 4 },
  ...typeAndSend("sarah", "Use Maria's sales pipeline for Q3, in rupiah"),
  { t: "push", who: "sarah", msg: { kind: "call", name: "run_tool", arg: '{"quarter":"Q3","currency":"IDR"}', status: "running" } },
  { t: "update", who: "sarah", name: "run_tool", patch: { status: "error", note: "Unknown input: currency" } },
  { t: "audit", entry: { who: "sarah", what: "run_tool sales-pipeline", ok: false } },
  { t: "push", who: "sarah", msg: { kind: "agent", text: "No currency input. Asking Maria's agent." } },
  { t: "push", who: "sarah", msg: { kind: "call", name: "request_change", arg: "add a currency input", status: "running" } },
  { t: "set", patch: { relay: "Sarah's agent → Maria's agent: can the sales pipeline report in another currency?" } },
  { t: "wait", ms: 400 },
  { t: "push", who: "maria", msg: { kind: "peer", from: "Sarah's agent", text: "Can the sales pipeline report in another currency? I need rupiah." } },
  { t: "push", who: "maria", msg: { kind: "agent", text: "Fine. Optional currency, default USD, so nothing changes for current users." } },
  { t: "push", who: "maria", msg: { kind: "call", name: "update_tool", arg: "sales-pipeline", status: "running" } },
  ...gateSteps("Sales pipeline v2"),
  { t: "update", who: "maria", name: "update_tool", patch: { status: "ok", note: "v2 deployed · v1 kept" } },
  { t: "tool", tool: { ...PIPELINE_V1, version: 2 } },
  { t: "audit", entry: { who: "maria", what: "update_tool sales-pipeline v2", ok: true } },
  { t: "set", patch: { gate: null, relay: null, toast: "v2 deployed · v1 kept" } },
  { t: "update", who: "sarah", name: "request_change", patch: { status: "ok", note: "v2 deployed" } },
  { t: "push", who: "sarah", msg: { kind: "call", name: "run_tool ", arg: '{"quarter":"Q3","currency":"IDR"}', status: "running" } },
  { t: "update", who: "sarah", name: "run_tool ", patch: { status: "ok", note: "v2" } },
  { t: "audit", entry: { who: "sarah", what: "run_tool sales-pipeline v2", ok: true } },
  {
    t: "push",
    who: "sarah",
    msg: { kind: "result", rows: [["enterprise", "Rp 9.6B"], ["mid-market", "Rp 4.1B"], ["self-serve", "Rp 1.2B"]], total: "Rp 14.9B" },
  },
  { t: "wait", ms: 1600 },
  { t: "set", patch: { toast: null } },
];

function reduce(s: State, a: Action): State {
  switch (a.t) {
    case "chapter":
      return { ...s, chapter: a.i };
    case "set":
      return { ...s, ...a.patch };
    case "type":
      return { ...s, prompts: { ...s.prompts, [a.who]: a.text } };
    case "push":
      return { ...s, chats: { ...s.chats, [a.who]: [...s.chats[a.who], a.msg] } };
    case "update": {
      const chat = [...s.chats[a.who]];
      for (let i = chat.length - 1; i >= 0; i--) {
        const m = chat[i];
        if (m.kind === "call" && m.name === a.name) {
          chat[i] = { ...m, ...a.patch };
          break;
        }
      }
      return { ...s, chats: { ...s.chats, [a.who]: chat } };
    }
    case "tool": {
      const exists = s.tools.some((t) => t.id === a.tool.id);
      return { ...s, tools: exists ? s.tools.map((t) => (t.id === a.tool.id ? a.tool : t)) : [a.tool, ...s.tools] };
    }
    case "audit":
      return { ...s, audit: [...s.audit, a.entry].slice(-4) };
    default:
      return s;
  }
}

const MOVE_MS = 420;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// A short timeout, not requestAnimationFrame, so the tour keeps going when the tab is in the background.
const nextFrame = () => sleep(30);

export function ProductTour() {
  const [s, setS] = useState<State>(INITIAL);
  const [cursor, setCursor] = useState({ x: 120, y: 120 });
  const [clicks, setClicks] = useState(0);
  const [paused, setPaused] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const pausedRef = useRef(false);

  const locate = (to: string) => {
    const stage = stageRef.current;
    const el = stage?.querySelector(`[data-tour="${to}"]`);
    if (!stage || !el) return null;
    const a = stage.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return { x: b.left - a.left + Math.min(b.width / 2, 40), y: b.top - a.top + b.height / 2 };
  };

  const play = useCallback(async (from: number) => {
    const my = ++token.current;
    const alive = async () => {
      while (pausedRef.current && my === token.current) await sleep(80);
      return my === token.current;
    };
    // Jump: apply every earlier step instantly, then animate from the chosen chapter.
    let i = 0;
    let start = INITIAL;
    for (; i < SCRIPT.length; i++) {
      const a = SCRIPT[i];
      if (a.t === "chapter" && a.i === from) break;
      start = reduce(start, a);
    }
    setS(start);
    for (; i < SCRIPT.length; i++) {
      if (!(await alive())) return;
      const a = SCRIPT[i];
      if (a.t === "move") {
        await nextFrame();
        const p = locate(a.to);
        if (p) setCursor(p);
        await sleep(MOVE_MS);
      } else if (a.t === "click") {
        setClicks((c) => c + 1);
        await sleep(170);
      } else if (a.t === "wait") {
        await sleep(a.ms);
      } else if (a.t === "type") {
        for (let k = 1; k <= a.text.length; k++) {
          if (my !== token.current) return;
          const part = a.text.slice(0, k);
          setS((p) => ({ ...p, prompts: { ...p.prompts, [a.who]: part } }));
          await sleep(16);
        }
      } else {
        setS((p) => reduce(p, a));
        if (a.t === "push" || a.t === "update") await sleep(280);
      }
    }
    await sleep(1200);
    if (my === token.current) setS((p) => ({ ...p, ended: true })); // the tour ends on the summary; "Watch again" replays it
  }, []);

  useEffect(() => {
    // Starts the autoplay: it sets state as it plays, on purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    play(0);
    return () => {
      token.current++;
    };
  }, [play]);

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };
  const jump = (i: number) => {
    pausedRef.current = false;
    setPaused(false);
    play(i);
  };

  return (
    <div className="space-y-4">
      <div ref={stageRef} className="relative overflow-hidden rounded-xl border bg-background shadow-sm select-none">
        <div className="grid md:grid-cols-2">
          <Computer who="sarah" chat={s.chats.sarah} prompt={s.prompts.sarah} className="border-b md:border-r md:border-b-0" />
          <Computer who="maria" chat={s.chats.maria} prompt={s.prompts.maria} />
        </div>

        {/* Town Hall, between the two computers' agents */}
        <div className="relative space-y-2 border-t bg-muted/40 p-3">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span className="flex items-center gap-1.5">
              <Landmark className="size-4" />
              Town Hall
              <span className="text-xs font-normal text-muted-foreground">· shared tools, one MCP, every call logged</span>
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-[1.3fr_1fr]">
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                {s.tools.map((t) => (
                  <Card key={t.id} size="sm" className="animate-in fade-in-0 zoom-in-95">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <CardTitle>{t.name}</CardTitle>
                        <Badge key={t.version} variant={t.version === 2 ? "default" : "secondary"} className="animate-in zoom-in-50">
                          v{t.version}
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-1.5">
                        owner {t.owner.toLowerCase()} · <Lock className="size-3" />
                        {t.access}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
              <div className="min-h-[52px] rounded-md border bg-background p-2 text-xs">
                {s.gate ? (
                  <div className="animate-in fade-in-0">
                    <div className="mb-1 flex items-center gap-1.5 font-medium">
                      <ShieldCheck className="size-3.5" />
                      Deploy gate · {s.gate.tool}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {GATE.map((g, i) => (
                        <span key={g} className={i < s.gate!.n ? "flex items-center gap-1" : "flex items-center gap-1 text-muted-foreground"}>
                          {i < s.gate!.n ? <Check className="size-3 text-emerald-600" /> : <Loader2 className="size-3 animate-spin" />}
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : s.relay ? (
                  <div className="flex items-center gap-1.5 animate-in fade-in-0 slide-in-from-left-2">
                    <Sparkles className="size-3.5 shrink-0" />
                    {s.relay}
                  </div>
                ) : (
                  <span className="text-muted-foreground">Agents can ask each other to change a tool. A deploy gate checks every change.</span>
                )}
              </div>
            </div>
            <div className="rounded-md border bg-background p-2 font-mono text-[11px]">
              <div className="mb-1 font-sans text-xs font-medium">Audit log</div>
              {s.audit.length === 0 && <div className="text-muted-foreground">No runs yet.</div>}
              {s.audit.map((a, i) => (
                <div key={`${i}-${a.what}`} className="flex items-center gap-1.5 truncate animate-in fade-in-0">
                  {a.ok ? <Check className="size-3 shrink-0 text-emerald-600" /> : <CircleAlert className="size-3 shrink-0 text-destructive" />}
                  <span className="font-semibold">{a.who}</span>
                  <span className="truncate text-muted-foreground">{a.what}</span>
                </div>
              ))}
            </div>
          </div>
          {s.toast && (
            <div className="absolute right-3 -top-10 z-20 flex items-center gap-1.5 rounded-md border bg-popover px-3 py-2 text-xs shadow-md animate-in fade-in-0 slide-in-from-bottom-2">
              <Check className="size-3.5 text-emerald-600" />
              {s.toast}
            </div>
          )}
        </div>

        {!s.ended && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div key={s.chapter} className="text-center opacity-15 animate-in fade-in-0 zoom-in-95 duration-700">
              <div className="text-xl font-medium tracking-widest uppercase">Step {s.chapter + 1} of {CHAPTERS.length}</div>
              <div className="text-5xl font-bold md:text-7xl">{CHAPTERS[s.chapter]}</div>
            </div>
          </div>
        )}

        {s.ended && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/95 p-6 animate-in fade-in-0">
            <div className="max-w-xl space-y-4">
              <h2 className="text-xl font-semibold">Your agent can talk to the tool creator&apos;s agent</h2>
              <p className="text-sm text-muted-foreground">
                When a tool needs a new format or requirement, your agent doesn&apos;t guess and doesn&apos;t regenerate its own copy. It consults the agent that owns the tool.
              </p>
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                <li>Your agent asks the creator&apos;s agent whether the tool should change to meet the new format or requirement.</li>
                <li>The creator&apos;s agent reasons about it and decides: update the tool, or explain why not.</li>
                <li>If it updates, a deploy gate checks the new version against recorded examples before it goes live.</li>
                <li>The old version stays available, and your agent uses the new field right after the deploy.</li>
                <li>Company SSO on every tool, so every call has a real person and agent behind it.</li>
                <li>Granular control: tools are limited to departments and roles, and data access is scoped and read-only.</li>
                <li>Every run, change and refused attempt is in the audit log, and every tool has an owner.</li>
              </ul>
              <Button size="sm" onClick={() => jump(0)}>
                <RotateCcw />
                Watch again
              </Button>
            </div>
          </div>
        )}

        {/* Fake cursor */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-30 transition-transform ease-out motion-reduce:transition-none"
          style={{ transform: `translate(${cursor.x - 3}px, ${cursor.y - 2}px)`, transitionDuration: `${MOVE_MS}ms` }}
        >
          {clicks > 0 && (
            <span key={clicks} className="absolute -top-2 -left-2 size-7 rounded-full bg-primary/40 animate-[ping_450ms_ease-out_1_forwards]" />
          )}
          <MousePointer2 className="size-5 fill-foreground stroke-background drop-shadow" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={togglePause} aria-label={paused ? "Play" : "Pause"}>
          {paused ? <Play /> : <Pause />}
          {paused ? "Play" : "Pause"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => jump(0)}>
          <RotateCcw />
          Restart
        </Button>
        <div className="flex flex-wrap gap-1.5">
          {CHAPTERS.map((c, i) => (
            <Button key={c} size="sm" variant={s.chapter === i ? "default" : "ghost"} onClick={() => jump(i)}>
              {i + 1}. {c}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatLine({ m }: { m: Msg }) {
  if (m.kind === "user")
    return (
      <div className="flex justify-end animate-in fade-in-0 slide-in-from-bottom-1">
        <div className="max-w-[85%] rounded-lg bg-primary px-2.5 py-1.5 text-primary-foreground">{m.text}</div>
      </div>
    );
  if (m.kind === "agent") return <p className="animate-in fade-in-0">{m.text}</p>;
  if (m.kind === "peer")
    return (
      <div className="rounded-md border border-dashed bg-background p-2 animate-in fade-in-0 slide-in-from-left-1">
        <div className="mb-0.5 flex items-center gap-1 font-medium">
          <Sparkles className="size-3.5" />
          From {m.from}
        </div>
        {m.text}
      </div>
    );
  if (m.kind === "result")
    return (
      <div className="rounded-md border bg-background p-2 font-mono animate-in fade-in-0">
        {m.rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
          <span>total</span>
          <span>{m.total}</span>
        </div>
      </div>
    );
  return (
    <div className="flex items-start gap-1.5 font-mono animate-in fade-in-0">
      <Wrench className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <span className="font-semibold">{m.name.trim()}</span>
        <span className="text-muted-foreground"> {m.arg}</span>
        {m.note && (
          <div className={m.status === "error" ? "text-destructive" : "text-muted-foreground"}>
            {m.status === "error" ? "✕" : "→"} {m.note}
          </div>
        )}
      </div>
      <span className="ml-auto shrink-0">
        {m.status === "running" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : m.status === "ok" ? (
          <Check className="size-3.5 text-emerald-600" />
        ) : (
          <CircleAlert className="size-3.5 text-destructive" />
        )}
      </span>
    </div>
  );
}


function Computer({ who, chat, prompt, className = "" }: { who: Who; chat: Msg[]; prompt: string; className?: string }) {
  const p = PEOPLE[who];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [chat]);
  return (
    <div className={`flex h-[360px] flex-col bg-muted/20 ${className}`}>
      <div className="flex h-10 items-center justify-between border-b px-3 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <Bot className="size-4" />
          {p.name}&apos;s Claude
        </span>
        <span className="text-xs text-muted-foreground">
          {p.name} · {p.dept}
        </span>
      </div>
      <div ref={ref} className="flex-1 space-y-2 overflow-y-auto p-3 text-xs">
        {chat.length === 0 && <p className="pt-14 text-center text-muted-foreground">{p.name}&apos;s own computer, connected to Town Hall over MCP.</p>}
        {chat.map((m, i) => (
          <ChatLine key={i} m={m} />
        ))}
      </div>
      <div className="flex gap-2 border-t p-2">
        <Input data-tour={`${who}-input`} readOnly value={prompt} placeholder="Ask Claude…" className="h-8 text-xs" />
        <Button size="icon-sm" data-tour={`${who}-send`} aria-label="Send">
          <SendHorizontal />
        </Button>
      </div>
    </div>
  );
}
