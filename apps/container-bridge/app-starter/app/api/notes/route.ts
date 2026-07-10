const notes: Array<{ id: string; text: string }> = [];

export async function GET() {
  return Response.json({ notes });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: unknown };
  const note = { id: crypto.randomUUID(), text: String(body.text ?? "") };
  notes.push(note);
  return Response.json({ note }, { status: 201 });
}
