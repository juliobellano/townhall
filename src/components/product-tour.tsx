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
  Upload,
  UserRound,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

/*
 * A scripted, autoplaying walkthrough of Town Hall with a fake cursor. Nothing here calls the
 * backend: the script below drives a mock of the real screens, so it always plays the same way.
 */

type Viewer = "sarah" | "maria" | "alex";
type Msg =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "call"; name: string; arg: string; status: "running" | "ok" | "error"; note?: string }
  | { kind: "creator"; text: string }
  | { kind: "result"; rows: [string, string][]; total: string };

type State = {
  chapter: number;
  viewer: Viewer;
  menu: boolean;
  dialog: boolean;
  name: string;
  access: string[];
  published: boolean;
  version: 1 | 2;
  gate: number; // -1 hidden, else checks passed so far
  toast: string | null;
  prompt: string;
  chat: Msg[];
  ended: boolean; // the script finished: show the summary
};

type Action =
  | { t: "chapter"; i: number }
  | { t: "move"; to: string }
  | { t: "click" }
  | { t: "wait"; ms: number }
  | { t: "set"; patch: Partial<State> }
  | { t: "type"; field: "name" | "prompt"; text: string }
  | { t: "push"; msg: Msg }
  | { t: "update"; name: string; patch: Partial<Extract<Msg, { kind: "call" }>> };

const INITIAL: State = {
  chapter: 0,
  viewer: "sarah",
  menu: false,
  dialog: false,
  name: "",
  access: [],
  published: false,
  version: 1,
  gate: -1,
  toast: null,
  prompt: "",
  chat: [],
  ended: false,
};

const PEOPLE: Record<Viewer, { name: string; dept: string }> = {
  sarah: { name: "Sarah", dept: "Engineering" },
  maria: { name: "Maria", dept: "Sales" },
  alex: { name: "Alex", dept: "Marketing" },
};
const DEPTS = ["Engineering", "Marketing", "Sales", "Legal"];
const GATE = ["Tool contract", "Only adds an optional input", "Source scan", "Same output on old examples", "Recorded expectations"];
const CHAPTERS = ["Share a tool", "Agent uses it", "Agent asks the creator", "v2 is live", "Access control"];

