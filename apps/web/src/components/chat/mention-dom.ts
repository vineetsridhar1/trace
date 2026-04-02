/** Create a DOM element for the mention autocomplete dropdown */
export function createCustomUserElement(
  text: string,
  avatarUrl?: string | null,
  isCurrentUser?: boolean,
): HTMLElement {
  const div = document.createElement("div");
  div.className = "user-item-container flex gap-2 items-center";

  if (avatarUrl) {
    const img = document.createElement("img");
    img.className = "user-item-avatar w-5 h-5 rounded-full object-cover";
    img.src = avatarUrl;
    img.alt = "";
    div.append(img);
  } else {
    const initialsDiv = document.createElement("div");
    initialsDiv.className =
      "user-item-avatar-initials size-5 flex items-center justify-center rounded-full text-[10px] bg-blue-900 text-blue-200";
    initialsDiv.textContent = text
      .split(" ")
      .map((n) => n[0])
      .join("");
    div.append(initialsDiv);
  }

  const name = document.createElement("span");
  name.className = "user-item-name";
  name.textContent = isCurrentUser ? `${text} (you)` : text;
  div.append(name);

  return div;
}

/** Create a DOM element for the slash command autocomplete dropdown */
export function createSlashCommandElement(name: string, description: string): HTMLElement {
  const div = document.createElement("div");
  div.className = "slash-command-item flex items-center gap-2";

  const nameSpan = document.createElement("span");
  nameSpan.className = "slash-command-name font-mono text-sm text-foreground";
  nameSpan.textContent = `/${name}`;
  div.append(nameSpan);

  const descSpan = document.createElement("span");
  descSpan.className = "slash-command-desc text-xs text-muted-foreground";
  descSpan.textContent = description;
  div.append(descSpan);

  return div;
}
