import type { Failure, Identity } from "./types";

/**
 * Mock access control. A hardcoded company directory maps each person to one department, and a
 * tool lists the departments allowed to use it. This is a demo stand-in for company login: the
 * person is whoever the MCP headers or the UI's "viewing as" switch say, with no authentication.
 */
export const DEPARTMENTS = ["engineering", "marketing", "sales", "legal"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  engineering: "Engineering",
  marketing: "Marketing",
  sales: "Sales",
  legal: "Legal",
};

export type Person = { user: string; name: string; department: Department };

export const DIRECTORY: Person[] = [
  { user: "sarah", name: "Sarah", department: "engineering" },
  { user: "maria", name: "Maria", department: "sales" },
  { user: "alex", name: "Alex", department: "marketing" },
  { user: "priya", name: "Priya", department: "legal" },
];

export const findPerson = (user: string): Person | null => DIRECTORY.find((p) => p.user === user) ?? null;
export const departmentOf = (user: string): Department | null => findPerson(user)?.department ?? null;
export const isDepartment = (d: unknown): d is Department => typeof d === "string" && (DEPARTMENTS as readonly string[]).includes(d);

/** Human label for a tool's access list. An empty list means every department. */
export const accessLabel = (access: string[]): string =>
  access.length === 0 ? "Everyone" : access.map((d) => (isDepartment(d) ? DEPARTMENT_LABELS[d] : d)).join(", ");

/** Who can use a tool: its owner always; otherwise anyone in a listed department; everyone when the list is empty. */
export function canAccess(identity: Identity, tool: { owner: string; access: string[] }): boolean {
  if (identity.user === tool.owner) return true;
  if (tool.access.length === 0) return true;
  const dept = departmentOf(identity.user);
  return dept !== null && tool.access.includes(dept);
}

export const DENIED_PREFIX = "Access denied";

/** A `forbidden` failure that tells the agent why, so it can explain it to the person. */
export function accessDenied(identity: Identity, tool: { name: string; owner: string; access: string[] }): Failure {
  const dept = departmentOf(identity.user);
  const who = dept ? `${identity.user} is in ${DEPARTMENT_LABELS[dept]}` : `${identity.user} is not in the company directory`;
  return {
    ok: false,
    code: "forbidden",
    error: `${DENIED_PREFIX}: "${tool.name}" is restricted to ${accessLabel(tool.access)}, and ${who}. Ask the owner (${tool.owner}) for access.`,
  };
}

/** Validates and normalizes a requested access list: known departments only, deduplicated, in directory order. */
export function normalizeAccess(access: unknown): { ok: true; access: Department[] } | { ok: false; error: string } {
  if (access === undefined || access === null) return { ok: true, access: [] };
  if (!Array.isArray(access)) return { ok: false, error: `access must be a list of departments: ${DEPARTMENTS.join(", ")}` };
  const bad = access.filter((d) => !isDepartment(d));
  if (bad.length) return { ok: false, error: `Unknown department: ${bad.join(", ")}. Departments: ${DEPARTMENTS.join(", ")}.` };
  return { ok: true, access: DEPARTMENTS.filter((d) => access.includes(d)) };
}