const SCRIPT: Action[] = [
  // 1. Sarah shares her tool from the web UI.
  { t: "chapter", i: 0 },
  { t: "move", to: "deploy" },
  { t: "click" },
  { t: "set", patch: { dialog: true } },
  { t: "move", to: "name" },
  { t: "click" },
  { t: "type", field: "name", text: "Tax filing report" },
  { t: "move", to: "dept-Engineering" },
  { t: "click" },
  { t: "set", patch: { access: ["Engineering"] } },
  { t: "move", to: "dept-Sales" },
  { t: "click" },
  { t: "set", patch: { access: ["Engineering", "Sales"] } },
  { t: "move", to: "dialog-deploy" },
  { t: "click" },
  { t: "set", patch: { dialog: false, published: true, toast: "Deployed v1 · MCP ready" } },
  { t: "wait", ms: 900 },
  { t: "set", patch: { toast: null } },

  // 2. Maria's Claude finds it and runs it, but she needs Jakarta time.
  { t: "chapter", i: 1 },
  { t: "set", patch: { viewer: "maria" } },
  { t: "move", to: "chat-input" },
  { t: "click" },
  { t: "type", field: "prompt", text: "October tax filing report, Jakarta time" },
  { t: "move", to: "chat-send" },
  { t: "click" },
  { t: "push", msg: { kind: "user", text: "October tax filing report, Jakarta time" } },
  { t: "set", patch: { prompt: "" } },
  { t: "push", msg: { kind: "call", name: "search_tools", arg: "tax filing", status: "running" } },
  { t: "update", name: "search_tools", patch: { status: "ok", note: "1 tool" } },
  { t: "push", msg: { kind: "call", name: "get_tool", arg: "tax-filing-report", status: "running" } },
  { t: "update", name: "get_tool", patch: { status: "ok", note: "inputs: month, branches" } },
  { t: "push", msg: { kind: "call", name: "run_tool", arg: '{"month":"2026-10","timezone":"Asia/Jakarta"}', status: "running" } },
  { t: "update", name: "run_tool", patch: { status: "error", note: "Unknown input: timezone" } },
  { t: "wait", ms: 500 },

  // 3. The agent asks the tool's creator agent; the deploy gate checks the change.
  { t: "chapter", i: 2 },
  { t: "push", msg: { kind: "agent", text: "No timezone input yet. Asking the tool's creator agent." } },
  { t: "push", msg: { kind: "call", name: "request_change", arg: "add a timezone input", status: "running" } },
  { t: "wait", ms: 400 },
  { t: "push", msg: { kind: "creator", text: "Accepted. Optional timezone, default UTC, so existing results don't change." } },
  { t: "set", patch: { gate: 0 } },
  { t: "wait", ms: 200 },
  { t: "set", patch: { gate: 1 } },
  { t: "wait", ms: 200 },
  { t: "set", patch: { gate: 2 } },
  { t: "wait", ms: 200 },
  { t: "set", patch: { gate: 3 } },
  { t: "wait", ms: 200 },
  { t: "set", patch: { gate: 4 } },
  { t: "wait", ms: 200 },
  { t: "set", patch: { gate: 5, version: 2, toast: "v2 deployed · v1 kept" } },
  { t: "update", name: "request_change", patch: { status: "ok", note: "v2 deployed" } },
  { t: "wait", ms: 700 },
  { t: "set", patch: { toast: null } },

  // 4. The agent uses v2 right away.
  { t: "chapter", i: 3 },
  { t: "push", msg: { kind: "call", name: "run_tool ", arg: '{"month":"2026-10","timezone":"Asia/Jakarta"}', status: "running" } },
  { t: "update", name: "run_tool ", patch: { status: "ok", note: "v2" } },
  {
    t: "push",
    msg: { kind: "result", rows: [["jakarta", "503,890"], ["london", "527,350"], ["taipei", "511,120"]], total: "1,542,360" },
  },
  { t: "push", msg: { kind: "agent", text: "Done: 1,542,360 in Jakarta time (UTC would have said 1,620,060)." } },
  { t: "wait", ms: 1100 },

  // 5. Someone outside Engineering and Sales can't see or run it.
  { t: "chapter", i: 4 },
  { t: "move", to: "viewer" },
  { t: "click" },
  { t: "set", patch: { menu: true } },
  { t: "move", to: "viewer-alex" },
  { t: "click" },
  { t: "set", patch: { menu: false, viewer: "alex", chat: [], gate: -1 } },
  { t: "wait", ms: 300 },
  { t: "move", to: "chat-input" },
  { t: "click" },
  { t: "type", field: "prompt", text: "Run the tax filing report" },
  { t: "move", to: "chat-send" },
  { t: "click" },
  { t: "push", msg: { kind: "user", text: "Run the tax filing report" } },
  { t: "set", patch: { prompt: "" } },
  { t: "push", msg: { kind: "call", name: "run_tool", arg: "tax-filing-report", status: "running" } },
  { t: "update", name: "run_tool", patch: { status: "error", note: "forbidden: restricted to Engineering, Sales" } },
  { t: "wait", ms: 1600 },
];

