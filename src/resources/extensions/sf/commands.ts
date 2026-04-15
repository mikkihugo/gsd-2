export { registerSFCommand } from "./commands/index.js";

export async function handleSFCommand(
  ...args: Parameters<typeof import("./commands/dispatcher.js").handleSFCommand>
) {
  const { handleSFCommand: dispatch } = await import("./commands/dispatcher.js");
  return dispatch(...args);
}

export async function fireStatusViaCommand(
  ...args: Parameters<typeof import("./commands/handlers/core.js").fireStatusViaCommand>
) {
  const { fireStatusViaCommand: fireStatus } = await import(
    "./commands/handlers/core.js"
  );
  return fireStatus(...args);
}
