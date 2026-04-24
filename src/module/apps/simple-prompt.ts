// Spawn a simple dialogue to edit a string. Returns null on close
export function promptText(title: string, prefill: string = ""): Promise<string | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    classes: ["lancer"],
    content: `<div class="form-group"><input type="text" name="text" style="width: 100%;" value="${prefill}"></div><hr>`,
    ok: {
      label: "Confirm",
      callback: (_event: PointerEvent | SubmitEvent, button: HTMLButtonElement) =>
        (button.form?.elements.namedItem("text") as HTMLInputElement | null)?.value ?? "",
    },
    rejectClose: false,
  });
}