function reduce(s: State, a: Action): State {
  switch (a.t) {
    case "chapter":
      return { ...s, chapter: a.i };
    case "set":
      return { ...s, ...a.patch };
    case "type":
      return { ...s, [a.field]: a.text };
    case "push":
      return { ...s, chat: [...s.chat, a.msg] };
    case "update": {
      const chat = [...s.chat];
      for (let i = chat.length - 1; i >= 0; i--) {
        const m = chat[i];
        if (m.kind === "call" && m.name === a.name) {
          chat[i] = { ...m, ...a.patch };
          break;
        }
      }
      return { ...s, chat };
    }
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
  const chatRef = useRef<HTMLDivElement>(null);
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
          setS((p) => ({ ...p, [a.field]: part }));
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

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [s.chat]);

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };
  const jump = (i: number) => {
    pausedRef.current = false;
    setPaused(false);
    play(i);
  };

  const me = PEOPLE[s.viewer];
  const canSee = s.viewer !== "alex";

  return (
    <div className="space-y-4">
      <div ref={stageRef} className="relative overflow-hidden rounded-xl border bg-background shadow-sm select-none">
        <div className="grid md:grid-cols-[1.35fr_1fr]">
          {/* The Town Hall web UI */}
          <div className="relative flex h-[440px] flex-col border-b md:border-r md:border-b-0">
            <div className="flex h-11 items-center justify-between border-b px-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Landmark className="size-4" />
                Town Hall
              </div>
              <div className="relative">
                <div data-tour="viewer" className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                  <UserRound className="size-3.5" />
                  {me.name} · {me.dept}
                </div>
                {s.menu && (
                  <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border bg-popover p-1 text-xs shadow-md">
                    {(Object.keys(PEOPLE) as Viewer[]).map((v) => (
                      <div key={v} data-tour={`viewer-${v}`} className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted">
                        {PEOPLE[v].name} · {PEOPLE[v].dept}
                        {v === s.viewer && <Check className="size-3" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-hidden p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold">Tools</div>
                  <div className="text-xs text-muted-foreground">Usable by people here and by their agents over MCP.</div>
                </div>
                <Button size="sm" data-tour="deploy">
                  <Upload />
                  Deploy a tool
                </Button>
              </div>

              {!s.published && <p className="text-xs text-muted-foreground">No tools yet.</p>}
              {s.published && canSee && (
                <Card size="sm" className="animate-in fade-in-0 zoom-in-95">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CardTitle>Tax filing report</CardTitle>
                      <Badge key={s.version} variant={s.version === 2 ? "default" : "secondary"} className="animate-in zoom-in-50">
                        v{s.version}
                      </Badge>
                    </div>
                    <CardDescription>owner sarah</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <p>Monthly sales totals per branch, plus the tax-filing.pdf.</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">
                        <Lock />
                        Engineering, Sales
                      </Badge>
                      <Badge variant="outline">branch databases (read only)</Badge>
                    </div>
                  </CardContent>
                </Card>
              )}
              {s.published && !canSee && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground animate-in fade-in-0">
                  <Lock className="size-3.5" />1 tool is restricted to other departments and not shown.
                </p>
              )}

              {s.gate >= 0 && canSee && (
                <Card size="sm" className="animate-in fade-in-0 slide-in-from-bottom-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-1.5 text-sm">
                      <ShieldCheck className="size-4" />
                      Change from maria&apos;s agent · deploy gate
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                    {GATE.map((g, i) => (
                      <div key={g} className={i < s.gate ? "flex items-center gap-1.5" : "flex items-center gap-1.5 text-muted-foreground"}>
                        {i < s.gate ? <Check className="size-3.5 text-emerald-600" /> : <Loader2 className="size-3.5 animate-spin" />}
                        {g}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {s.dialog && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 p-4 animate-in fade-in-0">
                <Card className="w-full max-w-sm animate-in zoom-in-95">
                  <CardHeader>
                    <CardTitle>Deploy a tool</CardTitle>
                    <CardDescription>A Python script with its own input schema.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="space-y-1">
                      <div className="text-xs font-medium">Name</div>
                      <Input data-tour="name" readOnly value={s.name} placeholder="Tool name" className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium">Who can use it</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {DEPTS.map((d) => (
                          <label key={d} data-tour={`dept-${d}`} className="flex items-center gap-1.5 text-xs">
                            <Checkbox checked={s.access.includes(d)} tabIndex={-1} />
                            {d}
                          </label>
                        ))}
                      </div>
                    </div>
                    <Button size="sm" data-tour="dialog-deploy">
                      <Upload />
                      Deploy
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {s.toast && (
              <div className="absolute right-3 bottom-3 z-20 flex items-center gap-1.5 rounded-md border bg-popover px-3 py-2 text-xs shadow-md animate-in fade-in-0 slide-in-from-bottom-2">
                <Check className="size-3.5 text-emerald-600" />
                {s.toast}
              </div>
            )}
          </div>

          {/* The person's agent, talking to Town Hall over MCP */}
          <div className="flex h-[440px] flex-col bg-muted/30">
            <div className="flex h-11 items-center gap-1.5 border-b px-3 text-sm font-medium">
              <Bot className="size-4" />
              {me.name}&apos;s Claude
              <span className="text-xs font-normal text-muted-foreground">· Town Hall MCP</span>
            </div>
            <div ref={chatRef} className="flex-1 space-y-2 overflow-y-auto p-3 text-xs">
              {s.chat.length === 0 && (
                <p className="pt-16 text-center text-muted-foreground">Agents reach the same tools over MCP, with the person&apos;s permissions.</p>
              )}
              {s.chat.map((m, i) => (
                <ChatLine key={i} m={m} />
              ))}
            </div>
            <div className="flex gap-2 border-t p-2">
              <Input data-tour="chat-input" readOnly value={s.prompt} placeholder="Ask Claude…" className="h-8 text-xs" />
              <Button size="icon-sm" data-tour="chat-send" aria-label="Send">
                <SendHorizontal />
              </Button>
            </div>
          </div>
        </div>

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
  if (m.kind === "creator")
    return (
      <div className="rounded-md border bg-background p-2 animate-in fade-in-0 slide-in-from-left-1">
        <div className="mb-0.5 flex items-center gap-1 font-medium">
          <Sparkles className="size-3.5" />
          Sarah&apos;s creator agent
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

