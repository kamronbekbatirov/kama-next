import type {
  LearnMethodEntry,
  LearnNode,
  LearnSession,
  LearnSubject,
  MethodKind,
  ReviewQueueItem,
} from "./types";

async function jfetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  return res.json();
}
function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  };
}

export const learnApi = {
  // subjects
  listSubjects: () => jfetch<LearnSubject[]>("/api/dashboard/learn/subjects"),
  createSubject: (data: { title: string; emoji?: string; description?: string }) =>
    jfetch<LearnSubject>("/api/dashboard/learn/subjects", json("POST", data)),
  updateSubject: (id: number, data: Partial<LearnSubject>) =>
    jfetch<{ ok: true }>("/api/dashboard/learn/subjects", json("PATCH", { id, ...data })),
  deleteSubject: (id: number) =>
    jfetch<{ ok: true }>("/api/dashboard/learn/subjects", json("DELETE", { id })),

  // nodes
  listNodes: (subjectId: number) =>
    jfetch<LearnNode[]>(`/api/dashboard/learn/nodes?subject_id=${subjectId}`),
  createNode: (data: {
    subject_id: number;
    parent_id: number | null;
    title: string;
    description?: string;
  }) => jfetch<LearnNode>("/api/dashboard/learn/nodes", json("POST", data)),
  updateNode: (id: number, data: Partial<LearnNode>) =>
    jfetch<{ ok: true }>("/api/dashboard/learn/nodes", json("PATCH", { id, ...data })),
  deleteNode: (id: number) =>
    jfetch<{ ok: true }>("/api/dashboard/learn/nodes", json("DELETE", { id })),

  // sessions
  listSessions: (nodeId: number) =>
    jfetch<LearnSession[]>(`/api/dashboard/learn/sessions?node_id=${nodeId}`),
  createSession: (data: { node_id: number; recall_score: number; notes?: string }) =>
    jfetch<{
      session: LearnSession;
      node_update: Partial<LearnNode>;
    }>("/api/dashboard/learn/sessions", json("POST", data)),

  // methods
  listMethods: (method?: MethodKind) =>
    jfetch<LearnMethodEntry[]>(
      `/api/dashboard/learn/methods${method ? `?method=${method}` : ""}`,
    ),
  createMethod: (data: {
    method: MethodKind;
    title?: string;
    data: Record<string, unknown>;
    subject_id?: number;
    node_id?: number;
  }) => jfetch<LearnMethodEntry>("/api/dashboard/learn/methods", json("POST", data)),
  updateMethod: (id: number, data: Partial<LearnMethodEntry>) =>
    jfetch<{ ok: true }>("/api/dashboard/learn/methods", json("PATCH", { id, ...data })),
  deleteMethod: (id: number) =>
    jfetch<{ ok: true }>("/api/dashboard/learn/methods", json("DELETE", { id })),

  // queue
  reviewQueue: () => jfetch<ReviewQueueItem[]>("/api/dashboard/learn/review-queue"),
};
